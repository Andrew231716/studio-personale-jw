import {
  looksLikeExclamation,
  looksLikeQuestion,
  refineDiscourseSpeechText,
} from './discourseTextRefine'

export { normalizeSpokenScriptureReferences } from './discourseTextRefine'

/** Tipi minimi Web Speech API (Chrome / Safari). */
export interface DictationHandlers {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
  /** Livello microfono 0–1 (se disponibile via getUserMedia). */
  onLevel?: (level: number) => void
  /** Stream già aperto (es. condiviso con MediaRecorder). */
  stream?: MediaStream | null
  hints?: string[]
}

type Recog = SpeechRecognition

/** Pausa corta → virgola; pausa lunga → punto (ms di silenzio). */
const SHORT_PAUSE_MS = 550
const LONG_PAUSE_MS = 1400
const SILENCE_RMS = 0.018
const ENERGY_EXCLAIM = 0.12

export function speechDictationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function speechDictationSupportNote(): string {
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent
  if (/Firefox/i.test(ua)) {
    return 'Firefox non supporta bene la dettatura continua. Usa Chrome, Edge o Safari, oppure digita a mano.'
  }
  if (/Android/i.test(ua) && /Firefox|SamsungBrowser/i.test(ua)) {
    return 'Su questo browser Android la dettatura può essere limitata. Chrome offre il risultato migliore.'
  }
  if (!speechDictationSupported()) {
    return 'Dettatura non disponibile qui. Digita a mano oppure apri l’app in Chrome/Safari.'
  }
  return ''
}

