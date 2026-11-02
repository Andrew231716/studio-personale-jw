/** Sintesi vocale gratuita del browser (Web Speech API). */

export function speechNarrationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function speechNarrationSupportNote(): string {
  if (speechNarrationSupported()) return ''
  return 'Voce narrativa non disponibile su questo browser. Prova Chrome, Edge o Safari.'
}

function pickItalianVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const preferred =
    voices.find((v) => /^it[-_]/i.test(v.lang) && /google|microsoft|apple|siri|natural|premium/i.test(v.name)) ||
    voices.find((v) => /^it[-_]/i.test(v.lang)) ||
    voices.find((v) => /italian|italiano/i.test(v.name))
  return preferred || null
}

/** Spezza testi lunghi in frasi, per limiti di alcuni browser. */
function chunkText(text: string, maxLen = 1800): string[] {
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
    const cut = breakAt > maxLen * 0.4 ? breakAt + 1 : maxLen
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

export type NarrationState = 'idle' | 'speaking' | 'paused'

export interface NarrationController {
  speak: (text: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  getState: () => NarrationState
  isSupported: boolean
}

/**
 * Controller riusabile per ascoltare testi AI.
 * Una sola istanza globale evita sovrapposizioni tra sezioni.
 */
let shared: NarrationController | null = null
let listeners = new Set<(state: NarrationState) => void>()
let currentState: NarrationState = 'idle'
let queue: string[] = []
let speakingFor = ''

function notify(state: NarrationState) {
  currentState = state
  listeners.forEach((fn) => fn(state))
}

function speakNext() {
  if (!queue.length) {
    speakingFor = ''
    notify('idle')
    return
  }
  const chunk = queue.shift() || ''
  const utter = new SpeechSynthesisUtterance(chunk)
  utter.lang = 'it-IT'
  utter.rate = 0.95
  utter.pitch = 1
  const voice = pickItalianVoice()
  if (voice) utter.voice = voice

  utter.onend = () => speakNext()
  utter.onerror = () => {
    queue = []
    speakingFor = ''
    notify('idle')
  }
  window.speechSynthesis.speak(utter)
  notify('speaking')
}

export function getNarrationController(): NarrationController {
  if (shared) return shared

  if (!speechNarrationSupported()) {
    shared = {
      isSupported: false,
      speak: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      stop: () => undefined,
      getState: () => 'idle',
    }
    return shared
  }

  // Chrome carica le voci in async
  try {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices()
    }
  } catch {
    /* ignore */
  }

  shared = {
    isSupported: true,
    getState: () => currentState,
    speak(text: string) {
      const trimmed = text.replace(/\s+/g, ' ').trim()
      if (!trimmed) return
      window.speechSynthesis.cancel()
      queue = chunkText(trimmed)
      speakingFor = trimmed
      speakNext()
    },
    pause() {
      if (currentState !== 'speaking') return
      window.speechSynthesis.pause()
      notify('paused')
    },
    resume() {
      if (currentState !== 'paused') return
      window.speechSynthesis.resume()
      notify('speaking')
    },
    stop() {
      queue = []
      speakingFor = ''
      window.speechSynthesis.cancel()
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

/** Testo attualmente in riproduzione (per evidenziare il pulsante attivo). */
export function getSpeakingText(): string {
  return speakingFor
}
