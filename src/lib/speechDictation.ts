/** Tipi minimi Web Speech API (Chrome / Safari). */
export interface DictationHandlers {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onError: (message: string) => void
  onEnd: () => void
}

type Recog = SpeechRecognition

export function speechDictationSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
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
      start: (h) => h.onError('Dettatura non supportata su questo browser.'),
      stop: () => undefined,
    }
  }

  let recog: Recog | null = null
  let stopped = false

  function start(handlers: DictationHandlers) {
    stopped = false
    recog?.abort()
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
        handlers.onError('Microfono non autorizzato. Consenti l’accesso nelle impostazioni del browser.')
        return
      }
      handlers.onError(`Dettatura: ${event.error}`)
    }

    recog.onend = () => {
      if (!stopped) {
        // Riparte automaticamente se l’utente non ha fermato
        try {
          recog?.start()
          return
        } catch {
          /* ignore */
        }
      }
      handlers.onEnd()
    }

    try {
      recog.start()
    } catch (e) {
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
  }

  return { start, stop, isSupported: true }
}
