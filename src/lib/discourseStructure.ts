import { uid } from './id'
import type { DiscourseNote, DiscourseSection, DiscourseSectionKind } from '../types'

export const SECTION_KIND_LABEL: Record<DiscourseSectionKind, string> = {
  libera: 'Blocco',
  introduzione: 'Introduzione',
  punto: 'Punto',
  conclusione: 'Conclusione',
}

/** Una sola bozza libera (senza intro/punti/conclusione). */
export function defaultSections(seedBody = ''): DiscourseSection[] {
  return [
    {
      id: uid('dsec'),
      kind: 'libera',
      title: '',
      body: seedBody,
      minutes: 8,
    },
  ]
}

function isClassicEmptyTemplate(sections: DiscourseSection[]): boolean {
  if (sections.length !== 3) return false
  const [a, b, c] = sections
  return (
    a.kind === 'introduzione' &&
    b.kind === 'punto' &&
    c.kind === 'conclusione' &&
    !b.body.trim() &&
    !c.body.trim()
  )
}

/** Unisce tutto il testo senza perdere contenuto. */
export function flattenSectionBodies(sections: DiscourseSection[]): string {
  return sections
    .map((s) => s.body.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

export function ensureSections(note: DiscourseNote): DiscourseSection[] {
  if (note.sections && note.sections.length) {
    // Vecchio template vuoto → una sola bozza libera, testo conservato
    if (isClassicEmptyTemplate(note.sections)) {
      return defaultSections(flattenSectionBodies(note.sections) || note.body || '')
    }
    return note.sections
  }
  return defaultSections(note.body || '')
}

export function joinSections(sections: DiscourseSection[]): string {
  return sections
    .map((s) => {
      const head =
        s.title.trim() ||
        (s.kind === 'libera' ? '' : SECTION_KIND_LABEL[s.kind])
      const body = s.body.trim()
      if (!head) return body
      return body ? `## ${head}\n${body}` : `## ${head}`
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

/** Durata obiettivo del blocco (minuti pianificati), mai sostituita dalla registrazione. */
export function sectionDurationSeconds(section: DiscourseSection): number {
  return (Number(section.minutes) || 0) * 60
}

/** Tempo effettivo registrato (somma clip), se presente. */
export function sectionRecordedSeconds(section: DiscourseSection): number {
  return section.recordedDurationMs == null
    ? 0
    : Math.round(section.recordedDurationMs / 1000)
}

export function totalMinutes(sections: DiscourseSection[]): number {
  return sections.reduce((n, s) => n + sectionDurationSeconds(s), 0) / 60
}

/** Stima progressione lettura: indice sezione in base al tempo trascorso. */
export function sectionIndexForElapsed(
  sections: DiscourseSection[],
  elapsedSec: number,
): number {
  if (!sections.length) return 0
  let acc = 0
  for (let i = 0; i < sections.length; i++) {
    acc += sectionDurationSeconds(sections[i])
    if (elapsedSec < acc) return i
  }
  return sections.length - 1
}

export function wordsPerSection(sections: DiscourseSection[]): number[] {
  return sections.map((s) => s.body.trim().split(/\s+/).filter(Boolean).length)
}

/** Heuristica locale: intro / punti / conclusione senza togliere parole. */
export function localStructureSections(fullText: string): DiscourseSection[] {
  const text = fullText.trim()
  if (!text) return defaultSections('')

  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paras.length === 1) {
    const sentences = text.split(/(?<=[.!?…])\s+/).filter((s) => s.trim())
    if (sentences.length <= 2) {
      return [
        {
          id: uid('dsec'),
          kind: 'introduzione',
          title: 'Introduzione',
          body: text,
          minutes: 3,
        },
        {
          id: uid('dsec'),
          kind: 'conclusione',
          title: 'Conclusione',
          body: '',
          minutes: 2,
        },
      ]
    }
    const introN = Math.max(1, Math.ceil(sentences.length * 0.2))
    const conclN = Math.max(1, Math.ceil(sentences.length * 0.2))
    const mid = sentences.slice(introN, Math.max(introN, sentences.length - conclN))
    const intro = sentences.slice(0, introN).join(' ')
    const concl = sentences.slice(sentences.length - conclN).join(' ')
    const points =
      mid.length > 0
        ? chunkByCount(mid, Math.min(3, Math.max(1, Math.ceil(mid.length / 4))))
        : [sentences.slice(introN, sentences.length - conclN)]
    const secs: DiscourseSection[] = [
      {
        id: uid('dsec'),
        kind: 'introduzione',
        title: 'Introduzione',
        body: intro,
        minutes: 2,
      },
    ]
    points.forEach((chunk, i) => {
      const body = Array.isArray(chunk) ? chunk.join(' ') : String(chunk)
      if (!body.trim()) return
      secs.push({
        id: uid('dsec'),
        kind: 'punto',
        title: `Punto ${i + 1}`,
        body: body.trim(),
        minutes: 4,
      })
    })
    secs.push({
      id: uid('dsec'),
      kind: 'conclusione',
      title: 'Conclusione',
      body: concl,
      minutes: 2,
    })
    return secs
  }

  const intro = paras[0]
  const concl = paras.length > 1 ? paras[paras.length - 1] : ''
  const middle = paras.length > 2 ? paras.slice(1, -1) : []
  const secs: DiscourseSection[] = [
    {
      id: uid('dsec'),
      kind: 'introduzione',
      title: 'Introduzione',
      body: intro,
      minutes: 2,
    },
  ]
  if (middle.length === 0 && paras.length === 2) {
    secs.push({
      id: uid('dsec'),
      kind: 'punto',
      title: 'Punto 1',
      body: '',
      minutes: 4,
    })
  } else {
    middle.forEach((p, i) => {
      secs.push({
        id: uid('dsec'),
        kind: 'punto',
        title: `Punto ${i + 1}`,
        body: p,
        minutes: 4,
      })
    })
  }
  secs.push({
    id: uid('dsec'),
    kind: 'conclusione',
    title: 'Conclusione',
    body: concl,
    minutes: 2,
  })
  return secs
}

function chunkByCount<T>(items: T[], groups: number): T[][] {
  const n = Math.max(1, groups)
  const size = Math.ceil(items.length / n)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Verifica che la struttura conservi almeno ~85% delle parole originali. */
export function structurePreservesContent(
  original: string,
  sections: DiscourseSection[],
): boolean {
  const normWords = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1)
  const o = normWords(original)
  if (!o.length) return true
  const j = new Set(normWords(flattenSectionBodies(sections)))
  let hit = 0
  for (const w of o) if (j.has(w)) hit++
  return hit / o.length >= 0.85
}

/** Unità del discorso (paragrafi o frasi) da assegnare senza riscrivere il testo. */
export function splitDiscourseUnits(fullText: string): string[] {
  const text = fullText.trim()
  if (!text) return []
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (paras.length >= 2) return paras
  const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean)
  if (sentences.length >= 3) return sentences
  return [text]
}

/** Spezza in pezzi ai confini di frase/paragrafo senza perdere testo. */
export function splitForPolish(text: string, maxChars = 2800): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const parts: string[] = []
  let rest = trimmed
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars)
    let cut =
      Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
        window.lastIndexOf('… '),
      ) + 1
    if (cut < maxChars * 0.4) cut = maxChars
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

export type StructurePlan = {
  introduzione: number[]
  punti: Array<{ title: string; units: number[] }>
  conclusione: number[]
}

function normalizeIndexList(raw: unknown, unitCount: number): number[] {
  if (!Array.isArray(raw)) return []
  const out: number[] = []
  for (const item of raw) {
    const n = Number(item)
    if (!Number.isInteger(n) || n < 0 || n >= unitCount) continue
    if (!out.includes(n)) out.push(n)
  }
  return out.sort((a, b) => a - b)
}

/** Interpreta il JSON di indici prodotto dall’AI. */
export function parseStructurePlan(raw: string, unitCount: number): StructurePlan | null {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const data = JSON.parse(match[0]) as {
      introduzione?: number[]
      punti?: Array<{ title?: string; units?: number[]; paras?: number[] } | number[]>
      conclusione?: number[]
    }
    const intro = normalizeIndexList(data.introduzione, unitCount)
    const concl = normalizeIndexList(data.conclusione, unitCount)
    const puntiRaw = Array.isArray(data.punti) ? data.punti : []
    const punti: Array<{ title: string; units: number[] }> = []
    puntiRaw.forEach((p, i) => {
      if (Array.isArray(p)) {
        const units = normalizeIndexList(p, unitCount)
        if (units.length) punti.push({ title: `Punto ${i + 1}`, units })
        return
      }
      const units = normalizeIndexList(p?.units || p?.paras, unitCount)
      if (!units.length) return
      punti.push({
        title: String(p?.title || `Punto ${i + 1}`).trim() || `Punto ${i + 1}`,
        units,
      })
    })

    const used = new Set<number>([...intro, ...concl, ...punti.flatMap((p) => p.units)])
    const missing: number[] = []
    for (let i = 0; i < unitCount; i++) if (!used.has(i)) missing.push(i)
    if (missing.length) {
      if (punti.length) {
        punti[punti.length - 1].units = [...punti[punti.length - 1].units, ...missing].sort(
          (a, b) => a - b,
        )
      } else if (concl.length) {
        concl.push(...missing)
        concl.sort((a, b) => a - b)
      } else {
        intro.push(...missing)
        intro.sort((a, b) => a - b)
      }
    }

    const seen = new Set<number>()
    const take = (list: number[]) => {
      const out: number[] = []
      for (const i of list) {
        if (seen.has(i)) continue
        seen.add(i)
        out.push(i)
      }
      return out
    }
    return {
      introduzione: take(intro),
      punti: punti
        .map((p, i) => ({ title: p.title || `Punto ${i + 1}`, units: take(p.units) }))
        .filter((p) => p.units.length),
      conclusione: take(concl),
    }
  } catch {
    return null
  }
}

