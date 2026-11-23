import assert from 'node:assert/strict'
import { findScriptureRefsInText } from '../src/lib/bibleText.ts'
import {
  flattenSectionBodies,
  parseStructurePlan,
  sectionDurationSeconds,
  sectionsFromUnits,
  splitDiscourseUnits,
  splitForPolish,
  structurePreservesContent,
} from '../src/lib/discourseStructure.ts'
import { sumSectionRecordingDurationMs } from '../src/lib/discourseRecordings.ts'
import { filterOverlapSegments } from '../src/lib/transcriptClips.ts'
import { parseTranscriptSegments } from '../api/transcriptParse.js'
import test from 'node:test'
import { buildBibleReadingGuide, getBibleReadingStatus } from '../src/lib/bibleReadingGuide.ts'
import { readBiblePlanTitle, repairBiblePlanTitle } from '../src/lib/biblePlanTitle.ts'
import { mergeSnapshots, trackSyncChanges } from '../src/lib/icloud/merge.ts'
import type { ICloudSnapshot } from '../src/lib/icloud/types.ts'
import { findStudies, indexStudies, type StudySearchResult } from '../src/lib/studySearch.ts'
import {
  looksLikeQuestion,
  refineDiscourseSpeechText,
} from '../src/lib/discourseTextRefine.ts'
import { alignPracticeTexts } from '../src/lib/discoursePracticeAlign.ts'
import {
  italianWordsToDigits,
  expandSpokenBookAbbreviations,
} from '../src/lib/jwSpeechLexicon.ts'
import {
  appendDictatedChunk,
  applySpeechPunctuation,
  normalizeSpokenScriptureReferences,
} from '../src/lib/speechDictation.ts'
import type { AppSettings, BibleReadingPlan, StudySessionDraft, StudyTopic } from '../src/types.ts'

const oldDate = '2026-11-06T09:00:00.000Z'
const currentDate = '2026-11-07T09:00:00.000Z'
const topic = { id: 'appunto', createdAt: oldDate, updatedAt: oldDate } as StudyTopic
const draft = { step: 2, startedAt: oldDate, topicId: null } as StudySessionDraft

function snapshot(patch: Partial<ICloudSnapshot> = {}): ICloudSnapshot {
  return {
    version: 1, updatedAt: currentDate, settings: {} as AppSettings, topics: [], decisions: [],
    activeTopicId: null, activeDecisionId: null, aiMessages: [], sessionDraft: null, sessionLogs: [],
    schedules: [], ...patch,
  }
}

test('una cancellazione locale sopravvive alla sincronizzazione con una copia precedente', () => {
  const before = snapshot({ topics: [topic] })
  const syncMetadata = trackSyncChanges(before, { topics: [] })
  const local = snapshot({ syncMetadata })
  const remote = snapshot({ topics: [topic], activeTopicId: topic.id })
  const first = mergeSnapshots(local, remote)
  assert.deepEqual(first.topics, [])
  assert.equal(first.activeTopicId, null)
  assert.deepEqual(mergeSnapshots(remote, first).topics, [])
})

test('una bozza viene unita per ultima modifica, anche quando viene chiusa', () => {
  const local = snapshot({ sessionDraft: { ...draft, step: 7 }, syncMetadata: { draftChangedAt: currentDate } })
  const remote = snapshot({ sessionDraft: draft })
  assert.equal(mergeSnapshots(local, remote).sessionDraft?.step, 7)
  assert.equal(mergeSnapshots(remote, local).sessionDraft?.step, 7)
  const ended = snapshot({ syncMetadata: trackSyncChanges(local, { sessionDraft: null }) })
  assert.equal(mergeSnapshots(local, ended).sessionDraft, null)
  assert.equal(mergeSnapshots(ended, remote).sessionDraft, null)
  assert.equal(mergeSnapshots(snapshot({ sessionDraft: { ...draft, step: 7 } }), remote).sessionDraft?.step, 7)
})