export function createDictation(lang = 'it-IT'): {
  start: (handlers: DictationHandlers) => void
  stop: () => Promise<void>
  isSupported: boolean
} {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) {
    return {
      isSupported: false,
      start: (h) => h.onError(speechDictationSupportNote() || 'Dettatura non supportata.'),
      stop: async () => undefined,
    }
  }

  let recog: Recog | null = null
  let stopped = false
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let ownedStream: MediaStream | null = null
  let levelRaf = 0
  let lastInterim = ''
  let finishStop: (() => void) | null = null
  let stopTimeout = 0
  let handlersRef: DictationHandlers | null = null
  let lastFinalAt = 0
  let silenceStartedAt = 0
  let pendingSilenceMs = 0
  let speaking = false
  let recentCentroids: number[] = []
  let recentRms: number[] = []
  let lastContour: 'rising' | 'falling' | 'flat' = 'flat'
  let lastEnergyHigh = false

  function stopLevelMeter(stopTracks: boolean) {
    if (levelRaf) cancelAnimationFrame(levelRaf)
    levelRaf = 0
    if (stopTracks) {
      try {
        ownedStream?.getTracks().forEach((t) => t.stop())
      } catch {
        /* ignore */
      }
      ownedStream = null
    }
    try {
      void audioCtx?.close()
    } catch {
      /* ignore */
    }
    audioCtx = null
    analyser = null
  }

  function samplePitchContour(): 'rising' | 'falling' | 'flat' {
    if (recentCentroids.length < 8) return 'flat'
    const mid = Math.floor(recentCentroids.length / 2)
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const a = avg(recentCentroids.slice(0, mid))
    const b = avg(recentCentroids.slice(mid))
    if (b > a * 1.1) return 'rising'
    if (b < a * 0.9) return 'falling'
    return 'flat'
  }

  function sampleEnergyHigh(): boolean {
    if (recentRms.length < 4) return false
    const peak = Math.max(...recentRms)
    return peak >= ENERGY_EXCLAIM
  }

  function startLevelMeter(stream: MediaStream, onLevel?: (n: number) => void) {
    try {
      audioCtx = new AudioContext()
      const src = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const time = new Uint8Array(analyser.fftSize)
      const freq = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyser) return
        analyser.getByteTimeDomainData(time)
        let sum = 0
        for (let i = 0; i < time.length; i++) {
          const v = (time[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / time.length)
        onLevel?.(Math.min(1, rms * 4))

        analyser.getByteFrequencyData(freq)
        let num = 0
        let den = 0
        for (let i = 0; i < freq.length; i++) {
          num += i * freq[i]
          den += freq[i]
        }
        const centroid = den ? num / den : 0

        // Traccia silenzi + tono (centroide) / energia per ? e !
        if (rms < SILENCE_RMS) {
          if (!silenceStartedAt && speaking) {
            silenceStartedAt = Date.now()
            lastContour = samplePitchContour()
            lastEnergyHigh = sampleEnergyHigh()
          }
        } else {
          if (silenceStartedAt) {
            pendingSilenceMs = Math.max(pendingSilenceMs, Date.now() - silenceStartedAt)
          }
          silenceStartedAt = 0
          speaking = true
          recentCentroids.push(centroid)
          recentRms.push(rms)
          if (recentCentroids.length > 48) recentCentroids.shift()
          if (recentRms.length > 48) recentRms.shift()
        }
        levelRaf = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* ignore */
    }
  }

  function pauseGapMs(): number {
    const now = Date.now()
    if (silenceStartedAt) {
      pendingSilenceMs = Math.max(pendingSilenceMs, now - silenceStartedAt)
      silenceStartedAt = now
    }
    const sinceFinal = lastFinalAt ? now - lastFinalAt : 0
    const gap = Math.max(pendingSilenceMs, sinceFinal)
    pendingSilenceMs = 0
    return gap
  }

  function emitFinal(raw: string) {
    if (!handlersRef) return
    const gap = lastFinalAt ? pauseGapMs() : 0
    const contour = lastContour
    const energyHigh = lastEnergyHigh
    lastFinalAt = Date.now()
    speaking = true
    lastContour = 'flat'
    lastEnergyHigh = false
    recentCentroids = []
    recentRms = []
    const piece = applySpeechPunctuation(raw, {
      pauseMs: gap,
      contour,
      energyHigh,
    })
    if (piece) handlersRef.onFinal(piece)
  }

  function flushInterim() {
    const piece = lastInterim.trim()
    lastInterim = ''
    if (piece) emitFinal(piece)
  }

  function start(handlers: DictationHandlers) {
    stopped = false
    lastInterim = ''
    lastFinalAt = 0
    silenceStartedAt = 0
    pendingSilenceMs = 0
    speaking = false
    recentCentroids = []
    recentRms = []
    lastContour = 'flat'
    lastEnergyHigh = false
    handlersRef = handlers
    recog?.abort()
    stopLevelMeter(true)

    const boot = async () => {
      let stream = handlers.stream || null
      if (!stream && navigator.mediaDevices?.getUserMedia) {
        try {
          ownedStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream = ownedStream
        } catch {
          /* SpeechRecognition chiederà il mic da sola */
        }
      }
      if (stopped) {
        stopLevelMeter(Boolean(ownedStream))
        return
      }
      // Livello + silenzio anche senza onLevel UI (serve per la punteggiatura)
      if (stream) startLevelMeter(stream, handlers.onLevel)

      recog = new Ctor()
      recog.lang = lang
      recog.continuous = true
      recog.interimResults = true
      recog.maxAlternatives = 1
      const Phrase = window.SpeechRecognitionPhrase
      if (Phrase && 'phrases' in recog && handlers.hints?.length) {
        try {
          recog.phrases = handlers.hints.map((hint) => new Phrase(hint, 3))
        } catch {
          // Il riconoscimento resta disponibile anche senza suggerimenti.
        }
      }
      const track = stream?.getAudioTracks()[0]
      const begin = () => track?.readyState === 'live' ? recog?.start(track) : recog?.start()


      recog.onresult = (event: SpeechRecognitionEvent) => {
        if (!handlersRef) return
        const interim: string[] = []
        const finals: string[] = []
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const piece = result[0]?.transcript.trim()
          if (!piece) continue
          if (result.isFinal) finals.push(piece)
          else interim.push(piece)
        }
        if (finals.length) emitFinal(finals.join(' '))
        lastInterim = interim.join(' ')
        handlers.onPartial(lastInterim)
      }

      recog.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return
        if (event.error === 'phrases-not-supported' && recog?.phrases?.length) {
          recog.phrases = []
          return
        }
        stopped = true
        if (event.error === 'not-allowed') {
          handlers.onError(
            'Microfono non autorizzato. Consenti l’accesso nelle impostazioni del browser.',
          )
          return
        }
        if (event.error === 'network') {
          handlers.onError(
            'Dettatura richiede rete per il riconoscimento vocale su questo browser. Scrivi a mano oppure riprova online.',
          )
          stopped = true
          return
        }
        handlers.onError(`Dettatura: ${event.error}`)
      }

      recog.onend = () => {
        // Prima di riavviare: salva le parole interim ancora in scorrimento
        flushInterim()
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false
        if (!stopped && !offline) {
          try {
            begin()
            return
          } catch {
            /* ignore */
          }
        }
        if (finishStop) finishStop()
        else {
          stopLevelMeter(Boolean(ownedStream))
          handlers.onEnd()
        }
      }

      try {
        begin()
      } catch (e) {
        stopLevelMeter(Boolean(ownedStream))
        handlers.onError(e instanceof Error ? e.message : 'Impossibile avviare il microfono')
      }
    }

    void boot()
  }

  function stop() {
    stopped = true
    const current = recog
    if (!current || finishStop) return Promise.resolve()
    return new Promise<void>((resolve) => {
      finishStop = () => {
        window.clearTimeout(stopTimeout)
        flushInterim()
        current.onresult = null
        current.onend = null
        current.onerror = null
        stopLevelMeter(Boolean(ownedStream))
        handlersRef = null
        recog = null
        finishStop = null
        resolve()
      }
      stopTimeout = window.setTimeout(() => {
        current.abort()
        finishStop?.()
      }, 1200)
      try {
        current.stop()
      } catch {
        finishStop?.()
      }
    })
  }

  return { start, stop, isSupported: true }
}

