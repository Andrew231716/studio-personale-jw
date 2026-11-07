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
  localReason?: string
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
6. Non inventare link né titoli di pubblicazioni non presenti nel contesto.
7. Niente ripetizioni: ogni punto deve dire qualcosa di diverso. Non ripetere la stessa idea con altre parole, né tra sezioni (es. stessa domanda sia in RIFLESSIONI sia in DOMANDE). Non rifare punti già presenti nel contesto.`

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
  } catch (error) {
    return {
      ...localStructureFromSource(title, notes),
      localReason: error instanceof Error ? error.message : 'Motore AI non disponibile.',
    }
  }
  return { ...localStructureFromSource(title, notes), localReason: 'La risposta AI era incompleta.' }
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
    const cleaned = dedupeStudyStructure({
      title: parsed.title,
      summary: parsed.summary,
      objectives: parsed.objectives,
      reflections: parsed.reflections,
      questions: parsed.questions,
      practices: parsed.practices,
    })
    if (kind === 'obiettivi') {
      return {
        objectives: dedupeLines(cleaned.objectives, topic.objectives),
      }
    }
    if (kind === 'riflessione') {
      return {
        reflections: dedupeByField(
          cleaned.reflections,
          (r) => r.prompt,
          [
            ...topic.objectives,
            ...topic.reflections.map((r) => r.prompt),
            ...topic.questions.map((q) => q.question),
          ],
        ),
      }
    }
    if (kind === 'risposte') {
      return {
        questions: dedupeByField(
          cleaned.questions,
          (q) => q.question,
          [
            ...topic.objectives,
            ...topic.reflections.map((r) => r.prompt),
            ...topic.questions.map((q) => q.question),
          ],
        ),
      }
    }
    if (kind === 'pratiche') {
      return {
        practices: dedupeByField(
          cleaned.practices,
          (p) => p.action,
          [
            ...topic.objectives,
            ...topic.practices.map((p) => p.action),
            ...topic.questions.map((q) => q.question),
          ],
        ),
      }
    }
    return cleaned
  } catch (error) {
    return {
      ...localElaborateFallback(topic, kind),
      localReason: error instanceof Error ? error.message : 'Motore AI non disponibile.',
    }
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
    else if (
      !topic.interest.includes(summary.slice(0, 40)) &&
      !areSimilarLines(topic.interest, summary)
    ) {
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
    patch.objectives = dedupeLines(onlyDefault ? incoming : [...current, ...incoming]).slice(0, 10)
  }

  if (structure.reflections?.length) {
    patch.reflections = mergeReflections(topic.reflections, structure.reflections, replaceEmpty)
  }

  if (structure.questions?.length) {
    const reflectionsForBlock =
      patch.reflections || topic.reflections
    patch.questions = mergeQuestions(
      topic.questions,
      structure.questions,
      replaceEmpty,
      reflectionsForBlock.map((r) => r.prompt),
    )
  }

  if (structure.practices?.length) {
    const usableCurrent = topic.practices.filter((p) => p.action.trim())
    const onlyGeneric =
      replaceEmpty &&
      usableCurrent.length > 0 &&
      usableCurrent.every((p) => !p.outcome.trim() && isGenericStudyLine(p.action)) &&
      usableCurrent.length <= 3
    const objectivesBlock = patch.objectives || topic.objectives
    const added = structure.practices.filter(
      (p) =>
        p.action.trim() &&
        !listHasSimilar(
          [
            ...usableCurrent.map((x) => x.action),
            ...objectivesBlock,
          ],
          p.action,
        ),
    )
    const merged = onlyGeneric ? added : [...usableCurrent, ...added]
    patch.practices = dedupeByField(merged, (p) => p.action).slice(0, 12)
  }

  return patch
}

export function parseStudyStructure(raw: string, fallbackTitle: string): StudyStructure {
  const text = String(raw || '').replace(/\r/g, '')
  const title = normalizeJwItalian(sectionLine(text, 'TITOLO') || fallbackTitle)
  const summary = normalizeJwItalian(sectionBlock(text, 'RIASSUNTO') || '')
  const objectives = dedupeLines(
    normalizeJwItalianList(bullets(sectionBlock(text, 'OBIETTIVI'))),
  ).slice(0, 6)
  const reflectionLines = dedupeLines(
    normalizeJwItalianList(bullets(sectionBlock(text, 'RIFLESSIONI'))),
    objectives,
  ).slice(0, 8)
  const questionLines = dedupeLines(
    normalizeJwItalianList(bullets(sectionBlock(text, 'DOMANDE'))),
    [...objectives, ...reflectionLines],
  ).slice(0, 8)
  const practiceLines = dedupeLines(
    normalizeJwItalianList(bullets(sectionBlock(text, 'PRATICHE'))),
    [...objectives, ...reflectionLines, ...questionLines],
  ).slice(0, 6)

  return {
    title,
    summary,
    objectives,
    reflections: reflectionLines.map((prompt) => ({ id: uid('ref'), prompt, response: '' })),
    questions: questionLines.map((question) => ({ id: uid('q'), question, answer: '' })),
    practices: practiceLines.map((action) => ({
      id: uid('prac'),
      action,
      tried: false,
      outcome: '',
    })),
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
  const objectives = dedupeLines(parsed.objectives.filter((o) => !isGenericStudyLine(o)))
  const reflections = dedupeByField(
    parsed.reflections.filter((r) => !isGenericStudyLine(r.prompt)),
    (r) => r.prompt,
    objectives,
  )
  const questions = dedupeByField(
    parsed.questions.filter((q) => !isGenericStudyLine(q.question)),
    (q) => q.question,
    [...objectives, ...reflections.map((r) => r.prompt)],
  )
  const practices = dedupeByField(
    parsed.practices.filter((p) => !isGenericStudyLine(p.action)),
    (p) => p.action,
    [...objectives, ...reflections.map((r) => r.prompt), ...questions.map((q) => q.question)],
  )

  if (
    objectives.length >= 2 &&
    reflections.length >= 2 &&
    questions.length >= 2 &&
    practices.length >= 1
  ) {
    return { ...parsed, objectives, reflections, questions, practices }
  }

  const local = localStructureFromSource(title, sourceText)
  return dedupeStudyStructure({
    title: parsed.title || local.title,
    summary: parsed.summary || local.summary,
    objectives: objectives.length >= 2 ? objectives : local.objectives,
    reflections: reflections.length >= 2 ? reflections : local.reflections,
    questions: questions.length >= 2 ? questions : local.questions,
    practices: practices.length >= 1 ? practices : local.practices,
  })
}

/** Rimuove ripetizioni dentro e tra sezioni. */
export function dedupeStudyStructure(structure: StudyStructure): StudyStructure {
  const objectives = dedupeLines(structure.objectives)
  const reflections = dedupeByField(structure.reflections, (r) => r.prompt, objectives)
  const questions = dedupeByField(structure.questions, (q) => q.question, [
    ...objectives,
    ...reflections.map((r) => r.prompt),
  ])
  const practices = dedupeByField(structure.practices, (p) => p.action, [
    ...objectives,
    ...reflections.map((r) => r.prompt),
    ...questions.map((q) => q.question),
  ])
  return { ...structure, objectives, reflections, questions, practices }
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

  return dedupeStudyStructure({
    title,
    summary:
      hooks.slice(0, 2).join(' ') ||
      `Studio personale su «${title}» basato sulle note e sul materiale fornito.`,
    objectives,
    reflections,
    questions,
    practices,
  })
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
    return dedupeByField(incoming.length ? incoming : usableCurrent, (r) => r.prompt).slice(0, 12)
  }

  const added = incoming.filter(
    (r) => r.prompt.trim() && !listHasSimilar(
      usableCurrent.map((x) => x.prompt),
      r.prompt,
    ),
  )
  return dedupeByField([...usableCurrent, ...added], (r) => r.prompt).slice(0, 12)
}

function mergeQuestions(
  current: StudyQuestion[],
  incoming: StudyQuestion[],
  replaceEmptyDefaults: boolean,
  alsoAvoid: string[] = [],
): StudyQuestion[] {
  const usableCurrent = current.filter((q) => q.question.trim() || q.answer.trim())
  const looksSparse =
    replaceEmptyDefaults &&
    usableCurrent.every((q) => !q.answer.trim()) &&
    (usableCurrent.length <= 2 || usableCurrent.every((q) => isGenericStudyLine(q.question)))

  if (looksSparse || usableCurrent.length === 0) {
    return dedupeByField(
      incoming.length ? incoming : usableCurrent,
      (q) => q.question,
      alsoAvoid,
    ).slice(0, 12)
  }

  const next = usableCurrent.map((q) => ({ ...q }))
  for (const inc of incoming) {
    const match = next.find(
      (q) =>
        !q.answer.trim() &&
        (areSimilarLines(q.question, inc.question) ||
          q.question.trim().toLowerCase() === inc.question.trim().toLowerCase()),
    )
    if (match && inc.answer.trim()) {
      match.answer = inc.answer
      continue
    }
    const exists = listHasSimilar(
      [...next.map((q) => q.question), ...alsoAvoid],
      inc.question,
    )
    if (!exists && inc.question.trim()) next.push(inc)
  }
  return dedupeByField(next, (q) => q.question, alsoAvoid).slice(0, 12)
}

const STOP_WORDS = new Set([
  'a',
  'ad',
  'al',
  'alla',
  'alle',
  'allo',
  'ai',
  'che',
  'chi',
  'come',
  'con',
  'cosa',
  'da',
  'dal',
  'dalla',
  'di',
  'e',
  'è',
  'ed',
  'il',
  'in',
  'io',
  'la',
  'le',
  'lo',
  'mi',
  'ne',
  'nel',
  'nella',
  'non',
  'o',
  'per',
  'più',
  'posso',
  'quale',
  'quali',
  'questo',
  'questa',
  'questi',
  'queste',
  'se',
  'si',
  'su',
  'sul',
  'sulla',
  'un',
  'una',
  'uno',
  'anche',
  'degli',
  'dei',
  'delle',
  'del',
  'dello',
])

/** Normalizza per confronto anti-ripetizione. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Riduce forme vicine (umilmente → umil) per cogliere ripetizioni parafrasate. */
function lightStem(token: string): string {
  let t = token
  if (t.length <= 4) return t
  const suffixes = [
    'mente',
    'zione',
    'zioni',
    'amento',
    'amenti',
    'atrice',
    'atori',
    'atore',
    'abili',
    'abile',
    'ibili',
    'ibile',
    'issimi',
    'issime',
    'issima',
    'issimo',
    'iamo',
    'ate',
    'ete',
    'ite',
    'ano',
    'ono',
    'are',
    'ere',
    'ire',
    'ita',
    'ito',
    'ita',
    'ose',
    'osi',
    'osa',
    'oso',
  ]
  for (const s of suffixes) {
    if (t.endsWith(s) && t.length - s.length >= 4) {
      t = t.slice(0, -s.length)
      break
    }
  }
  // plurale/femminile / -tà leggero
  if (t.endsWith('i') && t.length > 4) t = t.slice(0, -1)
  else if (t.endsWith('e') && t.length > 4) t = t.slice(0, -1)
  else if (t.endsWith('a') && t.length > 4) t = t.slice(0, -1)
  // radice condivisa (umilmente / umiltà / umile → umil)
  if (t.length > 4) t = t.slice(0, 4)
  return t
}

function significantTokens(text: string): Set<string> {
  const tokens = normalizeForCompare(text)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
    .map(lightStem)
    .filter((t) => t.length > 2)
  return new Set(tokens)
}

/** True se due frasi sono uguali o molto simili (stessa idea). */
export function areSimilarLines(a: string, b: string, threshold = 0.72): boolean {
  const na = normalizeForCompare(a)
  const nb = normalizeForCompare(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length)
    const longer = Math.max(na.length, nb.length)
    if (shorter >= 24 && shorter / longer >= 0.7) return true
  }
  const ta = significantTokens(a)
  const tb = significantTokens(b)
  if (ta.size === 0 || tb.size === 0) return false
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = ta.size + tb.size - inter
  const jaccard = union === 0 ? 0 : inter / union
  if (jaccard >= threshold) return true
  // Molti token in comune rispetto al più corto
  const overlap = inter / Math.min(ta.size, tb.size)
  return overlap >= 0.85 && inter >= 3
}

export function listHasSimilar(existing: string[], candidate: string): boolean {
  return existing.some((e) => areSimilarLines(e, candidate))
}

/** Deduplica elenchi di stringhe (esatte e quasi-duplicate). */
export function dedupeLines(items: string[], alsoAvoid: string[] = []): string[] {
  const out: string[] = []
  const blocked = [...alsoAvoid]
  for (const item of items) {
    const t = item.trim()
    if (!t) continue
    if (listHasSimilar(blocked, t) || listHasSimilar(out, t)) continue
    out.push(t)
  }
  return out
}

export function dedupeByField<T>(
  items: T[],
  field: (item: T) => string,
  alsoAvoid: string[] = [],
): T[] {
  const out: T[] = []
  const seenTexts = [...alsoAvoid]
  for (const item of items) {
    const text = field(item).trim()
    if (!text) continue
    if (listHasSimilar(seenTexts, text)) continue
    seenTexts.push(text)
    out.push(item)
  }
  return out
}

function uniqueStrings(items: string[]): string[] {
  return dedupeLines(items)
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