/** Ricopia le unità originali nelle sezioni secondo il piano AI. */
export function sectionsFromUnits(
  units: string[],
  plan: StructurePlan,
): DiscourseSection[] {
  const join = (idxs: number[]) =>
    idxs
      .map((i) => units[i])
      .filter(Boolean)
      .join('\n\n')
      .trim()

  const sections: DiscourseSection[] = []
  sections.push({
    id: uid('dsec'),
    kind: 'introduzione',
    title: 'Introduzione',
    body: join(plan.introduzione),
    minutes: 2,
  })
  plan.punti.forEach((p, i) => {
    const body = join(p.units)
    if (!body) return
    sections.push({
      id: uid('dsec'),
      kind: 'punto',
      title: p.title || `Punto ${i + 1}`,
      body,
      minutes: 4,
    })
  })
  sections.push({
    id: uid('dsec'),
    kind: 'conclusione',
    title: 'Conclusione',
    body: join(plan.conclusione),
    minutes: 2,
  })

  const covered = new Set([
    ...plan.introduzione,
    ...plan.conclusione,
    ...plan.punti.flatMap((p) => p.units),
  ])
  const leftover = units
    .map((u, i) => (covered.has(i) ? '' : u))
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (leftover) {
    const last = sections[sections.length - 1]
    last.body = `${last.body.trim()}\n\n${leftover}`.trim()
  }

  if (!flattenSectionBodies(sections).trim()) return []
  return sections
}
