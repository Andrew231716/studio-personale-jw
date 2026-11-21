import { askAi } from './ai'
import {
  localStructureSections,
  parseStructurePlan,
  sectionsFromUnits,
  splitDiscourseUnits,
  splitForPolish,
  structurePreservesContent,
} from './discourseStructure'
import { normalizeJwItalian } from './jwItalianTerms'
import type { DiscourseSection } from '../types'

export {
  parseStructurePlan,
  sectionsFromUnits,
  splitDiscourseUnits,
  splitForPolish,
} from './discourseStructure'

/** Contesto struttura: tutto il discorso numerato. */
const STRUCTURE_CONTEXT_CHARS = 80_000

/** Correzione locale (offline): terminologia JW + punteggiatura base. */
export function localPolishDiscourse(raw: string): string {
  let s = normalizeJwItalian(raw || '')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\s+([,.;:!?])/g, '$1')
  s = s.replace(/([.!?…])\s*([a-zàèéìòù])/g, (_, p, c) => `${p} ${c.toUpperCase()}`)
  s = s.replace(/(^|\n)([a-zàèéìòù])/g, (_, a, c) => `${a}${c.toUpperCase()}`)
  return s.trim()
}

/**
 * Sistema sintassi e chiarezza del discorso senza inventare contenuti.
 * Online usa AI a chunk (testo intero); offline (o errore) usa polish locale.
 */
export async function polishDiscourseText(
  text: string,
  opts?: { forceLocal?: boolean },
): Promise<{ text: string; source: 'ai' | 'local' }> {
  const input = text.trim()
  if (!input) return { text: '', source: 'local' }
  if (opts?.forceLocal || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { text: localPolishDiscourse(input), source: 'local' }
  }

  const chunks = splitForPolish(input)
  const out: string[] = []
  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const prompt = `Sei un correttore di bozze per un discorso pubblico di un Testimone di Geova.
Compito: sistema SOLO sintassi, ortografia, punteggiatura e fluidità in italiano.
Regole strette:
- Non aggiungere idee, esempi, citazioni o paragrafi nuovi.
- Non togliere il senso: resta fedele al contenuto dell’utente.
- Conserva i riferimenti biblici così come scritti (es. Proverbi 14:12).
- Usa terminologia jw.org (ministero, congregazione, 1 Corinti, Rivelazione, ecc.).
- Restituisci SOLO il testo corretto di QUESTO pezzo (${i + 1}/${chunks.length}), senza prefazioni né markdown.

Testo da correggere:
"""
${chunk}
"""`
      const answer = await askAi({
        prompt,
        maxTokens: 2048,
        promptCharLimit: 12_000,
        concise: false,
      })
      const cleaned = normalizeJwItalian(answer.trim())
      if (!cleaned || cleaned.length < chunk.length * 0.35) {
        out.push(localPolishDiscourse(chunk))
      } else {
        out.push(cleaned)
      }
    }
    const joined = out.join('\n\n').trim()
    if (!joined || joined.length < input.length * 0.4) {
      return { text: localPolishDiscourse(input), source: 'local' }
    }
    return { text: joined, source: 'ai' }
  } catch {
    return { text: localPolishDiscourse(input), source: 'local' }
  }
}

/**
 * Analisi AI: chiede solo l’assegnazione delle unità, poi ricopia il testo originale.
 * Così non si tagliano pezzi per limiti di token in uscita.
 */
export async function structureDiscourseWithAi(
  fullText: string,
  opts?: { forceLocal?: boolean },
): Promise<{ sections: DiscourseSection[]; source: 'ai' | 'local' }> {
  const input = fullText.trim()
  if (!input) return { sections: localStructureSections(''), source: 'local' }

  const local = () => ({
    sections: localStructureSections(input),
    source: 'local' as const,
  })

  if (opts?.forceLocal || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return local()
  }

  const units = splitDiscourseUnits(input)
  if (units.length <= 2) {
    return local()
  }

  const numbered = units
    .map((u, i) => `[${i}]\n${u}`)
    .join('\n\n')
    .slice(0, STRUCTURE_CONTEXT_CHARS)

  const prompt = `Assegna ogni unità numerata [0]…[${units.length - 1}] a Introduzione, Punti (1–5) o Conclusione.
Restituisci SOLO JSON valido, senza markdown:
{"introduzione":[0],"punti":[{"title":"Punto 1","units":[1,2]}],"conclusione":[${units.length - 1}]}
Regole:
- Ogni indice da 0 a ${units.length - 1} compare ESATTAMENTE una volta.
- Gli indici in ogni lista sono in ordine crescente.
- Non riscrivere il testo: solo indici e titoli brevi dei punti.
- Italiano JW; 1–5 punti.`

  try {
    const answer = await askAi({
      prompt,
      context: `## Unità del discorso (testo originale)\n${numbered}`,
      maxTokens: 1024,
      promptCharLimit: 2500,
      contextCharLimit: STRUCTURE_CONTEXT_CHARS,
      concise: false,
    })
    const plan = parseStructurePlan(answer, units.length)
    if (!plan) return local()
    const sections = sectionsFromUnits(units, plan)
    if (!sections.length || !structurePreservesContent(input, sections)) {
      return local()
    }
    return { sections, source: 'ai' }
  } catch {
    return local()
  }
}
