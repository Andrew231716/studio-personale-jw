/**
 * Cattura Discorso offline-first:
 * - Registrazione audio locale (sempre, anche offline)
 * - Dettatura testo best-effort (su molti browser serve rete)
 */

import {
  mediaRecorderSupported,
  pickRecorderMimeType,
  saveDiscourseRecording,
  type DiscourseRecordingMeta,
} from './discourseRecordings'
import { createDictation, type DictationHandlers } from './speechDictation'

export interface DiscourseCaptureHandlers extends Omit<DictationHandlers, 'stream' | 'onEnd'> {
  onRecordingSaved?: (meta: DiscourseRecordingMeta) => void
  onRecordingError?: (message: string) => void
  /** Avviso non fatale (es. dettatura offline non disponibile). */
  onWarning?: (message: string) => void
  /** Sessione chiusa (stop utente o errore microfono fatale). */
  onEnd: () => void
}

export function createDiscourseCapture(lang = 'it-IT') {
  const dictation = createDictation(lang)
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []
  let startedAt = 0
  let discourseId = ''
  let recording = false
  let sessionActive = false
  let finalizeOnce: Promise<void> | null = null
  let activeHandlers: DiscourseCaptureHandlers | null = null
  let audioCtx: AudioContext | null = null
  let levelRaf = 0

  function stopLevelMeter() {
    if (levelRaf) cancelAnimationFrame(levelRaf)
    levelRaf = 0
    try {
      void audioCtx?.close()
    } catch {
      /* ignore */
    }
    audioCtx = null
  }

  function startLevelMeter(onLevel?: (n: number) => void) {
    if (!onLevel || !stream) return
    try {
      audioCtx = new AudioContext()
      const src = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4))
        levelRaf = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      /* ignore */
    }
  }

  async function start(noteId: string, handlers: DiscourseCaptureHandlers) {
    discourseId = noteId
    chunks = []
    startedAt = Date.now()
    finalizeOnce = null
    activeHandlers = handlers
    sessionActive = true

    if (!mediaRecorderSupported()) {
      handlers.onRecordingError?.(
        'Registrazione non supportata su questo browser. Serve un browser recente con microfono.',
      )
      handlers.onEnd()
      sessionActive = false
      return
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      const mime = pickRecorderMimeType()
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data)
      }
      recorder.onerror = () => {
        handlers.onRecordingError?.('Registrazione audio interrotta.')
      }
      recorder.start(1000)
      recording = true
      startLevelMeter(handlers.onLevel)
    } catch {
      stream = null
      recorder = null
      recording = false
      sessionActive = false
      handlers.onError?.(
        'Microfono non disponibile. Consenti l’accesso nelle impostazioni del browser.',
      )
      handlers.onEnd()
      return
    }

    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    if (offline) {
      handlers.onWarning?.(
        'Offline: registro l’audio sul dispositivo. La trascrizione automatica riprenderà quando torni online (o riascolta e completa a mano).',
      )
    }

    // Dettatura best-effort: errori di rete non chiudono la registrazione
    if (dictation.isSupported) {
      dictation.start({
        stream,
        onPartial: handlers.onPartial,
        onFinal: handlers.onFinal,
        onLevel: undefined, // livello già dallo stream condiviso
        onError: (msg) => {
          if (!sessionActive) return
          const soft =
            /rete|network|offline|richiede rete|riconoscimento vocale/i.test(msg) ||
            (typeof navigator !== 'undefined' && !navigator.onLine)
          if (soft) {
            handlers.onWarning?.(
              'Trascrizione automatica non disponibile al momento (spesso serve rete). Continuo a registrare l’audio in locale.',
            )
            // Non chiamare onEnd: la sessione resta in registrazione
            try {
              dictation.stop()
            } catch {
              /* ignore */
            }
            return
          }
          handlers.onError(msg)
        },
        onEnd: () => {
          // Fine STT senza stop utente: se ancora in sessione, resta solo audio
          if (sessionActive) {
            handlers.onWarning?.(
              'Dettatura in pausa. L’audio continua a registrarsi — tocca Ferma quando hai finito.',
            )
          }
        },
      })
    } else {
      handlers.onWarning?.(
        'Dettatura testo non supportata qui. Registro comunque l’audio per riascoltarlo dopo.',
      )
    }
  }

  function finalizeRecording(): Promise<void> {
    if (finalizeOnce) return finalizeOnce
    finalizeOnce = (async () => {
      const handlers = activeHandlers
      stopLevelMeter()
      if (!recording || !recorder) {
        cleanupStream()
        return
      }
      recording = false
      const durationMs = Date.now() - startedAt
      const rec = recorder
      const blob = await new Promise<Blob | null>((resolve) => {
        if (!rec) {
          resolve(null)
          return
        }
        rec.onstop = () => {
          const type = rec.mimeType || pickRecorderMimeType() || 'audio/webm'
          resolve(chunks.length ? new Blob(chunks, { type }) : null)
        }
        try {
          if (rec.state !== 'inactive') rec.stop()
          else resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType }) : null)
        } catch {
          resolve(null)
        }
      })
      cleanupStream()
      recorder = null
      chunks = []
      if (!blob || blob.size < 256 || !discourseId) return
      try {
        const meta = await saveDiscourseRecording({
          discourseId,
          blob,
          durationMs,
          label: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline' : 'Dettatura',
        })
        handlers?.onRecordingSaved?.(meta)
      } catch {
        handlers?.onRecordingError?.(
          'Impossibile salvare la registrazione su questo dispositivo.',
        )
      }
    })()
    return finalizeOnce
  }

  function cleanupStream() {
    try {
      stream?.getTracks().forEach((t) => t.stop())
    } catch {
      /* ignore */
    }
    stream = null
  }

  function stop() {
    sessionActive = false
    try {
      dictation.stop()
    } catch {
      /* ignore */
    }
    void finalizeRecording().finally(() => {
      activeHandlers?.onEnd()
    })
  }

  return {
    start,
    stop,
    isDictationSupported: dictation.isSupported,
    canRecord: mediaRecorderSupported(),
  }
}
