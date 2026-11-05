import { openAiRequestExtras } from './ai'
import { localPolishDiscourse } from './discourseAi'
import { ensureSections, joinSections, totalMinutes } from './discourseStructure'
import { normalizeJwItalian } from './jwItalianTerms'
import type { StudySummary } from './studySummary'
import type {
  DecisionItem,
  DiscourseNote,
  DiscourseSection,
  StudySessionLog,
  StudyTopic,
} from '../types'

export type ExportReviseKind = 'discorso' | 'riepilogo' | 'argomento' | 'decisione'

export interface ExportPiece {
  id: string
  text: string
}

export interface ExportReviseMeta {
  engine: 'ai' | 'local'
  changed: boolean
  message: string
}

function polishLocal(text: string): string {
  return normalizeJwItalian(localPolishDiscourse(text))
}

async function revisePiecesRemote(
  kind: ExportReviseKind,
  language: string,
  pieces: ExportPiece[],
): Promise<{ pieces: ExportPiece[]; engine: 'ai' | 'local' }> {
  const prepared = pieces
    .map((p) => ({ id: p.id, text: polishLocal(p.text) }))
    .filter((p) => p.text.trim())

  if (!prepared.length) return { pieces: [], engine: 'local' }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { pieces: prepared, engine: 'local' }
  }

  try {
    const extras = openAiRequestExtras()
    const res = await fetch('/api/export-revise', {
      method: 'POST',
      headers: extras.headers,
      body: JSON.stringify({
        kind,
        language,
        pieces: prepared,
        model: extras.apiKey ? extras.model : undefined,
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as {
      engine?: 'ai' | 'local'
      pieces?: ExportPiece[]
    }
    if (!Array.isArray(data.pieces) || !data.pieces.length) {
      return { pieces: prepared, engine: 'local' }
    }
    const byId = new Map(data.pieces.map((p) => [p.id, polishLocal(p.text)]))
    return {
      engine: data.engine === 'ai' ? 'ai' : 'local',
      pieces: prepared.map((p) => ({
        id: p.id,
        text: byId.get(p.id) || p.text,
      })),
    }
  } catch {
    return { pieces: prepared, engine: 'local' }
  }
}

function mapChanged(
  before: ExportPiece[],
  after: ExportPiece[],
): boolean {
  const b = new Map(before.map((p) => [p.id, p.text.trim()]))
  return after.some((p) => (b.get(p.id) || '') !== p.text.trim())
}

/** Revisione discorso: corregge titolo e sezioni, pronto per PDF/EPUB e UI. */
export async function reviseDiscourseForExport(
  note: DiscourseNote,
  language = 'I',
): Promise<{ note: DiscourseNote; meta: ExportReviseMeta }> {
  const sections = ensureSections(note)
  const pieces: ExportPiece[] = [
    { id: 'title', text: note.title || 'Discorso' },
    ...sections.map((s) => ({
      id: `section:${s.id}`,
      text: s.body || '',
    })),
  ].filter((p) => p.text.trim())

  const before = pieces.map((p) => ({ ...p }))
  const { pieces: revised, engine } = await revisePiecesRemote('discorso', language, pieces)
  const byId = new Map(revised.map((p) => [p.id, p.text]))

  const nextSections: DiscourseSection[] = sections.map((s) => ({
    ...s,
    body: byId.get(`section:${s.id}`) ?? polishLocal(s.body || ''),
  }))
  const nextTitle = byId.get('title') || polishLocal(note.title || 'Discorso')
  const next: DiscourseNote = {
    ...note,
    title: nextTitle,
    sections: nextSections,
    body: joinSections(nextSections),
    estimatedMinutes: totalMinutes(nextSections),
    updatedAt: new Date().toISOString(),
  }

  const changed = mapChanged(before, revised)
  return {
    note: next,
    meta: {
      engine,
      changed,
      message: changed
        ? engine === 'ai'
          ? 'Documento revisionato (grammatica, struttura e terminologia) prima dell’export.'
          : 'Documento ripulito in locale prima dell’export.'
        : 'Documento già in ordine: export avviato.',
    },
  }
}

function collectSummaryPieces(summary: StudySummary): ExportPiece[] {
  const pieces: ExportPiece[] = []
  if (summary.heading?.trim()) {
    pieces.push({ id: 'heading', text: summary.heading })
  }
  for (const t of summary.topics) {
    if (t.title?.trim()) pieces.push({ id: `topic:${t.id}:title`, text: t.title })
    if (t.interest?.trim()) pieces.push({ id: `topic:${t.id}:interest`, text: t.interest })
    t.objectives?.forEach((o, i) => {
      if (o?.trim()) pieces.push({ id: `topic:${t.id}:obj:${i}`, text: o })
    })
    t.reflections?.forEach((r) => {
      if (r.prompt?.trim()) pieces.push({ id: `topic:${t.id}:ref:${r.id}:prompt`, text: r.prompt })
      if (r.response?.trim())
        pieces.push({ id: `topic:${t.id}:ref:${r.id}:response`, text: r.response })
    })
    t.questions?.forEach((q) => {
      if (q.question?.trim())
        pieces.push({ id: `topic:${t.id}:q:${q.id}:question`, text: q.question })
      if (q.answer?.trim()) pieces.push({ id: `topic:${t.id}:q:${q.id}:answer`, text: q.answer })
    })
    t.practices?.forEach((p) => {
      if (p.action?.trim()) pieces.push({ id: `topic:${t.id}:prac:${p.id}:action`, text: p.action })
      if (p.outcome?.trim())
        pieces.push({ id: `topic:${t.id}:prac:${p.id}:outcome`, text: p.outcome })
    })
  }
  for (const d of summary.decisions) {
    const fields: Array<[string, string | undefined]> = [
      ['title', d.title],
      ['context', d.context],
      ['chosenDecision', d.chosenDecision],
      ['honestMotivations', d.honestMotivations],
      ['conclusionsSummary', d.conclusionsSummary],
      ['nextStepsPlan', d.nextStepsPlan],
      ['conclusion', d.conclusion],
      ['aiElaboration', d.aiElaboration],
      ['lucidityAnalysis', d.lucidityAnalysis],
      ['prayerNotes', d.prayerNotes],
    ]
    for (const [key, value] of fields) {
      if (value?.trim()) pieces.push({ id: `decision:${d.id}:${key}`, text: value })
    }
  }
  for (const s of summary.sessions) {
    const fields: Array<[string, string | undefined]> = [
      ['prayer', s.prayer],
      ['goal', s.goal],
      ['highlight', s.highlight],
      ['reflection', s.reflection],
      ['question', s.question],
      ['answer', s.answer],
      ['practice', s.practice],
      ['gratitude', s.gratitude],
      ['keyVerse', s.keyVerse],
    ]
    for (const [key, value] of fields) {
      if (value?.trim()) pieces.push({ id: `session:${s.id}:${key}`, text: value })
    }
  }
  return pieces
}

function applyPiecesToSummary(summary: StudySummary, byId: Map<string, string>): StudySummary {
  const topics: StudyTopic[] = summary.topics.map((t) => ({
    ...t,
    title: byId.get(`topic:${t.id}:title`) ?? t.title,
    interest: byId.get(`topic:${t.id}:interest`) ?? t.interest,
    objectives: (t.objectives || []).map(
      (o, i) => byId.get(`topic:${t.id}:obj:${i}`) ?? o,
    ),
    reflections: (t.reflections || []).map((r) => ({
      ...r,
      prompt: byId.get(`topic:${t.id}:ref:${r.id}:prompt`) ?? r.prompt,
      response: byId.get(`topic:${t.id}:ref:${r.id}:response`) ?? r.response,
    })),
    questions: (t.questions || []).map((q) => ({
      ...q,
      question: byId.get(`topic:${t.id}:q:${q.id}:question`) ?? q.question,
      answer: byId.get(`topic:${t.id}:q:${q.id}:answer`) ?? q.answer,
    })),
    practices: (t.practices || []).map((p) => ({
      ...p,
      action: byId.get(`topic:${t.id}:prac:${p.id}:action`) ?? p.action,
      outcome: byId.get(`topic:${t.id}:prac:${p.id}:outcome`) ?? p.outcome,
    })),
    updatedAt: new Date().toISOString(),
  }))

  const decisions: DecisionItem[] = summary.decisions.map((d) => {
    const get = (key: string) => byId.get(`decision:${d.id}:${key}`)
    return {
      ...d,
      title: get('title') ?? d.title,
      context: get('context') ?? d.context,
      chosenDecision: get('chosenDecision') ?? d.chosenDecision,
      honestMotivations: get('honestMotivations') ?? d.honestMotivations,
      conclusionsSummary: get('conclusionsSummary') ?? d.conclusionsSummary,
      nextStepsPlan: get('nextStepsPlan') ?? d.nextStepsPlan,
      conclusion: get('conclusion') ?? d.conclusion,
      aiElaboration: get('aiElaboration') ?? d.aiElaboration,
      lucidityAnalysis: get('lucidityAnalysis') ?? d.lucidityAnalysis,
      prayerNotes: get('prayerNotes') ?? d.prayerNotes,
      updatedAt: new Date().toISOString(),
    }
  })

  const sessions: StudySessionLog[] = summary.sessions.map((s) => {
    const get = (key: string) => byId.get(`session:${s.id}:${key}`)
    return {
      ...s,
      prayer: get('prayer') ?? s.prayer,
      goal: get('goal') ?? s.goal,
      highlight: get('highlight') ?? s.highlight,
      reflection: get('reflection') ?? s.reflection,
      question: get('question') ?? s.question,
      answer: get('answer') ?? s.answer,
      practice: get('practice') ?? s.practice,
      gratitude: get('gratitude') ?? s.gratitude,
      keyVerse: get('keyVerse') ?? s.keyVerse,
    }
  })

  return {
    ...summary,
    heading: byId.get('heading') ?? summary.heading,
    topics,
    decisions,
    sessions,
  }
}

/**
 * Revisione riepilogo (Quaderno / Decisioni / Diario) prima di PDF/EPUB.
 * Restituisce il summary corretto e le patch da applicare allo store.
 */
export async function reviseSummaryForExport(
  summary: StudySummary,
  kind: ExportReviseKind,
  language = 'I',
): Promise<{
  summary: StudySummary
  meta: ExportReviseMeta
  topicPatches: StudyTopic[]
  decisionPatches: DecisionItem[]
  sessionPatches: StudySessionLog[]
}> {
  const pieces = collectSummaryPieces(summary)
  const before = pieces.map((p) => ({ ...p }))
  const { pieces: revised, engine } = await revisePiecesRemote(kind, language, pieces)
  const byId = new Map(revised.map((p) => [p.id, p.text]))
  const next = applyPiecesToSummary(summary, byId)
  const changed = mapChanged(before, revised)

  return {
    summary: next,
    topicPatches: next.topics,
    decisionPatches: next.decisions,
    sessionPatches: next.sessions,
    meta: {
      engine,
      changed,
      message: changed
        ? engine === 'ai'
          ? 'Documento revisionato in automatico (struttura, grammatica, terminologia) prima dell’export.'
          : 'Documento ripulito in automatico prima dell’export.'
        : 'Documento già in ordine: export avviato.',
    },
  }
}
