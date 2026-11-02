import { askAi } from './ai'
import { uid } from './id'
import {
  JW_ITALIAN_TERM_HINT,
  isSectionHeading,
  normalizeJwItalian,
  normalizeJwItalianList,
} from './jwItalianTerms'
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

/** Frasi troppo generiche da non accettare come risultato AI. */
const GENERIC_LINE_RE =
  /^(capire meglio|comprendere il messaggio|collegare i punti|scegliere un[’']?applicazione|applicarlo nella vita|cosa mi insegna (questo|il) materiale|qual[eé] scritto mi ha colpito|atteggiamento che posso migliorare|incoraggiare qualcuno|pregare ogni giorno su questo tema|rileggere la scrittura chiave|parlare di questo punto|mettere in pratica un piccolo cambiamento|punto centrale|messaggio principale|studio personale|approfondire il tema|crescere spiritualmente)\b/i

const STRUCTURE_FORMAT = `Rispondi SOLO in questo formato (niente altro testo, niente markdown):

TITOLO:
(titolo breve, se già dato nel materiale riprendilo)

RIASSUNTO:
(2-4 frasi sul CONTENUTO SPECIFICO del materiale)

OBIETTIVI:
- obiettivo concreto 1 (citando un tema/punto del materiale)
- obiettivo concreto 2
- obiettivo concreto 3

RIFLESSIONI:
- domanda di riflessione specifica 1
- domanda di riflessione specifica 2
- domanda di riflessione specifica 3
- domanda di riflessione specifica 4

DOMANDE:
- domanda di studio specifica 1
- domanda di studio specifica 2
- domanda di studio specifica 3
- domanda di studio specifica 4

PRATICHE:
- azione pratica specifica 1
- azione pratica specifica 2
- azione pratica specifica 3`

const CONTENT_RULES = `Regole di contenuto (obbligatorie):
1. Basa OGNI punto sul materiale/note/trascrizione forniti. Niente frasi generiche.
2. Vietato: «Capire meglio…», «Applicare nella vita quotidiana», «Messaggio principale», «Crescere spiritualmente», «Approfondire il tema» senza dettagli.
3. Ogni obiettivo, riflessione, domanda o pratica deve richiamare un tema, esempio, scrittura, personaggio o consiglio PRESENTI nel materiale.
4. Se il materiale è scarso, estrai ciò che c’è (titolo + note) e resta concreto; non inventare articoli o citazioni letterali.
5. ${JW_ITALIAN_TERM_HINT}
6. Non inventare link né titoli di pubblicazioni non presenti nel contesto.`

/** Crea struttura completa da un materiale appena aggiunto al Quaderno. */
export async function buildStudyStructureFromMaterial(params: {
  title: string
  notes?: string
  kind?: string
  extraContext?: string
}): Promise<StudyStructure> {
  const title = params.title.trim() || 'Studio personale'
  const notes = (params.notes || '').trim()
  const kind = params.kind || 'articolo'
  const source = [
    `Titolo materiale: «${title}»`,
    `Tipo: ${kind}`,
    notes ? `Note/contesto dell’utente:\n${notes.slice(0, 2500)}` : '',
    params.extraContext?.trim() ? params.extraContext.trim().slice(0, 4000) : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const raw = await askAi({
      prompt: `Crea una struttura di studio personale per QUESTO materiale jw.org.
${STRUCTURE_FORMAT}

${CONTENT_RULES}

Usa il titolo del materiale come TITOLO se è già chiaro.`,
      context: `## Materiale fornito dall’utente (unica base)\n${source}`,
    })
    const parsed = filterGenericStructure(parseStudyStructure(raw, title), title, notes)
    if (hasUsefulStructure(parsed)) return parsed
  } catch {
    /* fallback */
  }
  return localStructureFromSource(title, notes)
}

/** Elabora una sezione del Quaderno in modo strutturato, ancorato al contenuto esistente. */
export async function elaborateTopicStructure(
  topic: StudyTopic,
  kind: 'obiettivi' | 'riflessione' | 'risposte' | 'pratiche' | 'tutto',
): Promise<Partial<StudyStructure>> {
  const source = buildTopicSourceBlock(topic)
  const focus =
    kind === 'obiettivi'
      ? 'Compila SOLO OBIETTIVI (3-5). Lascia vuote le altre sezioni.'
      : kind === 'riflessione'
        ? 'Compila SOLO RIFLESSIONI (4-6 domande). Lascia vuote le altre sezioni.'
        : kind === 'risposte'
          ? 'Compila SOLO DOMANDE (4-6). Lascia vuote le altre sezioni.'
          : kind === 'pratiche'
            ? 'Compila SOLO PRATICHE (3-5 azioni). Lascia vuote le altre sezioni.'
            : 'Compila tutte le sezioni.'

  try {
    const raw = await askAi({
      prompt: `Elabora il Quaderno «${topic.title}» usando SOLO il materiale e le note qui sotto.
${focus}

${STRUCTURE_FORMAT}

${CONTENT_RULES}
Migliora e completa rispetto a ciò che c’è già; non ripetere bozze vuote o frasi generiche.`,
      context: source,
    })
    const parsed = filterGenericStructure(
      parseStudyStructure(raw, topic.title),
      topic.title,
      topic.interest + '\n' + (topic.transcript || ''),
    )
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
      current.every((o) => isGenericStudyLine(o) || /capire meglio|studio personale|questo tema/i.test(o))
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
    const usableCurrent = topic.practices.filter((p) => p.action.trim())
    const onlyGeneric =
      replaceEmpty &&
      usableCurrent.length > 0 &&
      usableCurrent.every((p) => !p.outcome.trim() && isGenericStudyLine(p.action)) &&
      usableCurrent.length <= 3
    patch.practices = (onlyGeneric ? added : [...usableCurrent, ...added]).slice(0, 12)
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

export function isGenericStudyLine(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (GENERIC_LINE_RE.test(t)) return true
  if (/vita quotidiana|questa settimana senza|approfondire meglio/i.test(t) && t.length < 55)
    return true
  return false
}

export function filterGenericStructure(
  parsed: StudyStructure,
  title: string,
  sourceText: string,
): StudyStructure {
  const objectives = parsed.objectives.filter((o) => !isGenericStudyLine(o))
  const reflections = parsed.reflections.filter((r) => !isGenericStudyLine(r.prompt))
  const questions = parsed.questions.filter((q) => !isGenericStudyLine(q.question))
  const practices = parsed.practices.filter((p) => !isGenericStudyLine(p.action))

  if (
    objectives.length >= 2 &&
    reflections.length >= 2 &&
    questions.length >= 2 &&
    practices.length >= 1
  ) {
    return { ...parsed, objectives, reflections, questions, practices }
  }

  const local = localStructureFromSource(title, sourceText)
  return {
    title: parsed.title || local.title,
    summary: parsed.summary || local.summary,
    objectives: objectives.length >= 2 ? objectives : local.objectives,
    reflections: reflections.length >= 2 ? reflections : local.reflections,
    questions: questions.length >= 2 ? questions : local.questions,
    practices: practices.length >= 1 ? practices : local.practices,
  }
}

function hasUsefulStructure(s: StudyStructure): boolean {
  return (
    s.objectives.filter((o) => !isGenericStudyLine(o)).length >= 2 ||
    s.reflections.filter((r) => !isGenericStudyLine(r.prompt)).length >= 2 ||
    s.questions.filter((q) => !isGenericStudyLine(q.question)).length >= 2
  )
}

function buildTopicSourceBlock(topic: StudyTopic): string {
  return [
    `## Argomento\n${topic.title}`,
    topic.interest.trim()
      ? `## Note / interesse dell’utente\n${topic.interest.trim().slice(0, 2000)}`
      : '',
    topic.objectives.filter(Boolean).length
      ? `## Obiettivi già presenti\n${topic.objectives
          .filter(Boolean)
          .map((o) => `- ${o}`)
          .join('\n')}`
      : '',
    topic.reflections.some((r) => r.prompt || r.response)
      ? `## Riflessioni già presenti\n${topic.reflections
          .map((r) => `- ${r.prompt}${r.response ? ` → ${r.response.slice(0, 200)}` : ''}`)
          .join('\n')}`
      : '',
    topic.questions.some((q) => q.question || q.answer)
      ? `## Domande già presenti\n${topic.questions
          .map((q) => `- ${q.question}${q.answer ? ` → ${q.answer.slice(0, 200)}` : ''}`)
          .join('\n')}`
      : '',
    topic.practices.length
      ? `## Pratiche già presenti\n${topic.practices.map((p) => `- ${p.action}`).join('\n')}`
      : '',
    topic.resources[0]
      ? `## Materiale jw.org collegato\n${topic.resources
          .slice(0, 8)
          .map((r) => `- ${r.title}${r.notes ? ` (${r.notes.slice(0, 120)})` : ''}`)
          .join('\n')}`
      : '',
    topic.transcript?.trim()
      ? `## Trascrizione / testo del materiale\n${topic.transcript.trim().slice(0, 8000)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Fallback locale: estrae frasi dal testo dell’utente invece di template generici. */
export function localStructureFromSource(title: string, sourceText: string): StudyStructure {
  const clean = normalizeJwItalian(sourceText || '')
  const sentences = clean
    .split(/(?<=[.!?…;:])\s+|\n+/)
    .map((s) => s.replace(/^[-*•\d.)]+\s*/, '').trim())
    .filter((s) => s.length > 28 && s.length < 280)
    .filter((s) => !isSectionHeading(s))
    .filter((s) => !isGenericStudyLine(s))

  const hooks = uniqueStrings(sentences).slice(0, 6)
  const hook = hooks[0] || `ciò che insegna «${title}»`
  const hook2 = hooks[1] || hooks[0] || title
  const hook3 = hooks[2] || hooks[0] || title

  const objectives = [
    `Comprendere meglio: ${clip(hook, 120)}`,
    `Collegare a un principio biblico il punto su «${clip(hook2, 80)}»`,
    `Scegliere un’applicazione pratica legata a «${clip(title, 60)}» questa settimana`,
  ]

  const reflections = [
    `Cosa imparo su Geova da «${clip(title, 70)}»?`,
    hooks[0]
      ? `Perché mi colpisce questo passaggio: «${clip(hooks[0], 110)}»?`
      : `Quale punto di «${clip(title, 70)}» mi colpisce di più e perché?`,
    `Quale atteggiamento posso migliorare rispetto a «${clip(hook2, 80)}»?`,
    `Chi potrei incoraggiare con ciò che riguarda «${clip(title, 60)}»?`,
  ].map((prompt) => ({ id: uid('ref'), prompt, response: '' }))

  const questions = [
    {
      id: uid('q'),
      question: `Qual è il punto centrale di «${clip(title, 80)}»?`,
      answer: '',
    },
    {
      id: uid('q'),
      question: hooks[0]
        ? `Come si collega a Geova o al suo proposito: «${clip(hooks[0], 100)}»?`
        : `Cosa imparo su Geova o su Gesù da «${clip(title, 70)}»?`,
      answer: '',
    },
    {
      id: uid('q'),
      question: `Come posso usare «${clip(hook3, 90)}» nel ministero o in famiglia?`,
      answer: '',
    },
    {
      id: uid('q'),
      question: `Quale scrittura o consiglio di «${clip(title, 60)}» voglio meditare ancora?`,
      answer: '',
    },
  ]

  const practices = [
    `Pregare specificamente su «${clip(title, 70)}» per alcuni giorni`,
    hooks[0]
      ? `Rileggere e annotare un’applicazione di: «${clip(hooks[0], 100)}»`
      : `Rileggere «${clip(title, 70)}» e annotare un’applicazione`,
    `Condividere con qualcuno un pensiero su «${clip(hook2, 80)}»`,
  ].map((action) => ({ id: uid('prac'), action, tried: false, outcome: '' }))

  return {
    title,
    summary:
      hooks.slice(0, 2).join(' ') ||
      `Studio personale su «${title}» basato sulle note e sul materiale fornito.`,
    objectives,
    reflections,
    questions,
    practices,
  }
}

function localElaborateFallback(
  topic: StudyTopic,
  kind: 'obiettivi' | 'riflessione' | 'risposte' | 'pratiche' | 'tutto',
): Partial<StudyStructure> {
  const source = [
    topic.interest,
    topic.resources.map((r) => r.title).join('. '),
    topic.transcript?.slice(0, 2000) || '',
  ]
    .filter(Boolean)
    .join('\n')
  const base = localStructureFromSource(topic.title, source)
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
    usableCurrent.every((r) => isGenericStudyLine(r.prompt) || usableCurrent.length <= 4)

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
    (usableCurrent.length <= 2 || usableCurrent.every((q) => isGenericStudyLine(q.question)))

  if (looksSparse || usableCurrent.length === 0) {
    return incoming.length ? incoming : usableCurrent
  }

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

function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trim()}…`
}

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