test('il titolo esclude l’intestazione generica e recupera quello già salvato nel testo', () => {
  const plan = '**1. Titolo del percorso**\n*“Abramo: un esempio di fede”*\n\n**2. Perché leggerlo**'
  assert.equal(readBiblePlanTitle(plan, 'Abramo'), 'Abramo: un esempio di fede')
  assert.equal(readBiblePlanTitle('**Titolo:** Il coraggio di Ester', 'Ester'), 'Il coraggio di Ester')
  assert.equal(readBiblePlanTitle('**Titolo:**\n2. Perché leggerlo', 'Ester'), 'Lettura: Ester')
  assert.equal(repairBiblePlanTitle({ plan, query: 'Abramo', title: '1. Titolo del percorso' }).title, 'Abramo: un esempio di fede')
  assert.equal(repairBiblePlanTitle({ plan, query: 'Abramo', title: 'Il mio titolo' }).title, 'Il mio titolo')
})

test('la ricerca unisce accenti, abbreviazioni bibliche, tipo e intervallo di date', () => {
  const entries: StudySearchResult[] = [
    { id: 'a', kind: 'quaderno', title: 'Fiducia', date: '2026-11-06T12:00:00Z', texts: ['Fedeltà e Giacomo 1:2-4'] },
    { id: 'b', kind: 'sessione', title: 'Fedeltà', date: '2026-11-05T12:00:00Z', texts: ['Giacomo 1:30'] },
  ]
  const filter = { kind: '' as const, from: '', to: '' }
  assert.deepEqual(findStudies(entries, { ...filter, query: 'fedelta' }).map((entry) => entry.id), ['a', 'b'])
  assert.deepEqual(findStudies(entries, { ...filter, query: 'Gc 1:3' }).map((entry) => entry.id), ['a'])
  assert.deepEqual(findStudies(entries, { ...filter, query: 'fedelta', kind: 'sessione', from: '2026-11-06' }), [])
})

test('un approfondimento già salvato diventa uno studio guidato e conserva i progressi', () => {
  const scripture = { id: 'tim-4', label: '1 Timoteo 4:12-16', bible: '54004012' }
  const plan: BibleReadingPlan = {
    id: 'tim', title: 'Timoteo', query: 'Timoteo', kind: 'personaggio', createdAt: currentDate,
    resources: [], scriptures: [scripture], aiEnriched: true,
    studyProgress: {
      completedReadings: ['Atti 16:1-5'],
      answers: { 'Quale idea vuoi ricordare?': 'Essere di esempio.' },
    },
    plan: [
      'Appunti precedenti',
      'Approfondimento AI',
      '**Titolo:** Timoteo',
      'Un esempio per i giovani.',
      '**Passi di lettura consigliati**',
      '1. **1 Timoteo 4:12**. Nota in quali modi Timoteo poteva essere di esempio.',
      '**Domande di riflessione**',
      '1. Come puoi dare l’esempio?',
      '**Azione pratica:** Scegli un modo concreto per incoraggiare qualcuno.',
      '**Risorse aggiuntive**',
      'Materiale da consultare',
    ].join('\n'),
  }
  const guide = buildBibleReadingGuide(plan)
  assert.equal(guide.intro, 'Un esempio per i giovani.')
  assert.equal(guide.readings[0].scripture, scripture)
  assert.equal(guide.readings[1].text, 'Atti 16:1-5')
  assert.deepEqual(guide.questions, ['Come puoi dare l’esempio?', 'Quale idea vuoi ricordare?'])
  assert.equal(guide.practice, 'Scegli un modo concreto per incoraggiare qualcuno.')
  const offline = buildBibleReadingGuide({ ...plan, plan: 'Leggi le scritture indicate.', aiEnriched: false })
  assert.equal(offline.readings[0].scripture, scripture)
  assert.equal(offline.questions.length, 3)
})

test('la ricerca ritrova le risposte del percorso originale e il prossimo passo', () => {
  const reading: BibleReadingPlan = {
    id: 'lettura-timoteo', title: 'Timoteo', query: 'Timoteo', kind: 'personaggio',
    createdAt: currentDate, resources: [], scriptures: [{ id: '1', label: '1 Timoteo 4:12' }],
    plan: 'Domande di riflessione:\n1. Cosa puoi fare?\n2. Quando?',
    studyProgress: {
      completedReadings: ['1 Timoteo 4:12'],
      answers: { 'Cosa puoi fare?': 'Scrivere un messaggio incoraggiante.' },
    },
  }
  assert.equal(getBibleReadingStatus(reading).label, 'Rispondi alla domanda 2')
  const index = indexStudies({ topics: [], sessions: [], resources: [], searches: [], readings: [reading] })
  const results = findStudies(index, { query: 'messaggio incoraggiante', kind: 'lettura', from: '', to: '' })
  assert.equal(results[0]?.id, reading.id)
})

