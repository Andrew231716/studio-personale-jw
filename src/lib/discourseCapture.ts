/**
 * Cattura Discorso: dettatura + registrazione audio in background sullo stesso stream.
 */

import {
  mediaRecorderSupported,
  pickRecorderMimeType,
  saveDiscourseRecording,
  type DiscourseRecordingMeta,
} from './discourseRecordings'
import { createDictation, type DictationHandlers } from './speechDictation'

export interface DiscourseCaptureHandlers extends Omit<DictationHandlers, 'stream'> {
  onRecordingSaved?: (meta: DiscourseRecordingMeta) => void
  onRecordingError?: (message: string) => void
}

export function createDiscourseCapture(lang = 'it-IT') {
  const dictation = createDictation(lang)
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let chunks: BlobPart[] = []
  let startedAt = 0
  let discourseId = ''
  let recording = false
  let finalizeOnce: Promise<void> | null = null
  let activeHandlers: DiscourseCaptureHandlers | null = null

  async function start(noteId: string, handlers: DiscourseCaptureHandlers) {
    discourseId = noteId
    chunks = []
    startedAt = Date.now()
    finalizeOnce = null
    activeHandlers = handlers

    try {
      if (mediaRecorderSupported()) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        const mime = pickRecorderMimeType()
        recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream)
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data)
        }
        recorder.onerror = () => {
          handlers.onRecordingError?.('Registrazione audio interrotta.')
        }
        // timeslice: pezzi in background, meno perdite se la pagina si sospende
        recorder.start(1000)
        recording = true
      }
    } catch {
      stream = null
      recorder = null
      recording = false
      handlers.onRecordingError?.(
        'Registrazione audio non avviata (permesso microfono o browser). La dettatura può comunque funzionare.',
      )
    }

    dictation.start({
      onPartial: handlers.onPartial,
      onFinal: handlers.onFinal,
      onError: handlers.onError,
      onLevel: handlers.onLevel,
      stream,
      onEnd: () => {
        void finalizeRecording().finally(() => handlers.onEnd())
      },
    })
  }

  function finalizeRecording(): Promise<void> {
    if (finalizeOnce) return finalizeOnce
    finalizeOnce = (async () => {
      const handlers = activeHandlers
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
          label: 'Dettatura',
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
    dictation.stop()
    void finalizeRecording()
  }

  return {
    start,
    stop,
    isDictationSupported: dictation.isSupported,
    canRecord: mediaRecorderSupported(),
  }
}
