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
}

type Recog = SpeechRecognition

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
  stop: () => void
  isSupported: boolean
} {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) {
    return {
      isSupported: false,
      start: (h) => h.onError(speechDictationSupportNote() || 'Dettatura non supportata.'),
      stop: () => undefined,
    }
  }

  let recog: Recog | null = null
  let stopped = false
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let ownedStream: MediaStream | null = null
  let levelRaf = 0
  let lastInterim = ''
  let handlersRef: DictationHandlers | null = null

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
    if (!onLevel) return
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
        onLevel(Math.min(1, rms * 4))
        levelRaf = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* ignore */
    }
  }

  function flushInterim() {
    const piece = lastInterim.trim()
    lastInterim = ''
    if (piece && handlersRef) handlersRef.onFinal(piece)
  }

  function start(handlers: DictationHandlers) {
    stopped = false
    lastInterim = ''
    handlersRef = handlers
    recog?.abort()
    stopLevelMeter(true)

    const boot = async () => {
      let stream = handlers.stream || null
      if (!stream && handlers.onLevel && navigator.mediaDevices?.getUserMedia) {
        try {
          ownedStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream = ownedStream
        } catch {
          /* SpeechRecognition chiederà il mic da sola */
        }
      }
      if (stream) startLevelMeter(stream, handlers.onLevel)

      recog = new Ctor()
      recog.lang = lang
      recog.continuous = true
      recog.interimResults = true
      recog.maxAlternatives = 1

      recog.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let finals = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const piece = result[0]?.transcript || ''
          if (result.isFinal) finals += piece
          else interim += piece
        }
        if (finals.trim()) {
          lastInterim = ''
          handlers.onFinal(finals)
          handlers.onPartial('')
        }
        if (interim.trim()) {
          lastInterim = interim
          handlers.onPartial(interim)
        } else if (!finals.trim()) {
          lastInterim = ''
        }
      }

      recog.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return
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
            recog?.start()
            return
          } catch {
            /* ignore */
          }
        }
        stopLevelMeter(Boolean(ownedStream))
        handlers.onEnd()
      }

      try {
        recog.start()
      } catch (e) {
        stopLevelMeter(Boolean(ownedStream))
        handlers.onError(e instanceof Error ? e.message : 'Impossibile avviare il microfono')
      }
    }

    void boot()
  }

  function stop() {
    stopped = true
    flushInterim()
    try {
      recog?.stop()
    } catch {
      /* ignore */
    }
    recog = null
    stopLevelMeter(Boolean(ownedStream))
    handlersRef = null
  }

  return { start, stop, isSupported: true }
}

/**
 * Inserisce il pezzo in coda al testo della sezione (dettatura automatica).
 * Non dipende dal cursore: evita perdite mentre scorrono le interim.
 */
export function appendDictatedChunk(value: string, chunk: string): string {
  const piece = chunk.trim()
  if (!piece) return value
  const base = value.replace(/\s+$/, '')
  if (!base) return `${piece} `
  const needsSpace = !/\s$/.test(base) && !/^[.,;:!?]/.test(piece)
  return `${base}${needsSpace ? ' ' : ''}${piece} `
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
