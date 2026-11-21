/**
 * Trascrizione Discorso fino a ~300 minuti:
 * pezzi ~100s, rotazione chiavi, preferenza Groq su file lunghi, backoff paziente.
 */

import { aiRequestExtras } from './ai'
import { TRANSCRIBE_TARGET_MINUTES } from './transcribeCapacity'
import {
  CLIP_HOP_SECONDS,
  CLIP_SECONDS,
  filterOverlapSegments,
} from './transcriptClips'

export {
  CLIP_HOP_SECONDS,
  CLIP_OVERLAP_SECONDS,
  CLIP_SECONDS,
  filterOverlapSegments,
} from './transcriptClips'

/** Limite pratico body JSON / Vercel (~4.5 MB). */
const MAX_BYTES = 3_500_000
const SAMPLE_RATE = 16_000
const CLIP_GAP_MS = 2200
const MAX_RETRIES_SHORT = 5
const MAX_RETRIES_LONG = 14
const MAX_DURATION_MS = TRANSCRIBE_TARGET_MINUTES * 60 * 1000

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

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length <= 1) return items
  const i = ((offset % items.length) + items.length) % items.length
  return [...items.slice(i), ...items.slice(0, i)]
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
  return (
    status === 429 ||
    /limite|quota|rate limit|riprova più tardi|troppo (tante|molte) richiest/i.test(message)
  )
}

async function transcribeClip(
  blob: Blob,
  opts: {
    language?: string
    signal?: AbortSignal
    longForm?: boolean
    keyOffset?: number
    onWait?: (seconds: number) => void
  },
  speakerOffset = 0,
) {
  const audioBase64 = await blobToBase64(blob)
  const extras = aiRequestExtras()
  const geminiApiKeys = rotate(extras.geminiKeys, opts.keyOffset || 0)
  const groqApiKeys = rotate(extras.groqKeys, opts.keyOffset || 0)
  const preferGroq = Boolean(opts.longForm && groqApiKeys.length)
  const maxRetries = opts.longForm ? MAX_RETRIES_LONG : MAX_RETRIES_SHORT
  let lastError = 'Trascrizione non riuscita.'

  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
        provider: preferGroq ? 'groq' : extras.provider,
        model: preferGroq ? 'whisper-large-v3' : 'gemini-2.5-flash',
        geminiApiKeys,
        groqApiKeys,
        longForm: Boolean(opts.longForm),
      }),
    })
    if (res.ok) {
      return (await res.json()) as { text: string; segments: TranscriptSegment[]; engine: string }
    }
    const detail = (await res.text().catch(() => '')).trim()
    lastError = detail || `Trascrizione non riuscita (HTTP ${res.status}).`
    if (!isQuotaError(lastError, res.status) || attempt === maxRetries - 1) {
      throw new Error(lastError)
    }
    // Backoff paziente su file lunghi: fino a ~12 minuti
    const waitMs = opts.longForm
      ? Math.min(720_000, 12_000 * 2 ** Math.min(attempt, 6))
      : Math.min(60_000, 8000 * 2 ** attempt)
    opts.onWait?.(Math.round(waitMs / 1000))
    await sleep(waitMs, opts.signal)
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
    onProgress?: (part: number, total: number, info?: { doneMin: number; totalMin: number }) => void
    onWait?: (seconds: number) => void
    resume?: TranscriptProgress
    saveProgress?: (progress: TranscriptProgress) => Promise<void>
  } = {},
) {
  if (!navigator.onLine) throw new Error('Serve connessione per trascrivere la registrazione.')
  if ((opts.durationMs || 0) > MAX_DURATION_MS) {
    throw new Error(
      `Audio oltre ${TRANSCRIBE_TARGET_MINUTES} minuti. Spezza il file in parti da max ${TRANSCRIBE_TARGET_MINUTES} min.`,
    )
  }

  const durationMs = opts.durationMs || 0
  const longForm = durationMs > 12 * 60 * 1000 || blob.size > MAX_BYTES
  let segments: TranscriptSegment[]

  if (!opts.forceDecode && blob.size <= MAX_BYTES && durationMs > 0 && durationMs <= CLIP_SECONDS * 1000) {
    segments = (await transcribeClip(blob, { ...opts, longForm, keyOffset: 0 })).segments
  } else {
    let audio: AudioBuffer
    try {
      const context = new OfflineAudioContext(1, 1, SAMPLE_RATE)
      audio = await context.decodeAudioData(await blob.arrayBuffer())
    } catch {
      throw new Error(
        'Il browser non riesce a leggere questo audio (memoria o formato). Prova MP3/WAV più corti, o spezza sotto i 60–90 minuti.',
      )
    }
    const durationMin = audio.duration / 60
    if (durationMin > TRANSCRIBE_TARGET_MINUTES + 0.5) {
      throw new Error(
        `Audio di ~${Math.round(durationMin)} min: il tetto supportato è ${TRANSCRIBE_TARGET_MINUTES} minuti.`,
      )
    }
    const clipSize = Math.floor(CLIP_SECONDS * SAMPLE_RATE)
    const hopSize = Math.floor(CLIP_HOP_SECONDS * SAMPLE_RATE)
    const total = Math.max(1, Math.ceil(audio.length / hopSize))
    const language = opts.language || 'auto'
    const resume = opts.resume?.language === language && opts.resume.total === total ? opts.resume : undefined
    segments = [...(resume?.segments || [])]
    let speakerOffset = segments.reduce(
      (max, item) => Math.max(max, Number(item.speaker.split(' ').at(-1)) || 0),
      0,
    )
    const startPart = resume?.nextPart ?? 0
    for (let part = startPart; part < total; part++) {
      const start = part * hopSize
      if (start >= audio.length) break
      opts.signal?.throwIfAborted()
      const doneMin = Math.round(((start / SAMPLE_RATE) / 60) * 10) / 10
      const totalMin = Math.round((audio.duration / 60) * 10) / 10
      opts.onProgress?.(part + 1, total, { doneMin, totalMin })
      if (part > startPart) {
        await sleep(CLIP_GAP_MS, opts.signal)
      }
      const clip = wavClip(audio, start, Math.min(audio.length, start + clipSize))
      const result = await transcribeClip(
        clip,
        {
          language: opts.language,
          signal: opts.signal,
          longForm: longForm || total > 8,
          keyOffset: part,
          onWait: opts.onWait,
        },
        speakerOffset,
      )
      const kept = filterOverlapSegments(result.segments, part)
      for (const segment of kept) {
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
