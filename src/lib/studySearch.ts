import type { BibleReadingPlan, SavedResource, SavedSearch, StudySessionLog, StudyTopic } from '../types'
import { findScriptureRefsInText } from './bibleText'

export type StudySearchKind = 'quaderno' | 'sessione' | 'materiale' | 'ricerca' | 'lettura'
export type StudySearchResult = {
  id: string
  kind: StudySearchKind
  title: string
  date: string
  texts: string[]
}

export function indexStudies(data: {
  topics: StudyTopic[]
  sessions: StudySessionLog[]
  resources: SavedResource[]
  searches: SavedSearch[]
  readings?: BibleReadingPlan[]
}): StudySearchResult[] {
  return [
    ...(data.readings || []).map((plan): StudySearchResult => ({
      id: plan.id,
      kind: 'lettura',
      title: plan.title,
      date: plan.updatedAt || plan.createdAt,
      texts: [
        plan.query,
        plan.blurb || '',
        ...(plan.scriptures || []).flatMap((ref) => [ref.label, ref.bible || '']),
        ...Object.entries(plan.studyProgress?.answers || {}).flat(),
        plan.studyProgress?.action || '',
        ...(plan.reflections || []).map((note) => note.text),
        plan.plan,
      ],
    })),
    ...data.topics.map((topic): StudySearchResult => ({
      id: topic.id,
      kind: 'quaderno',
      title: topic.title,
      date: topic.updatedAt || topic.createdAt,
      texts: [
        topic.interest,
        ...topic.objectives,
        ...topic.reflections.flatMap((item) => [item.prompt, item.response]),
        ...topic.questions.flatMap((item) => [item.question, item.answer]),
        ...topic.practices.flatMap((item) => [item.action, item.outcome]),
        ...topic.resources.flatMap((item) => [item.title, item.notes || '']),
        topic.transcript || '',
      ],
    })),
    ...data.sessions.map((session): StudySearchResult => ({
      id: session.id,
      kind: 'sessione',
      title: session.topicTitle || 'Sessione libera',
      date: session.completedAt,
      texts: [
        session.goal, session.keyVerse, session.highlight, session.practice, session.gratitude,
        session.prayer || '', session.reflection || '', session.question || '', session.answer || '',
        session.resourceTitle || '',
      ],
    })),
    ...data.resources.map((resource): StudySearchResult => ({
      id: resource.id,
      kind: 'materiale',
      title: resource.title,
      date: resource.savedAt,
      texts: [resource.notes || '', resource.sourceQuery || '', resource.bible || ''],
    })),
    ...data.searches.map((search): StudySearchResult => ({
      id: search.id,
      kind: 'ricerca',
      title: search.query,
      date: search.createdAt,
      texts: [search.note || ''],
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))
}

function normalize(text: string | undefined) {
  return (text || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('it')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function localDay(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function findStudies(
  index: StudySearchResult[],
  filters: { query: string; kind: StudySearchKind | ''; from: string; to: string },
) {
  const words = normalize(filters.query).split(' ').filter(Boolean)
  const refs = findScriptureRefsInText(filters.query)
  const scripture = refs.length === 1 && normalize(refs[0].matched) === normalize(filters.query) ? refs[0] : null
  return index.flatMap((item) => {
    if (filters.kind && item.kind !== filters.kind) return []
    const day = localDay(item.date)
    if ((filters.from && day < filters.from) || (filters.to && (!day || day > filters.to))) return []

    const content = [item.title, ...item.texts].join('\n')
    const normalized = normalize(content)
    const matches = scripture
      ? item.texts.includes(scripture.bible) || findScriptureRefsInText(content).some((ref) =>
          ref.bookNum === scripture.bookNum && ref.chapter === scripture.chapter &&
          ref.verse <= scripture.verse && (ref.verseEnd ?? ref.verse) >= scripture.verse,
        )
      : words.every((word) => normalized.includes(word))
    if (!matches) return []

    const match = words.length
      ? item.texts.find((line) => words.some((word) => normalize(line).includes(word)))
      : undefined
    const preview = (match || item.texts.find((line) => line?.trim()) || '').trim()
    return [{ ...item, preview: preview.length > 180 ? `${preview.slice(0, 177)}…` : preview }]
  })
}