export type SpeechPunctuationHints = {
  pauseMs: number
  contour?: 'rising' | 'falling' | 'flat'
  energyHigh?: boolean
}

/**
 * Punteggiatura da pausa + tono (centroide) + energia + indizi lessicali.
 * Corta → virgola; lunga → . ? ! con maiuscola.
 */
export function applySpeechPunctuation(
  chunk: string,
  hints: SpeechPunctuationHints,
): string {
  let text = chunk.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  const { pauseMs, contour = 'flat', energyHigh = false } = hints
  if (pauseMs < SHORT_PAUSE_MS) return text

  const stripLead = () => {
    text = text.replace(/^[.,;:!?…]+\s*/, '')
    return text
  }

  const endMark = (): '.' | '?' | '!' => {
    const body = text.replace(/^[.,;:!?…]+\s*/, '')
    if (looksLikeQuestion(body) || contour === 'rising') return '?'
    if (looksLikeExclamation(body) || energyHigh) return '!'
    return '.'
  }

  if (/^[.,;:!?…]/.test(text)) {
    if (pauseMs >= LONG_PAUSE_MS) {
      if (!stripLead()) return ''
      const mark = endMark()
      return `${mark} ${capitalizeLeading(text)}`
    }
    return text
  }
  if (pauseMs >= LONG_PAUSE_MS) {
    const mark = endMark()
    return `${mark} ${capitalizeLeading(text)}`
  }
  return `, ${text}`
}

/** @deprecated usa applySpeechPunctuation */
export function applyPausePunctuation(chunk: string, pauseMs: number): string {
  return applySpeechPunctuation(chunk, { pauseMs })
}

function capitalizeLeading(text: string): string {
  return text.replace(/^(\p{L})/u, (ch) => ch.toLocaleUpperCase('it-IT'))
}

/**
 * Inserisce il pezzo in coda al testo della sezione (dettatura automatica).
 * Non dipende dal cursore: evita perdite mentre scorrono le interim.
 */
export function appendDictatedChunk(value: string, chunk: string): string {
  let piece = chunk.trim()
  if (!piece) return value
  const base = value.replace(/\s+$/, '')
  if (!base) {
    piece = piece.replace(/^[.,;:!?…]+\s*/, '')
    piece = capitalizeLeading(piece)
    return piece ? `${refineDiscourseSpeechText(piece)} ` : value
  }
  if (/[.,;:!?…]$/.test(base) && /^[.,;:!?…]/.test(piece)) {
    const lead = piece.match(/^[.,;:!?…]+/)?.[0] || ''
    piece = piece.replace(/^[.,;:!?…]+\s*/, '')
    if (!piece) return `${base} `
    if (lead.includes('.') || lead.includes('!') || lead.includes('?') || lead.includes('…')) {
      piece = capitalizeLeading(piece)
    }
    const needsSpace = !/\s$/.test(base)
    return `${refineDiscourseSpeechText(`${base}${needsSpace ? ' ' : ''}${piece}`)} `
  }
  const needsSpace = !/\s$/.test(base) && !/^[.,;:!?]/.test(piece)
  return `${refineDiscourseSpeechText(`${base}${needsSpace ? ' ' : ''}${piece}`)} `
}

/** @deprecated preferisci appendDictatedChunk per la dettatura */
export function insertAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  chunk: string,
): { next: string; cursor: number } {
  const next = appendDictatedChunk(value, chunk)
  if (!el) return { next, cursor: next.length }
  return { next, cursor: next.length }
}
