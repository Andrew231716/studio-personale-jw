/** Trascrizione registrazioni Discorso via /api/ai-transcribe (Gemini). */

import { aiRequestExtras } from './ai'

/** Limite pratico body JSON / Vercel (~4.5 MB). */
const MAX_BYTES = 3_500_000
const CLIP_SECONDS = 90
const SAMPLE_RATE = 16_000
const CLIP_GAP_MS = 1800
const MAX_RETRIES = 5

export interface TranscriptSegment {
  start: number
  speaker: string
  text: string
}

export interface TranscriptProgress {
  language: string
  nextPart: number
  total: number
  segments: TranscriptSegment[]
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(signal?.reason || new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function wavClip(audio: AudioBuffer, start: number, end: number) {
  const samples = end - start
  const data = new DataView(new ArrayBuffer(44 + samples * 2))
  for (const [offset, label] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) {
    Array.from(label).forEach((character, index) => data.setUint8(offset + index, character.charCodeAt(0)))
  }
  data.setUint32(4, data.byteLength - 8, true)
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, 1, true)
  data.setUint32(24, SAMPLE_RATE, true)
  data.setUint32(28, SAMPLE_RATE * 2, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  data.setUint32(40, samples * 2, true)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index))
  for (let index = 0; index < samples; index++) {
    const value = channels.reduce((sum, channel) => sum + channel[start + index], 0) / channels.length
    data.setInt16(44 + index * 2, Math.max(-1, Math.min(1, value)) * 32767, true)
  }
  return new Blob([data.buffer], { type: 'audio/wav' })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const i = dataUrl.indexOf(',')
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error || new Error('Lettura audio fallita'))
    reader.readAsDataURL(blob)
  })
}

function isQuotaError(message: string, status?: number) {
  return status === 429 || /limite gemini|quota|rate limit|riprova più tardi/i.test(message)
}

async function transcribeClip(
  blob: Blob,
  opts: { language?: string; signal?: AbortSignal },
  speakerOffset = 0,
) {
  const audioBase64 = await blobToBase64(blob)
  const extras = aiRequestExtras()
  let lastError = 'Trascrizione non riuscita.'

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    opts.signal?.throwIfAborted()
    const res = await fetch('/api/ai-transcribe', {
      method: 'POST',
      headers: extras.headers,
      signal: opts.signal || AbortSignal.timeout(95_000),
      body: JSON.stringify({
        audioBase64,
        mimeType: blob.type || 'audio/webm',
        language: opts.language || 'auto',
        speakerOffset,
        provider: extras.provider,
        model: 'gemini-2.5-flash',
        geminiApiKeys: extras.geminiKeys,
      }),
    })
    if (res.ok) {
      return (await res.json()) as { text: string; segments: TranscriptSegment[]; engine: string }
    }
    const detail = (await res.text().catch(() => '')).trim()
    lastError = detail || `Trascrizione non riuscita (HTTP ${res.status}).`
    if (!isQuotaError(lastError, res.status) || attempt === MAX_RETRIES - 1) {
      throw new Error(lastError)
    }
    // Backoff: 8s, 16s, 32s, 48s…
    await sleep(Math.min(60_000, 8000 * 2 ** attempt), opts.signal)
  }
  throw new Error(lastError)
}

export async function transcribeDiscourseAudio(
  blob: Blob,
  opts: {
    language?: string
    signal?: AbortSignal
    durationMs?: number
    forceDecode?: boolean
    onProgress?: (part: number, total: number) => void
    resume?: TranscriptProgress
    saveProgress?: (progress: TranscriptProgress) => Promise<void>
  } = {},
) {
  if (!navigator.onLine) throw new Error('Serve connessione per trascrivere la registrazione.')
  let segments: TranscriptSegment[]
  if (!opts.forceDecode && blob.size <= MAX_BYTES && (opts.durationMs ?? Infinity) <= CLIP_SECONDS * 1000) {
    segments = (await transcribeClip(blob, opts)).segments
  } else {
    let audio: AudioBuffer
    try {
      const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
      audio = await context.decodeAudioData(await blob.arrayBuffer())
    } catch {
      throw new Error('Il browser non riesce a leggere questo formato. Prova con MP3, WAV o M4A.')
    }
    const clipSize = CLIP_SECONDS * SAMPLE_RATE
    const total = Math.ceil(audio.length / clipSize)
    const language = opts.language || 'auto'
    const resume = opts.resume?.language === language && opts.resume.total === total ? opts.resume : undefined
    segments = [...(resume?.segments || [])]
    let speakerOffset = segments.reduce((max, item) => Math.max(max, Number(item.speaker.split(' ').at(-1)) || 0), 0)
    for (let part = resume?.nextPart ?? 0; part < total; part++) {
      const start = part * clipSize
      opts.signal?.throwIfAborted()
      opts.onProgress?.(part + 1, total)
      if (part > (resume?.nextPart ?? 0)) {
        await sleep(CLIP_GAP_MS, opts.signal)
      }
      const clip = wavClip(audio, start, Math.min(audio.length, start + clipSize))
      const result = await transcribeClip(clip, opts, speakerOffset)
      for (const segment of result.segments) {
        segments.push({ ...segment, start: start / SAMPLE_RATE + segment.start })
      }
      speakerOffset = Math.max(
        speakerOffset,
        ...result.segments.map((segment) => Number(segment.speaker.split(' ').at(-1)) || 0),
      )
      await opts.saveProgress?.({ language, nextPart: part + 1, total, segments })
    }
  }
  const text = segments.map((segment) => segment.text).join('\n')
  if (!text) throw new Error('Nessun testo riconosciuto nell’audio.')
  return { text, segments }
}
