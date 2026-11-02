/** Voce narrativa neurale (cloud) con fallback offline sul dispositivo. */

export type NarrationVoiceId = 'isabella' | 'elsa' | 'diego' | 'giuseppe' | 'jenny' | 'aria'
export type NarrationEngine = 'neural' | 'device'

export const NARRATION_VOICES: Array<{
  id: NarrationVoiceId
  label: string
  language: 'I' | 'E'
}> = [
  { id: 'isabella', label: 'Isabella (narrativa, consigliata)', language: 'I' },
  { id: 'elsa', label: 'Elsa (chiara)', language: 'I' },
  { id: 'diego', label: 'Diego (maschile)', language: 'I' },
  { id: 'giuseppe', label: 'Giuseppe (multilingue)', language: 'I' },
  { id: 'jenny', label: 'Jenny (English)', language: 'E' },
  { id: 'aria', label: 'Aria (English)', language: 'E' },
]

export function speechNarrationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return true
}

export function speechNarrationSupportNote(): string {
  return ''
}

export type NarrationState = 'idle' | 'loading' | 'speaking' | 'paused'

export interface NarrationOptions {
  voice?: NarrationVoiceId
  language?: 'I' | 'E'
  engine?: NarrationEngine
}

export interface NarrationController {
  speak: (text: string, options?: NarrationOptions) => void
  pause: () => void
  resume: () => void
  stop: () => void
  getState: () => NarrationState
  isSupported: boolean
}

let shared: NarrationController | null = null
let listeners = new Set<(state: NarrationState) => void>()
let currentState: NarrationState = 'idle'
let speakingFor = ''
let audioEl: HTMLAudioElement | null = null
let objectUrls: string[] = []
let chunkQueue: Blob[] = []
let playIndex = 0
let aborted = false
let deviceQueue: string[] = []

function notify(state: NarrationState) {
  currentState = state
  listeners.forEach((fn) => fn(state))
}

function clearAudio() {
  if (audioEl) {
    try {
      audioEl.onended = null
      audioEl.onerror = null
      audioEl.pause()
      audioEl.removeAttribute('src')
      audioEl.load()
    } catch {
      /* ignore */
    }
  }
  audioEl = null
  for (const u of objectUrls) {
    try {
      URL.revokeObjectURL(u)
    } catch {
      /* ignore */
    }
  }
  objectUrls = []
  chunkQueue = []
  playIndex = 0
}

function stopDevice() {
  deviceQueue = []
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}

/** Spezza per frasi: pezzi gestibili dall’API neurale. */
export function chunkNarrationText(text: string, maxLen = 1800): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]

  const parts: string[] = []
  let rest = clean
  while (rest.length > maxLen) {
    const slice = rest.slice(0, maxLen)
    const breakAt = Math.max(
      slice.lastIndexOf('. '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('; '),
      slice.lastIndexOf(', '),
      slice.lastIndexOf(' '),
    )
    const cut = breakAt > maxLen * 0.35 ? breakAt + 1 : maxLen
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

function scoreNeuralVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase()
  let score = 0
  if (/online|natural|neural|premium|enhanced|siri|google|microsoft|apple/.test(name)) score += 8
  if (/isabella|elsa|diego|giuseppe|jenny|aria|nova/.test(name)) score += 4
  if (/compact|espeak|android|samsung|robot/.test(name)) score -= 10
  if (/^it[-_]/i.test(v.lang)) score += 3
  return score
}

function pickBestDeviceVoice(language: 'I' | 'E'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const langPrefix = language === 'E' ? 'en' : 'it'
  const filtered = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix))
  const pool = filtered.length ? filtered : voices
  return [...pool].sort((a, b) => scoreNeuralVoice(b) - scoreNeuralVoice(a))[0] || null
}

async function fetchNeuralChunk(
  text: string,
  options: Required<Pick<NarrationOptions, 'voice' | 'language'>>,
): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: options.voice,
      language: options.language,
    }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = (await res.json()) as { error?: string }
      detail = j.error || ''
    } catch {
      detail = await res.text()
    }
    throw new Error(detail || `TTS HTTP ${res.status}`)
  }
  return await res.blob()
}

