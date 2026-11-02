import { askAi } from './ai'
import { uid } from './id'
import {
  JW_ITALIAN_TERM_HINT,
  isSectionHeading,
  normalizeJwItalian,
  normalizeJwItalianList,
} from './jwItalianTerms'
import { DEFAULT_PRACTICE_IDEAS, DEFAULT_REFLECTION_PROMPTS } from './studyMethod'
import type {
  PracticeItem,
  ReflectionPoint,
  StudyQuestion,
  StudyResource,
  StudyTopic,
} from '../types'

export interface StudyStructure {
  title?: string
  summary?: string
  objectives: string[]
  reflections: ReflectionPoint[]
  questions: StudyQuestion[]
  practices: PracticeItem[]
}

const SECTION_NAMES = [
  'TITOLO',
  'RIASSUNTO',
  'OBIETTIVI',
  'RIFLESSIONI',
  'DOMANDE',
  'PRATICHE',
] as const

const STRUCTURE_FORMAT = `Rispondi SOLO in questo formato (niente altro testo, niente markdown):

TITOLO:
(titolo breve)

RIASSUNTO:
(2-4 frasi)

OBIETTIVI:
- obiettivo 1
- obiettivo 2
- obiettivo 3

RIFLESSIONI:
- domanda di riflessione 1
- domanda di riflessione 2
- domanda di riflessione 3
- domanda di riflessione 4

DOMANDE:
- domanda di studio 1
- domanda di studio 2
- domanda di studio 3
- domanda di studio 4

PRATICHE:
- azione pratica 1
- azione pratica 2
- azione pratica 3`

/** Crea struttura completa da un materiale appena aggiunto al Quaderno. */
export async function buildStudyStructureFromMaterial(params: {
  title: string
  notes?: string
  kind?: string
}): Promise<StudyStructure> {
  const title = params.title.trim() || 'Studio personale'
  const notes = (params.notes || '').trim()
  const kind = params.kind || 'articolo'
  try {
    const raw = await askAi({
      prompt: `Crea una struttura di studio personale per questo materiale jw.org (${kind}).
Titolo materiale: «${title}»
${notes ? `Note/contesto: ${notes.slice(0, 1200)}` : ''}

${STRUCTURE_FORMAT}

Regole: ${JW_ITALIAN_TERM_HINT}
Non inventare link. Usa il titolo del materiale come TITOLO se è già chiaro.`,
    })
    const parsed = parseStudyStructure(raw, title)
    if (hasUsefulStructure(parsed)) return parsed
  } catch {
    /* fallback */
  }
  return localStructureFromTitle(title, notes)
}