test('la dettatura converte libro capitolo versetto nel formato della scrittura', () => {
  assert.equal(normalizeSpokenScriptureReferences('Leggiamo Salmo 28 14.'), 'Leggiamo Salmo 28:14.')
  assert.equal(normalizeSpokenScriptureReferences('1 Corinti 13 4'), '1 Corinti 13:4')
  assert.equal(appendDictatedChunk('Leggiamo Salmo 28 ', '14'), 'Leggiamo Salmo 28:14 ')
  assert.equal(normalizeSpokenScriptureReferences('Ci vediamo il 28 14.'), 'Ci vediamo il 28 14.')
  assert.equal(normalizeSpokenScriptureReferences('Salmo 151 14'), 'Salmo 151 14')
  assert.equal(
    normalizeSpokenScriptureReferences('Leggiamo Salmo capitolo 5 versetto 6 oggi.'),
    'Leggiamo Salmo 5:6 oggi.',
  )
  assert.equal(
    normalizeSpokenScriptureReferences('Salmo capitolo 5 versetti 5 6 e 7'),
    'Salmo 5:5-7',
  )
  assert.equal(
    normalizeSpokenScriptureReferences('Giacomo capitolo 2 versetti 1/2 e 3'),
    'Giacomo 2:1-3',
  )
  assert.equal(
    normalizeSpokenScriptureReferences('Giacomo 3 versetti da 4 a 7'),
    'Giacomo 3:4-7',
  )
})

test('la dettatura mette ? ! in base a tono e senso della frase', () => {
  assert.equal(
    applySpeechPunctuation('perché preghiamo', { pauseMs: 1600, contour: 'rising' }).trim(),
    '? Perché preghiamo',
  )
  assert.equal(
    applySpeechPunctuation('che privilegio', { pauseMs: 1600, energyHigh: true }).trim(),
    '! Che privilegio',
  )
  assert.equal(looksLikeQuestion('Perché lo facciamo'), true)
  assert.match(
    refineDiscourseSpeechText('Jehovah ama la congregazione. Perché lo facciamo.'),
    /Geova.*\?/,
  )
})

test('riconosce numeri in lettere e abbreviazioni nei riferimenti detti', () => {
  assert.equal(italianWordsToDigits('tredici'), '13')
  assert.equal(italianWordsToDigits('venti quattro'), '24')
  assert.equal(
    normalizeSpokenScriptureReferences('Salmo capitolo cinque versetto sei'),
    'Salmo 5:6',
  )
  assert.equal(
    normalizeSpokenScriptureReferences(
      expandSpokenBookAbbreviations('Pr capitolo quattordici versetto dodici'),
    ),
    'Proverbi 14:12',
  )
})

test('obiettivo minuti resta indipendente dalle registrazioni sommate', () => {
  assert.equal(
    sectionDurationSeconds({
      id: 's1',
      kind: 'libera',
      title: '',
      body: '',
      minutes: 8,
      recordedDurationMs: 120_000,
    }),
    8 * 60,
  )
  assert.equal(
    sumSectionRecordingDurationMs(
      [
        { sectionId: 's1', durationMs: 45_000 },
        { sectionId: 's1', durationMs: 30_000 },
        { sectionId: 's2', durationMs: 99_000 },
      ],
      's1',
    ),
    75_000,
  )
})

test('il confronto prova evidenzia parole saltate', () => {
  const aligned = alignPracticeTexts(
    'Geova ama la verità e la giustizia',
    'Geova ama la giustizia',
  )
  assert.ok(aligned.missingCount >= 1)
  assert.ok(aligned.coverage < 1)
  assert.match(aligned.summary, /Copertura/)
})

