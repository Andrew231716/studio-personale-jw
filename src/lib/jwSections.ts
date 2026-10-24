import type { ContentKind, JwResult, JwResultSection, JwSectionId } from '../types'

export const SECTION_ORDER: JwSectionId[] = [
  'articoli',
  'libri',
  'opuscoli',
  'video',
  'audio',
  'guida_ricerche',
  'indici',
  'bibbia',
  'volantini',
  'programmi',
  'altro',
]

export const SECTION_LABELS: Record<JwSectionId, string> = {
  articoli: 'Articoli',
  libri: 'Libri',
  opuscoli: 'Opuscoli',
  video: 'Video',
  audio: 'Audio',
  guida_ricerche: 'Guida alle ricerche',
  indici: 'Indice delle pubblicazioni',
  bibbia: 'Bibbia',
  volantini: 'Volantini e inviti',
  programmi: 'Programmi',
  altro: 'Altro',
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Classifica un risultato nella sezione del sito a partire da subtype + context. */
export function classifySection(opts: {
  subtype?: string
  context?: string
  groupLabel?: string
  layoutHints?: string[]
}): JwSectionId {
  const subtype = norm(opts.subtype || '')
  const context = norm(opts.context || '')
  const group = norm(opts.groupLabel || '')
  const layout = (opts.layoutHints || []).map(norm)

  if (subtype === 'video' || subtype === 'videocategory' || layout.includes('videos') || group === 'video') {
    return 'video'
  }
  if (subtype === 'audio' || subtype === 'audiocategory' || layout.includes('audio') || context === 'musica') {
    return 'audio'
  }
  if (subtype === 'verse' || context.includes('traduzione del nuovo mondo') || context.startsWith('bibbia')) {
    return 'bibbia'
  }
  if (context.includes('guida alle ricerche')) {
    return 'guida_ricerche'
  }
  if (
    subtype === 'index' ||
    context.includes('indice delle pubblicazioni') ||
    group.includes('indice') ||
    group.includes('soggetti')
  ) {
    return 'indici'
  }
  if (context.includes('volantin') || context.includes('inviti')) {
    return 'volantini'
  }
  if (context.includes('programmi') || context.includes('programma dell')) {
    return 'programmi'
  }
  if (context === 'libri' || context.startsWith('libri ')) {
    return 'libri'
  }
  if (
    context.includes('opuscol') ||
    context.includes('brochure') ||
    context.includes('trattat')
  ) {
    return 'opuscoli'
  }

  // Opere di consultazione tipiche → libri
  if (
    context.includes('perspicacia') ||
    context.includes('ausiliario') ||
    context.includes('ragioniamo') ||
    context.includes('insight') ||
    context.includes('goditi la vita') ||
    context.includes('cosa insegna') ||
    context.includes('seguire gesu') ||
    context.includes('ama le persone')
  ) {
    return 'libri'
  }

  if (subtype === 'publication') {
    // publication senza context tipicamente libro/opuscolo: default libri
    return 'libri'
  }

  if (
    subtype === 'periodical' ||
    subtype === 'article' ||
    context.includes('torre di guardia') ||
    context.includes('svegliatevi') ||
    context.includes('ministero del regno') ||
    context.includes('servizio del regno') ||
    context.includes('risveglio')
  ) {
    return 'articoli'
  }

  if (layout.includes('publications')) return 'articoli'
  return 'altro'
}

export function sectionToKind(section: JwSectionId, subtype?: string): ContentKind {
  const s = norm(subtype || '')
  if (section === 'video' || s === 'video') return 'video'
  if (section === 'audio' || s === 'audio') return 'audio'
  if (section === 'indici' || section === 'guida_ricerche' || s === 'index') return 'index'
  if (section === 'bibbia' || s === 'verse') return 'bible'
  if (section === 'libri') return 'book'
  if (section === 'opuscoli' || section === 'volantini') return 'brochure'
  if (section === 'articoli') return 'article'
  if (s === 'article' || s === 'periodical') return 'article'
  if (s === 'publication') return 'book'
  return 'other'
}

export function groupResultsBySection(results: JwResult[]): JwResultSection[] {
  const buckets = new Map<JwSectionId, JwResult[]>()
  for (const r of results) {
    const list = buckets.get(r.section) || []
    list.push(r)
    buckets.set(r.section, list)
  }
  return SECTION_ORDER.filter((id) => (buckets.get(id)?.length || 0) > 0).map((id) => ({
    id,
    label: SECTION_LABELS[id],
    items: (buckets.get(id) || []).sort(
      (a, b) => (b.themeScore || 0) - (a.themeScore || 0) || (a.rank || 99) - (b.rank || 99),
    ),
  }))
}

export function sectionLabel(id: JwSectionId): string {
  return SECTION_LABELS[id]
}
