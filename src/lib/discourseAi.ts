import { askAi } from './ai'
import { normalizeJwItalian } from './jwItalianTerms'

/** Correzione locale (offline): terminologia JW + punteggiatura base. */
export function localPolishDiscourse(raw: string): string {
  let s = normalizeJwItalian(raw || '')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\s+([,.;:!?])/g, '$1')
  s = s.replace(/([.!?…])\s*([a-zàèéìòù])/g, (_, p, c) => `${p} ${c.toUpperCase()}`)
  // Capitalizza inizio testo / dopo a capo
  s = s.replace(/(^|\n)([a-zàèéìòù])/g, (_, a, c) => `${a}${c.toUpperCase()}`)
  return s.trim()
}

/**
 * Sistema sintassi e chiarezza del discorso senza inventare contenuti.
 * Online usa AI; offline (o errore) usa polish locale.
 */
export async function polishDiscourseText(
  text: string,
  opts?: { forceLocal?: boolean },
): Promise<{ text: string; source: 'ai' | 'local' }> {
  const input = text.trim()
  if (!input) return { text: '', source: 'local' }
  if (opts?.forceLocal || typeof navigator !== 'undefined' && !navigator.onLine) {
    return { text: localPolishDiscourse(input), source: 'local' }
  }

  const prompt = `Sei un correttore di bozze per un discorso pubblico di un Testimone di Geova.
Compito: sistema SOLO sintassi, ortografia, punteggiatura e fluidità in italiano.
Regole strette:
- Non aggiungere idee, esempi, citazioni o paragrafi nuovi.
- Non togliere il senso: resta fedele al contenuto dell’utente.
- Conserva i riferimenti biblici così come scritti (es. Proverbi 14:12).
- Usa terminologia jw.org (ministero, congregazione, 1 Corinti, Rivelazione, ecc.).
- Restituisci SOLO il testo corretto, senza prefazioni né markdown.

Testo da correggere:
"""
${input.slice(0, 6000)}
"""`

  try {
    const answer = await askAi({ prompt })
    const cleaned = normalizeJwItalian(answer.trim())
    if (!cleaned || cleaned.length < input.length * 0.4) {
      return { text: localPolishDiscourse(input), source: 'local' }
    }
    return { text: cleaned, source: 'ai' }
  } catch {
    return { text: localPolishDiscourse(input), source: 'local' }
  }
}
