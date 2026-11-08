import { askAi } from './ai'
import {
  flattenSectionBodies,
  localStructureSections,
  structurePreservesContent,
} from './discourseStructure'
import { uid } from './id'
import { normalizeJwItalian } from './jwItalianTerms'
import type { DiscourseSection } from '../types'

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

/**
 * Analisi AI: suddivide in Introduzione / Punti / Conclusione
 * senza eliminare informazioni. Se l’AI perde contenuto → struttura locale.
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

  const prompt = `Suddividi il discorso nel contesto in sezioni.
Restituisci SOLO JSON valido, senza markdown:
{"introduzione":"...","punti":[{"title":"Punto 1","body":"..."}],"conclusione":"..."}
Regole: NON eliminare idee/esempi/scritture; ogni contenuto deve ricomparire; 1–5 punti; italiano JW.`

  try {
    const answer = await askAi({
      prompt,
      context: `## Discorso da strutturare\n${input.slice(0, 10_000)}`,
    })
    const parsed = parseStructureJson(answer)
    if (!parsed) return local()
    const sections = parsed
    if (!structurePreservesContent(input, sections)) {
      // Conserva tutto: usa locale (nessuna perdita) invece della risposta incompleta
      return local()
    }
    // Se resta testo non coperto, appendi alla conclusione
    const leftover = findMissingTail(input, sections)
    if (leftover) {
      const last = sections[sections.length - 1]
      if (last) last.body = `${last.body.trim()}\n\n${leftover}`.trim()
      else
        sections.push({
          id: uid('dsec'),
          kind: 'conclusione',
          title: 'Conclusione',
          body: leftover,
          minutes: 2,
        })
    }
    return { sections, source: 'ai' }
  } catch {
    return local()
  }
}

function parseStructureJson(raw: string): DiscourseSection[] | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const data = JSON.parse(match[0]) as {
      introduzione?: string
      punti?: Array<{ title?: string; body?: string } | string>
      conclusione?: string
    }
    const sections: DiscourseSection[] = []
    const intro = String(data.introduzione || '').trim()
    if (intro) {
      sections.push({
        id: uid('dsec'),
        kind: 'introduzione',
        title: 'Introduzione',
        body: normalizeJwItalian(intro),
        minutes: 2,
      })
    }
    const points = Array.isArray(data.punti) ? data.punti : []
    points.forEach((p, i) => {
      const body = normalizeJwItalian(
        typeof p === 'string' ? p : String(p?.body || ''),
      ).trim()
      if (!body) return
      const title =
        typeof p === 'string'
          ? `Punto ${i + 1}`
          : String(p?.title || `Punto ${i + 1}`).trim() || `Punto ${i + 1}`
      sections.push({
        id: uid('dsec'),
        kind: 'punto',
        title,
        body,
        minutes: 4,
      })
    })
    const concl = String(data.conclusione || '').trim()
    if (concl) {
      sections.push({
        id: uid('dsec'),
        kind: 'conclusione',
        title: 'Conclusione',
        body: normalizeJwItalian(concl),
        minutes: 2,
      })
    }
    if (!sections.length) return null
    if (!sections.some((s) => s.kind === 'introduzione')) {
      sections.unshift({
        id: uid('dsec'),
        kind: 'introduzione',
        title: 'Introduzione',
        body: '',
        minutes: 2,
      })
    }
    if (!sections.some((s) => s.kind === 'conclusione')) {
      sections.push({
        id: uid('dsec'),
        kind: 'conclusione',
        title: 'Conclusione',
        body: '',
        minutes: 2,
      })
    }
    return sections
  } catch {
    return null
  }
}

function findMissingTail(original: string, sections: DiscourseSection[]): string {
  const joined = flattenSectionBodies(sections)
  const oWords = original.trim().split(/\s+/).filter(Boolean)
  const jSet = new Set(
    joined
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter(Boolean),
  )
  const missing: string[] = []
  for (const w of oWords) {
    const key = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
    if (key && !jSet.has(key)) missing.push(w)
  }
  if (missing.length < 8) return ''
  return missing.join(' ')
}