/** Elabora una sezione del Quaderno in modo strutturato (non un blocco di testo unico). */
export async function elaborateTopicStructure(
  topic: StudyTopic,
  kind: 'obiettivi' | 'riflessione' | 'risposte' | 'pratiche' | 'tutto',
): Promise<Partial<StudyStructure>> {
  const focus =
    kind === 'obiettivi'
      ? 'Solo la sezione OBIETTIVI (3-5 punti). Le altre sezioni lascia vuote o minimali.'
      : kind === 'riflessione'
        ? 'Solo RIFLESSIONI (4-6 domande di riflessione). Lascia vuote le altre sezioni non necessarie.'
        : kind === 'risposte'
          ? 'Solo DOMANDE (4-6 domande di studio). Lascia vuote le altre sezioni non necessarie.'
          : kind === 'pratiche'
            ? 'Solo PRATICHE (3-5 azioni concrete). Lascia vuote le altre sezioni non necessarie.'
            : 'Compila tutte le sezioni.'

  const existing = [
    `Argomento: ${topic.title}`,
    topic.interest ? `Note: ${topic.interest.slice(0, 800)}` : '',
    topic.objectives.filter(Boolean).length
      ? `Obiettivi attuali:\n${topic.objectives.filter(Boolean).map((o) => `- ${o}`).join('\n')}`
      : '',
    topic.reflections.some((r) => r.prompt || r.response)
      ? `Riflessioni attuali:\n${topic.reflections
          .map((r) => `- ${r.prompt}${r.response ? ` → ${r.response.slice(0, 160)}` : ''}`)
          .join('\n')}`
      : '',
    topic.questions.some((q) => q.question || q.answer)
      ? `Domande attuali:\n${topic.questions
          .map((q) => `- ${q.question}${q.answer ? ` → ${q.answer.slice(0, 160)}` : ''}`)
          .join('\n')}`
      : '',
    topic.practices.length
      ? `Pratiche attuali:\n${topic.practices.map((p) => `- ${p.action}`).join('\n')}`
      : '',
    topic.resources[0]
      ? `Materiale: ${topic.resources
          .slice(0, 5)
          .map((r) => r.title)
          .join(' · ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const raw = await askAi({
      prompt: `Elabora il Quaderno di studio «${topic.title}».
${focus}

${STRUCTURE_FORMAT}

Migliora e completa rispetto a ciò che c’è già; non ripetere frasi vuote. ${JW_ITALIAN_TERM_HINT}`,
      context: existing,
    })
    const parsed = parseStudyStructure(raw, topic.title)
    if (kind === 'obiettivi') return { objectives: parsed.objectives }
    if (kind === 'riflessione') return { reflections: parsed.reflections }
    if (kind === 'risposte') return { questions: parsed.questions }
    if (kind === 'pratiche') return { practices: parsed.practices }
    return parsed
  } catch {
    return localElaborateFallback(topic, kind)
  }
}

/** Unisce la struttura AI nel topic senza cancellare risposte già scritte. */
export function mergeStudyStructureIntoTopic(
  topic: StudyTopic,
  structure: Partial<StudyStructure>,
  opts?: { replaceEmptyDefaults?: boolean },
): Partial<StudyTopic> {
  const replaceEmpty = opts?.replaceEmptyDefaults !== false
  const patch: Partial<StudyTopic> = {}

  if (structure.summary?.trim()) {
    const summary = structure.summary.trim()
    if (!topic.interest.trim()) patch.interest = summary
    else if (!topic.interest.includes(summary.slice(0, 40))) {
      patch.interest = `${topic.interest.trim()}\n\n${summary}`
    }
  }

  if (structure.objectives?.length) {
    const incoming = structure.objectives.map((o) => o.trim()).filter(Boolean)
    const current = topic.objectives.map((o) => o.trim()).filter(Boolean)
    const onlyDefault =
      replaceEmpty &&
      current.length <= 1 &&
      current.every((o) => /capire meglio|messaggio principale|studio personale/i.test(o))
    patch.objectives = onlyDefault
      ? incoming
      : uniqueStrings([...current, ...incoming]).slice(0, 10)
  }

  if (structure.reflections?.length) {
    patch.reflections = mergeReflections(topic.reflections, structure.reflections, replaceEmpty)
  }

  if (structure.questions?.length) {
    patch.questions = mergeQuestions(topic.questions, structure.questions, replaceEmpty)
  }

  if (structure.practices?.length) {
    const existingActions = new Set(
      topic.practices.map((p) => p.action.trim().toLowerCase()).filter(Boolean),
    )
    const added = structure.practices.filter(
      (p) => p.action.trim() && !existingActions.has(p.action.trim().toLowerCase()),
    )
    patch.practices = [...topic.practices.filter((p) => p.action.trim()), ...added].slice(0, 12)
  }

  return patch
}

export function parseStudyStructure(raw: string, fallbackTitle: string): StudyStructure {
  const text = String(raw || '').replace(/\r/g, '')
  const title = normalizeJwItalian(sectionLine(text, 'TITOLO') || fallbackTitle)
  const summary = normalizeJwItalian(sectionBlock(text, 'RIASSUNTO') || '')
  const objectives = normalizeJwItalianList(bullets(sectionBlock(text, 'OBIETTIVI'))).slice(0, 6)
  const reflections = normalizeJwItalianList(bullets(sectionBlock(text, 'RIFLESSIONI')))
    .slice(0, 8)
    .map((prompt) => ({ id: uid('ref'), prompt, response: '' }))
  const questions = normalizeJwItalianList(bullets(sectionBlock(text, 'DOMANDE')))
    .slice(0, 8)
    .map((question) => ({ id: uid('q'), question, answer: '' }))
  const practices = normalizeJwItalianList(bullets(sectionBlock(text, 'PRATICHE')))
    .slice(0, 6)
    .map((action) => ({ id: uid('prac'), action, tried: false, outcome: '' }))

  return {
    title,
    summary,
    objectives,
    reflections,
    questions,
    practices,
  }
}

function hasUsefulStructure(s: StudyStructure): boolean {
  return (
    s.objectives.length >= 2 ||
    s.reflections.length >= 2 ||
    s.questions.length >= 2 ||
    s.practices.length >= 2
  )
}

function localStructureFromTitle(title: string, notes: string): StudyStructure {
  return {
    title,
    summary: notes.slice(0, 400) || `Studio personale su «${title}».`,
    objectives: [
      `Capire meglio cosa insegna «${title}»`,
      'Collegare i punti principali a principi biblici',
      'Scegliere un’applicazione pratica per questa settimana',
    ],
    reflections: DEFAULT_REFLECTION_PROMPTS.map((prompt) => ({
      id: uid('ref'),
      prompt,
      response: '',
    })),
    questions: [
      {
        id: uid('q'),
        question: 'Qual è il punto centrale di questo materiale?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Cosa imparo su Geova o sul suo proposito?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Come posso applicarlo nel ministero o in famiglia?',
        answer: '',
      },
    ],
    practices: DEFAULT_PRACTICE_IDEAS.slice(0, 3).map((action) => ({
      id: uid('prac'),
      action,
      tried: false,
      outcome: '',
    })),
  }
}

function localElaborateFallback(
  topic: StudyTopic,
  kind: 'obiettivi' | 'riflessione' | 'risposte' | 'pratiche' | 'tutto',
): Partial<StudyStructure> {
  const base = localStructureFromTitle(topic.title, topic.interest)
  if (kind === 'obiettivi') return { objectives: base.objectives }
  if (kind === 'riflessione') return { reflections: base.reflections }
  if (kind === 'risposte') return { questions: base.questions }
  if (kind === 'pratiche') return { practices: base.practices }
  return base
}

function mergeReflections(
  current: ReflectionPoint[],
  incoming: ReflectionPoint[],
  replaceEmptyDefaults: boolean,
): ReflectionPoint[] {
  const usableCurrent = current.filter((r) => r.prompt.trim() || r.response.trim())
  const looksDefault =
    replaceEmptyDefaults &&
    usableCurrent.length > 0 &&
    usableCurrent.every((r) => !r.response.trim()) &&
    usableCurrent.length <= DEFAULT_REFLECTION_PROMPTS.length

  if (looksDefault || usableCurrent.length === 0) {
    return incoming.length ? incoming : usableCurrent
  }

  const existingPrompts = new Set(usableCurrent.map((r) => r.prompt.trim().toLowerCase()))
  const added = incoming.filter(
    (r) => r.prompt.trim() && !existingPrompts.has(r.prompt.trim().toLowerCase()),
  )
  return [...usableCurrent, ...added].slice(0, 12)
}

function mergeQuestions(
  current: StudyQuestion[],
  incoming: StudyQuestion[],
  replaceEmptyDefaults: boolean,
): StudyQuestion[] {
  const usableCurrent = current.filter((q) => q.question.trim() || q.answer.trim())
  const looksSparse =
    replaceEmptyDefaults &&
    usableCurrent.every((q) => !q.answer.trim()) &&
    usableCurrent.length <= 2

  if (looksSparse || usableCurrent.length === 0) {
    return incoming.length ? incoming : usableCurrent
  }

  // Riempie risposte vuote se l’AI ha prodotto domande simili; altrimenti aggiunge
  const next = usableCurrent.map((q) => ({ ...q }))
  for (const inc of incoming) {
    const match = next.find(
      (q) =>
        !q.answer.trim() &&
        q.question.trim().toLowerCase() === inc.question.trim().toLowerCase(),
    )
    if (match && inc.answer.trim()) {
      match.answer = inc.answer
      continue
    }
    const exists = next.some(
      (q) => q.question.trim().toLowerCase() === inc.question.trim().toLowerCase(),
    )
    if (!exists && inc.question.trim()) next.push(inc)
  }
  return next.slice(0, 12)
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Estrae il blocco sotto un’intestazione (TITOLO / OBIETTIVI / …). */
export function sectionBlock(text: string, heading: string): string {
  const names = SECTION_NAMES.join('|')
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,3}\\s*|\\*{0,2})?${heading}\\s*\\*{0,2}\\s*[:：]?\\s*\\n?([\\s\\S]*?)(?=(?:\\n\\s*(?:#{1,3}\\s*|\\*{0,2})?(?:${names})\\s*\\*{0,2}\\s*[:：]?\\s*(?:\\n|$))|$)`,
    'i',
  )
  const m = text.match(re)
  return (m?.[1] || '').trim()
}

