/**
 * Correzione AI in background mentre si detta («Sistema mentre detta»).
 * Lavora a debounce su frasi complete, senza inventare contenuti.
 */

import { polishDiscourseText } from './discourseAi'
import { refineDiscourseSpeechText } from './discourseTextRefine'

export type LivePolishController = {
  /** Aggiorna il testo corrente della sezione; avvia il timer. */
  notify: (fullText: string) => void
  /** Forza un passaggio immediato e attende. */
  flush: () => Promise<string | null>
  /** Annulla timer e richieste in corso. */
  cancel: () => void
  /** True se c’è un polish in corso o in coda. */
  busy: () => boolean
}

/**
 * Crea un controller di polish live.
 * onResult riceve il testo raffinato (solo se ancora pertinente).
 */
export function createLivePolishController(opts: {
  delayMs?: number
  minChars?: number
  enabled: () => boolean
  online: () => boolean
  onBusy?: (busy: boolean) => void
  onResult: (text: string) => void
  onHint?: (msg: string) => void
}): LivePolishController {
  const delayMs = opts.delayMs ?? 4500
  const minChars = opts.minChars ?? 80
  let timer = 0
  let generation = 0
  let inFlight = false
  let pendingText = ''
  let lastSent = ''

  const cancel = () => {
    if (timer) window.clearTimeout(timer)
    timer = 0
    generation++
    inFlight = false
    opts.onBusy?.(false)
  }

  const run = async (text: string) => {
    const local = refineDiscourseSpeechText(text)
    if (!local || local === lastSent) return null
    if (!opts.enabled()) return local
    if (!opts.online()) {
      lastSent = local
      opts.onResult(local)
      return local
    }
    const myGen = ++generation
    inFlight = true
    opts.onBusy?.(true)
    opts.onHint?.('Correggo in background…')
    try {
      const { text: polished, source } = await polishDiscourseText(local)
      if (myGen !== generation) return null
      const next = refineDiscourseSpeechText(polished || local)
      lastSent = next
      opts.onResult(next)
      opts.onHint?.(
        source === 'ai'
          ? 'Correzione live applicata.'
          : 'Correzione locale applicata (rete assente o AI non disponibile).',
      )
      return next
    } catch {
      if (myGen !== generation) return null
      lastSent = local
      opts.onResult(local)
      return local
    } finally {
      if (myGen === generation) {
        inFlight = false
        opts.onBusy?.(false)
      }
    }
  }

  return {
    notify(fullText) {
      pendingText = fullText
      if (!opts.enabled()) return
      if (fullText.trim().length < minChars) return
      // Attendi una fine frase prima di schedulare
      if (!/[.!?…]\s*\S[\s\S]{20,}$/.test(fullText) && fullText.trim().length < minChars * 2) {
        return
      }
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        void run(pendingText)
      }, delayMs)
    },
    async flush() {
      if (timer) window.clearTimeout(timer)
      timer = 0
      return run(pendingText || lastSent)
    },
    cancel,
    busy: () => inFlight || timer !== 0,
  }
}