test('il popup può rilevare due inserimenti dello stesso Salmo', () => {
  const text = 'Salmo 23:1\n\nLeggiamo ancora Salmo 23:1'
  assert.equal(findScriptureRefsInText(text).length, 1)
  const references = findScriptureRefsInText(text, true)
  assert.equal(references.length, 2)
  assert.equal(references[0].bible, references[1].bible)
  assert.equal(references[1].index, text.lastIndexOf('Salmo'))
})

test('riconosce liste e range misti di versetti', () => {
  const a = findScriptureRefsInText('Leggiamo Salmo 28:1,2 oggi.')
  assert.equal(a.length, 2)
  assert.equal(a[0].verse, 1)
  assert.equal(a[1].verse, 2)
  assert.equal(a[0].matched, 'Salmo 28:1,2')
  assert.equal(a[1].matched, '')

  const b = findScriptureRefsInText('Salmo 25:3-6')
  assert.equal(b.length, 1)
  assert.equal(b[0].verse, 3)
  assert.equal(b[0].verseEnd, 6)

  const c = findScriptureRefsInText('Giacomo 2:1-2,3')
  assert.equal(c.length, 2)
  assert.equal(c[0].verse, 1)
  assert.equal(c[0].verseEnd, 2)
  assert.equal(c[1].verse, 3)
  assert.equal(c[0].matched, 'Giacomo 2:1-2,3')

  const d = findScriptureRefsInText('Giacomo 3:4,5-7')
  assert.equal(d.length, 2)
  assert.equal(d[0].verse, 4)
  assert.equal(d[0].verseEnd, undefined)
  assert.equal(d[1].verse, 5)
  assert.equal(d[1].verseEnd, 7)
})

test('l’analisi struttura ricopia tutto il testo originale senza tagli', () => {
  const original = [
    'Apriamo con una domanda sulla fede.',
    'Primo esempio pratico con Abramo e Geova.',
    'Secondo esempio con la predicazione quotidiana.',
    'Chiudiamo applicando Salmo 28:1,2 nella vita.',
  ].join('\n\n')
  const units = splitDiscourseUnits(original)
  assert.equal(units.length, 4)
  const plan = parseStructurePlan(
    JSON.stringify({
      introduzione: [0],
      punti: [
        { title: 'Fede di Abramo', units: [1] },
        { title: 'Predicazione', units: [2] },
      ],
      conclusione: [3],
    }),
    units.length,
  )
  assert.ok(plan)
  const sections = sectionsFromUnits(units, plan!)
  assert.equal(structurePreservesContent(original, sections), true)
  assert.equal(flattenSectionBodies(sections), original)
})

test('il polish spezza i testi lunghi senza perdere caratteri', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Frase numero ${i + 1} del discorso.`).join(' ')
  const chunks = splitForPolish(text, 120)
  assert.ok(chunks.length > 1)
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text.replace(/\s+/g, ' ').trim())
})

test('la trascrizione recupera segmenti anche da JSON parziale e non scarta start>120', () => {
  const full = parseTranscriptSegments(
    JSON.stringify({
      segments: [
        { start: 0, speaker: '1', text: 'Inizio del discorso.' },
        { start: 150, speaker: '1', text: 'Parte oltre i due minuti del clip.' },
      ],
    }),
  )
  assert.equal(full.length, 2)
  assert.equal(full[1].start, 150)

  const partial = parseTranscriptSegments(
    '{"segments":[{"start":0,"speaker":"1","text":"Prima frase salva."},{"start":12,"speaker":"1","text":"Seconda frase tagli',
  )
  assert.ok(partial.length >= 1)
  assert.match(partial[0].text, /Prima frase/)
})

test('i pezzi audio successivi scartano solo la zona di overlap', () => {
  const kept = filterOverlapSegments(
    [
      { start: 0.5, speaker: 'Relatore 1', text: 'Ripetuto' },
      { start: 2.4, speaker: 'Relatore 1', text: 'Nuovo' },
    ],
    1,
    2.5,
  )
  assert.equal(kept.length, 1)
  assert.equal(kept[0].text, 'Nuovo')
  assert.equal(filterOverlapSegments(kept, 0).length, 1)
})
