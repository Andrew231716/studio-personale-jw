/** Tipi minimi Web Speech API (Chrome / Safari). */
export interface DictationHandlers {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
  /** Livello microfono 0–1 (se disponibile via getUserMedia). */
  onLevel?: (level: number) => void
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
  let micStream: MediaStream | null = null
  let levelRaf = 0

  function stopLevelMeter() {
    if (levelRaf) cancelAnimationFrame(levelRaf)
    levelRaf = 0
    try {
      micStream?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    micStream = null
    try {
      void audioCtx?.close()
    } catch {
      /* ignore */
    }
    audioCtx = null
    analyser = null
  }

  async function startLevelMeter(onLevel?: (n: number) => void) {
    if (!onLevel || !navigator.mediaDevices?.getUserMedia) return
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioCtx = new AudioContext()
      const src = audioCtx.createMediaStreamSource(micStream)
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
      /* permesso già gestito dalla SpeechRecognition */
    }
  }

  function start(handlers: DictationHandlers) {
    stopped = false
    recog?.abort()
    stopLevelMeter()
    void startLevelMeter(handlers.onLevel)

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
      if (finals.trim()) handlers.onFinal(finals)
      if (interim.trim()) handlers.onPartial(interim)
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
        return
      }
      handlers.onError(`Dettatura: ${event.error}`)
    }

    recog.onend = () => {
      if (!stopped) {
        try {
          recog?.start()
          return
        } catch {
          /* ignore */
        }
      }
      stopLevelMeter()
      handlers.onEnd()
    }

    try {
      recog.start()
    } catch (e) {
      stopLevelMeter()
      handlers.onError(e instanceof Error ? e.message : 'Impossibile avviare il microfono')
    }
  }

  function stop() {
    stopped = true
    try {
      recog?.stop()
    } catch {
      /* ignore */
    }
    recog = null
    stopLevelMeter()
  }

  return { start, stop, isSupported: true }
}

/** Inserisce testo alla posizione del cursore in una textarea, senza perdere la selezione. */
export function insertAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  chunk: string,
): { next: string; cursor: number } {
  if (!el) {
    const next = value.replace(/\s+$/, '')
    const joined = next ? `${next} ${chunk.trim()} ` : `${chunk.trim()} `
    return { next: joined, cursor: joined.length }
  }
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const piece = chunk.trim()
  const before = value.slice(0, start)
  const after = value.slice(end)
  const needsSpaceBefore = before.length > 0 && !/\s$/.test(before)
  const insert = `${needsSpaceBefore ? ' ' : ''}${piece} `
  const next = before + insert + after
  return { next, cursor: before.length + insert.length }
}
