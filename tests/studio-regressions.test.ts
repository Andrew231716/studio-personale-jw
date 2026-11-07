import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBibleReadingGuide, getBibleReadingStatus } from '../src/lib/bibleReadingGuide.ts'
import { readBiblePlanTitle, repairBiblePlanTitle } from '../src/lib/biblePlanTitle.ts'
import { mergeSnapshots, trackSyncChanges } from '../src/lib/icloud/merge.ts'
import type { ICloudSnapshot } from '../src/lib/icloud/types.ts'
import { findStudies, indexStudies, type StudySearchResult } from '../src/lib/studySearch.ts'
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