export function sectionLine(text: string, heading: string): string {
  const block = sectionBlock(text, heading)
  const sameLine = text.match(
    new RegExp(`(?:^|\\n)\\s*(?:#{1,3}\\s*|\\*{0,2})?${heading}\\s*\\*{0,2}\\s*[:：]\\s*(.+)`, 'i'),
  )
  if (sameLine?.[1]?.trim() && !sameLine[1].includes('\n')) {
    const line = sameLine[1].trim()
    if (line && !SECTION_NAMES.some((n) => n === line.toUpperCase())) return line
  }
  return block.split('\n').map((l) => l.trim()).find(Boolean) || ''
}

export function bullets(block: string): string[] {
  return block
    .split('\n')
    .map((l) =>
      l
        .replace(/^#{1,3}\s+/, '')
        .replace(/^\*{1,2}/, '')
        .replace(/\*{1,2}$/, '')
        .replace(/^[-*•–—\d.)]+\s*/, '')
        .trim(),
    )
    .filter((l) => l.length > 3)
    .filter((l) => !isSectionHeading(l))
    .filter((l) => !SECTION_NAMES.includes(l.toUpperCase() as (typeof SECTION_NAMES)[number]))
}

export function resourceFingerprint(res: Pick<StudyResource, 'url' | 'lank' | 'docid'>): string {
  return `${res.url}|${res.lank || ''}|${res.docid || ''}`
}
