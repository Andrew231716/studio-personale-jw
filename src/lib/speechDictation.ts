import { BIBLE_CHAPTER_COUNTS } from './bibleChapterCounts'
import { BIBLE_BOOKS } from './bibleRefs'

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

  function startLevelMeter(stream: MediaStream, onLevel?: (n: number) => void) {
    try {
      audioCtx = new AudioContext()
      const src = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyser) return
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        onLevel?.(Math.min(1, rms * 4))
        // Traccia silenzi per virgole / punti in dettatura
        if (rms < SILENCE_RMS) {
          if (!silenceStartedAt && speaking) silenceStartedAt = Date.now()
        } else {
          if (silenceStartedAt) {
            pendingSilenceMs = Math.max(pendingSilenceMs, Date.now() - silenceStartedAt)
          }
          silenceStartedAt = 0
          speaking = true
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
    lastFinalAt = Date.now()
    speaking = true
    const piece = applyPausePunctuation(raw, gap)
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

/**
 * In base alla pausa: corta → «, …»; lunga → «. …» con maiuscola.
 * Se il motore ha già messo punteggiatura, non ne aggiunge altra.
 */
export function applyPausePunctuation(chunk: string, pauseMs: number): string {
  let text = chunk.replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (pauseMs < SHORT_PAUSE_MS) return text
  // Già inizia con punteggiatura (motore o pezzo precedente)
  if (/^[.,;:!?…]/.test(text)) {
    if (pauseMs >= LONG_PAUSE_MS) {
      text = text.replace(/^[.,;:!?…]+\s*/, '')
      if (!text) return ''
      text = capitalizeLeading(text)
      return `. ${text}`
    }
    return text
  }
  if (pauseMs >= LONG_PAUSE_MS) {
    return `. ${capitalizeLeading(text)}`
  }
  return `, ${text}`
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
  let base = value.replace(/\s+$/, '')
  if (!base) {
    // Prima frase: togli punteggiatura iniziale da pausa e capitalizza
    piece = piece.replace(/^[.,;:!?…]+\s*/, '')
    piece = capitalizeLeading(piece)
    return piece ? `${normalizeSpokenScriptureReferences(piece)} ` : value
  }
  // Evita «parola..» / «parola,,»
  if (/[.,;:!?…]$/.test(base) && /^[.,;:!?…]/.test(piece)) {
    const lead = piece.match(/^[.,;:!?…]+/)?.[0] || ''
    piece = piece.replace(/^[.,;:!?…]+\s*/, '')
    if (!piece) return `${base} `
    if (lead.includes('.') || lead.includes('!') || lead.includes('?') || lead.includes('…')) {
      piece = capitalizeLeading(piece)
    }
    const needsSpace = !/\s$/.test(base)
    return `${normalizeSpokenScriptureReferences(
      `${base}${needsSpace ? ' ' : ''}${piece}`,
    )} `
  }
  const needsSpace = !/\s$/.test(base) && !/^[.,;:!?]/.test(piece)
  return `${normalizeSpokenScriptureReferences(
    `${base}${needsSpace ? ' ' : ''}${piece}`,
  )} `
}

const spokenBookLimits = new Map(
  BIBLE_BOOKS.flatMap((book) => {
    const names = [book.name, book.short]
    return names
      .filter((name): name is string => Boolean(name))
      .map((name) => [
        name.toLocaleLowerCase('it-IT'),
        BIBLE_CHAPTER_COUNTS[book.num],
      ] as const)
  }),
)

const spokenBookPattern = [...spokenBookLimits.keys()]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  .join('|')

const spokenScriptureRef = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${spokenBookPattern})\\s+(\\d{1,3})\\s+(\\d{1,3})(?=$|[^\\p{L}\\p{N}])`,
  'giu',
)

/** Converte solo sequenze plausibili libro-capitolo-versetto dettate senza i due punti. */
export function normalizeSpokenScriptureReferences(text: string): string {
  return text.replace(
    spokenScriptureRef,
    (match, prefix: string, book: string, chapterRaw: string, verseRaw: string) => {
      const chapter = Number(chapterRaw)
      const verse = Number(verseRaw)
      const maxChapter = spokenBookLimits.get(book.toLocaleLowerCase('it-IT'))
      if (!maxChapter || chapter < 1 || chapter > maxChapter || verse < 1 || verse > 176) {
        return match
      }
      return `${prefix}${book} ${chapter}:${verse}`
    },
  )
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
