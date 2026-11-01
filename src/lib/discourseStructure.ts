import { uid } from './id'
import type { DiscourseNote, DiscourseSection, DiscourseSectionKind } from '../types'

export const SECTION_KIND_LABEL: Record<DiscourseSectionKind, string> = {
  introduzione: 'Introduzione',
  punto: 'Punto',
  conclusione: 'Conclusione',
}

export function defaultSections(seedBody = ''): DiscourseSection[] {
  return [
    {
      id: uid('dsec'),
      kind: 'introduzione',
      title: 'Introduzione',
      body: seedBody,
      minutes: 2,
    },
    {
      id: uid('dsec'),
      kind: 'punto',
      title: 'Punto 1',
      body: '',
      minutes: 4,
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

export function ensureSections(note: DiscourseNote): DiscourseSection[] {
  if (note.sections && note.sections.length) return note.sections
  return defaultSections(note.body || '')
}

export function joinSections(sections: DiscourseSection[]): string {
  return sections
    .map((s) => {
      const head = s.title.trim() || SECTION_KIND_LABEL[s.kind]
      const body = s.body.trim()
      return body ? `## ${head}\n${body}` : `## ${head}`
    })
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
