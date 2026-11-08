import { uid } from './id'
import type { DiscourseNote, DiscourseSection, DiscourseSectionKind } from '../types'

export const SECTION_KIND_LABEL: Record<DiscourseSectionKind, string> = {
  libera: 'Bozza',
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

export function totalMinutes(sections: DiscourseSection[]): number {
  return sections.reduce((n, s) => n + (Number(s.minutes) || 0), 0)
}

/** Stima progressione lettura: indice sezione in base al tempo trascorso. */
export function sectionIndexForElapsed(
  sections: DiscourseSection[],
  elapsedSec: number,
): number {
  if (!sections.length) return 0
  let acc = 0
  for (let i = 0; i < sections.length; i++) {
    acc += Math.max(0.5, sections[i].minutes || 1) * 60
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