function playNextBlob() {
  if (aborted) return
  if (playIndex >= chunkQueue.length) {
    speakingFor = ''
    clearAudio()
    notify('idle')
    return
  }
  const blob = chunkQueue[playIndex]
  const url = URL.createObjectURL(blob)
  objectUrls.push(url)
  const el = new Audio(url)
  audioEl = el
  el.onended = () => {
    playIndex += 1
    playNextBlob()
  }
  el.onerror = () => {
    playIndex += 1
    playNextBlob()
  }
  void el.play().then(
    () => notify('speaking'),
    () => {
      speakingFor = ''
      clearAudio()
      notify('idle')
    },
  )
}

function speakWithDevice(text: string, language: 'I' | 'E') {
  if (!window.speechSynthesis) {
    notify('idle')
    return
  }
  stopDevice()
  const chunks = chunkNarrationText(text, 1600)
  deviceQueue = chunks
  const speakNext = () => {
    if (aborted || !deviceQueue.length) {
      speakingFor = ''
      notify('idle')
      return
    }
    const chunk = deviceQueue.shift() || ''
    const utter = new SpeechSynthesisUtterance(chunk)
    utter.lang = language === 'E' ? 'en-US' : 'it-IT'
    utter.rate = 0.92
    utter.pitch = 1
    const voice = pickBestDeviceVoice(language)
    if (voice) utter.voice = voice
    utter.onend = () => speakNext()
    utter.onerror = () => {
      deviceQueue = []
      speakingFor = ''
      notify('idle')
    }
    window.speechSynthesis.speak(utter)
    notify('speaking')
  }
  speakNext()
}

export function getNarrationController(): NarrationController {
  if (shared) return shared

  try {
    window.speechSynthesis?.getVoices()
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices()
      }
    }
  } catch {
    /* ignore */
  }

  shared = {
    isSupported: true,
    getState: () => currentState,
    speak(text: string, options = {}) {
      const trimmed = text.replace(/\s+/g, ' ').trim()
      if (!trimmed) return
      aborted = true
      clearAudio()
      stopDevice()
      aborted = false

      speakingFor = trimmed
      const language = options.language || 'I'
      const voice = options.voice || (language === 'E' ? 'jenny' : 'isabella')
      const engine = options.engine || 'neural'

      if (engine === 'device' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        speakWithDevice(trimmed, language)
        return
      }

      notify('loading')
      const parts = chunkNarrationText(trimmed, 1800)
      void (async () => {
        try {
          const blobs: Blob[] = []
          for (const part of parts) {
            if (aborted) return
            blobs.push(await fetchNeuralChunk(part, { voice, language }))
          }
          if (aborted) return
          chunkQueue = blobs
          playIndex = 0
          playNextBlob()
        } catch {
          if (aborted) return
          // Fallback dispositivo se la rete/API non risponde
          speakWithDevice(trimmed, language)
        }
      })()
    },
    pause() {
      if (currentState === 'speaking' && audioEl) {
        audioEl.pause()
        notify('paused')
        return
      }
      if (currentState === 'speaking' && window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause()
        notify('paused')
      }
    },
    resume() {
      if (currentState === 'paused' && audioEl) {
        void audioEl.play().then(() => notify('speaking'))
        return
      }
      if (currentState === 'paused' && window.speechSynthesis) {
        window.speechSynthesis.resume()
        notify('speaking')
      }
    },
    stop() {
      aborted = true
      speakingFor = ''
      clearAudio()
      stopDevice()
      notify('idle')
    },
  }
  return shared
}

export function subscribeNarration(listener: (state: NarrationState) => void): () => void {
  listeners.add(listener)
  listener(currentState)
  return () => {
    listeners.delete(listener)
  }
}

export function getSpeakingText(): string {
  return speakingFor
}
