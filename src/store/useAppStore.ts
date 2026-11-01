import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_PRACTICE_IDEAS,
  DEFAULT_REFLECTION_PROMPTS,
  buildDecisionConclusion,
} from '../lib/studyMethod'
import { uid } from '../lib/id'
import { defaultSections, joinSections, totalMinutes } from '../lib/discourseStructure'
import { isSectionHeading, normalizeJwItalian, normalizeJwItalianList } from '../lib/jwItalianTerms'
import type {
  AiMessage,
  AppSettings,
  AppView,
  BibleReadingPlan,
  DecisionItem,
  DiscourseNote,
  MinistryAssistNote,
  SavedResource,
  SavedSearch,
  ScheduledStudy,
  StudyResource,
  StudySessionDraft,
  StudySessionLog,
  StudyTopic,
  ThemeConfig,
} from '../types'

const defaultTheme: ThemeConfig = {
  primary: '#124A4A',
  secondary: '#2F6F6A',
  accent: '#C4A35A',
  background: '#E8F0EC',
  surface: '#F7FBF8',
  text: '#16302C',
  muted: '#5B736C',
  radius: 16,
  fontDisplay: '"Fraunces", Georgia, serif',
  fontBody: '"Manrope", "Segoe UI", sans-serif',
  density: 'media',
  heroStyle: 'pieno',
}

const defaultSettings: AppSettings = {
  language: 'I',
  theme: defaultTheme,
  features: {
    home: true,
    argomenti: true,
    sessione: true,
    studio: true,
    diario: true,
    pdfJwpub: true,
    videoStudio: true,
    salvati: true,
    lettureBibbia: true,
    ministero: true,
    discorso: true,
    decisioni: true,
    obiettiviDecisioni: true,
    assistente: true,
    impostazioni: true,
    recentJwFeed: true,
    schedule: true,
  },
  navOrder: [
    'home',
    'sessione',
    'argomenti',
    'studio',
    'diario',
    'pdfJwpub',
    'videoStudio',
    'salvati',
    'lettureBibbia',
    'ministero',
    'discorso',
    'decisioni',
    'obiettiviDecisioni',
    'assistente',
    'impostazioni',
  ],
  brandName: 'JW Studio',
  tagline: 'Studia con cuore, un passo alla volta, con l’aiuto di jw.org',
  studyMethodNotes:
    'Metodo ispirato ai consigli di articoli e video recenti su jw.org: preghiera, obiettivo, materiale aggiornato, meditazione, domande e applicazione pratica.',
  iCloud: {
    enabled: false,
    containerId: String(import.meta.env.VITE_CLOUDKIT_CONTAINER_ID || ''),
    apiToken: String(import.meta.env.VITE_CLOUDKIT_API_TOKEN || ''),
    environment:
      import.meta.env.VITE_CLOUDKIT_ENVIRONMENT === 'production'
        ? 'production'
        : 'development',
  },
  cloudSync: {
    enabled: true,
    syncKey: '',
  },
}

function emptyDraft(topicId: string | null = null): StudySessionDraft {
  return {
    topicId,
    step: 0,
    prayer: '',
    goal: '',
    resourceTitle: '',
    resourceUrl: '',
    highlight: '',
    keyVerse: '',
    reflection: '',
    question: 'Cosa mi insegna questo su Geova?',
    answer: '',
    practice: '',
    gratitude: '',
    startedAt: new Date().toISOString(),
    minutesSpent: 0,
  }
}

interface AppState {
  view: AppView
  settings: AppSettings
  topics: StudyTopic[]
  decisions: DecisionItem[]
  activeTopicId: string | null
  activeDecisionId: string | null
  aiMessages: AiMessage[]
  sessionDraft: StudySessionDraft | null
  sessionLogs: StudySessionLog[]
  schedules: ScheduledStudy[]
  savedResources: SavedResource[]
  savedSearches: SavedSearch[]
  bibleReadingPlans: BibleReadingPlan[]
  ministryNotes: MinistryAssistNote[]
  discourseNotes: DiscourseNote[]
  activeDiscourseId: string | null
  setView: (view: AppView) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateTheme: (patch: Partial<ThemeConfig>) => void
  resetTheme: () => void
  addTopic: (title: string, interest?: string) => string
  /** Crea un argomento senza aprire la sessione (utile da Decisioni). */
  createTopic: (title: string, interest?: string) => string
  updateTopic: (id: string, patch: Partial<StudyTopic>) => void
  removeTopic: (id: string) => void
  setActiveTopic: (id: string | null) => void
  addDecision: (title: string, scale?: DecisionItem['scale']) => string
  updateDecision: (id: string, patch: Partial<DecisionItem>) => void
  removeDecision: (id: string) => void
  setActiveDecision: (id: string | null) => void
  recomputeDecisionConclusion: (id: string) => void
  pushAiMessage: (message: AiMessage) => void
  clearAi: () => void
  startSession: (topicId?: string | null) => void
  updateSessionDraft: (patch: Partial<StudySessionDraft>) => void
  completeSession: () => StudySessionLog | null
  abandonSession: () => void
  updateSessionLog: (id: string, patch: Partial<StudySessionLog>) => void
  removeSessionLog: (id: string) => void
  /** Collega una sessione libera a un argomento esistente. */
  linkSessionToTopic: (sessionId: string, topicId: string) => void
  /** Archivia un argomento (studiato / chiuso). */
  archiveTopic: (id: string) => void
  /** Riapri un argomento archiviato per continuare. */
  reopenTopic: (id: string, status?: 'in_corso' | 'approfondire') => void
  addSchedule: (event: ScheduledStudy) => void
  updateSchedule: (id: string, patch: Partial<ScheduledStudy>) => void
  removeSchedule: (id: string) => void
  saveResource: (resource: StudyResource, sourceQuery?: string) => SavedResource | null
  removeSavedResource: (id: string) => void
  removeSavedResources: (ids: string[]) => void
  saveSearch: (query: string, note?: string, resultCount?: number) => SavedSearch | null
  removeSavedSearch: (id: string) => void
  pushBibleReadingPlan: (plan: BibleReadingPlan) => void
  updateBibleReadingPlan: (id: string, patch: Partial<BibleReadingPlan>) => void
  removeBibleReadingPlan: (id: string) => void
  pushMinistryNote: (note: MinistryAssistNote) => void
  updateMinistryNote: (id: string, patch: Partial<MinistryAssistNote>) => void
  removeMinistryNote: (id: string) => void
  addDiscourseNote: (
    title?: string,
    opts?: { body?: string; sourceMinistryNoteId?: string },
  ) => string
  updateDiscourseNote: (id: string, patch: Partial<DiscourseNote>) => void
  removeDiscourseNote: (id: string) => void
  setActiveDiscourse: (id: string | null) => void
}

function resourceKey(r: { url: string; lank?: string; docid?: string }) {
  return `${r.url}|${r.lank || ''}|${r.docid || ''}`
}

/** Allinea testi salvati alla terminologia jw.org (es. Corinti, ministero). */
function normalizeTopicTerms(topic: StudyTopic): StudyTopic {
  return {
    ...topic,
    title: normalizeJwItalian(topic.title || ''),
    interest: normalizeJwItalian(topic.interest || ''),
    objectives: normalizeJwItalianList(topic.objectives || []).filter((o) => !isSectionHeading(o)),
    reflections: (topic.reflections || []).map((r) => ({
      ...r,
      prompt: normalizeJwItalian(r.prompt || ''),
      response: normalizeJwItalian(r.response || ''),
    })),
    questions: (topic.questions || []).map((q) => ({
      ...q,
      question: normalizeJwItalian(q.question || ''),
      answer: normalizeJwItalian(q.answer || ''),
    })),
    practices: (topic.practices || []).map((p) => ({
      ...p,
      action: normalizeJwItalian(p.action || ''),
      outcome: normalizeJwItalian(p.outcome || ''),
    })),
    transcript: topic.transcript ? normalizeJwItalian(topic.transcript) : topic.transcript,
  }
}

function normalizeDecisionTerms(decision: DecisionItem): DecisionItem {
  return {
    ...decision,
    title: normalizeJwItalian(decision.title || ''),
    context: normalizeJwItalian(decision.context || ''),
    conclusion: normalizeJwItalian(decision.conclusion || ''),
    prayerNotes: normalizeJwItalian(decision.prayerNotes || ''),
    chosenDecision: normalizeJwItalian(decision.chosenDecision || ''),
    honestMotivations: normalizeJwItalian(decision.honestMotivations || ''),
    conclusionsSummary: decision.conclusionsSummary
      ? normalizeJwItalian(decision.conclusionsSummary)
      : decision.conclusionsSummary,
    nextStepsPlan: decision.nextStepsPlan
      ? normalizeJwItalian(decision.nextStepsPlan)
      : decision.nextStepsPlan,
    goals: Array.isArray(decision.goals)
      ? decision.goals.map((g) => ({
          ...g,
          title: normalizeJwItalian(g.title || ''),
          notes: g.notes ? normalizeJwItalian(g.notes) : g.notes,
          dueDate: g.dueDate || undefined,
        }))
      : decision.goals || [],
    aiElaboration: decision.aiElaboration
      ? normalizeJwItalian(decision.aiElaboration)
      : decision.aiElaboration,
    lucidityAnalysis: decision.lucidityAnalysis
      ? normalizeJwItalian(decision.lucidityAnalysis)
      : decision.lucidityAnalysis,
    pros: (decision.pros || []).map((p) => normalizeJwItalian(p || '')),
    cons: (decision.cons || []).map((c) => normalizeJwItalian(c || '')),
    priorities: (decision.priorities || []).map((p) => ({
      ...p,
      label: normalizeJwItalian(p.label || ''),
      note: normalizeJwItalian(p.note || ''),
    })),
  }
}

function seedTopic(title: string, interest = ''): StudyTopic {
  const now = new Date().toISOString()
  return {
    id: uid('topic'),
    title,
    interest,
    status: 'da_iniziare',
    createdAt: now,
    updatedAt: now,
    objectives: ['Capire meglio cosa insegna la Bibbia su questo tema'],
    reflections: DEFAULT_REFLECTION_PROMPTS.map((prompt) => ({
      id: uid('ref'),
      prompt,
      response: '',
    })),
    questions: [
      {
        id: uid('q'),
        question: 'Cosa posso imparare su Geova da questo argomento?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Quale cambiamento concreto posso fare questa settimana?',
        answer: '',
      },
    ],
    practices: DEFAULT_PRACTICE_IDEAS.slice(0, 3).map((action) => ({
      id: uid('prac'),
      action,
      tried: false,
      outcome: '',
    })),
    resources: [],
    schedule: {
      days: ['lun', 'mer', 'ven'],
      minutesPerSession: 25,
      notes: '',
    },
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'home',
      settings: defaultSettings,
      topics: [],
      decisions: [],
      activeTopicId: null,
      activeDecisionId: null,
      aiMessages: [],
      sessionDraft: null,
      sessionLogs: [],
      schedules: [],
      savedResources: [],
      savedSearches: [],
      bibleReadingPlans: [],
      ministryNotes: [],
      discourseNotes: [],
      activeDiscourseId: null,
      setView: (view) => set({ view }),
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateTheme: (patch) =>
        set((s) => ({
          settings: { ...s.settings, theme: { ...s.settings.theme, ...patch } },
        })),
      resetTheme: () =>
        set((s) => ({ settings: { ...s.settings, theme: defaultTheme } })),
      addTopic: (title, interest = '') => {
        // Crea e apre il Quaderno — non avvia una sessione fantasma.
        // Per studiare subito usare startSession(id) dopo createTopic/addTopic.
        const topic = seedTopic(title.trim(), interest.trim())
        set((s) => ({
          topics: [topic, ...s.topics],
          activeTopicId: topic.id,
          view: 'studio',
        }))
        return topic.id
      },
      createTopic: (title, interest = '') => {
        const topic = seedTopic(title.trim(), interest.trim())
        set((s) => ({
          topics: [topic, ...s.topics],
        }))
        return topic.id
      },
      updateTopic: (id, patch) =>
        set((s) => ({
          topics: s.topics.map((t) => {
            if (t.id !== id) return t
            const merged = { ...t, ...patch, updatedAt: new Date().toISOString() }
            return normalizeTopicTerms(merged)
          }),
        })),
      removeTopic: (id) =>
        set((s) => ({
          topics: s.topics.filter((t) => t.id !== id),
          activeTopicId: s.activeTopicId === id ? null : s.activeTopicId,
          schedules: s.schedules.filter((ev) => ev.topicId !== id),
          decisions: s.decisions.map((d) => ({
            ...d,
            linkedTopicIds: (d.linkedTopicIds || []).filter((tid) => tid !== id),
          })),
        })),
      setActiveTopic: (id) => set({ activeTopicId: id, view: id ? 'studio' : get().view }),
      addDecision: (title, scale = 'piccola') => {
        const now = new Date().toISOString()
        const decision: DecisionItem = {
          id: uid('dec'),
          title: title.trim(),
          context: '',
          scale,
          priorities: [
            { id: uid('pri'), label: 'Rapporto con Geova', weight: 10, note: '' },
            { id: uid('pri'), label: 'Pace di coscienza', weight: 8, note: '' },
            { id: uid('pri'), label: 'Effetti sulla famiglia/congregazione', weight: 7, note: '' },
          ],
          pros: [''],
          cons: [''],
          linkedTopicIds: [],
          relatedResources: [],
          conclusion: '',
          prayerNotes: '',
          chosenDecision: '',
          honestMotivations: '',
          conclusionsSummary: '',
          nextStepsPlan: '',
          goals: [],
          aiElaboration: '',
          lucidityAnalysis: '',
          status: 'aperta',
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({
          decisions: [decision, ...s.decisions],
          activeDecisionId: decision.id,
          view: 'decisioni',
        }))
        return decision.id
      },
      updateDecision: (id, patch) =>
        set((s) => ({
          decisions: s.decisions.map((d) => {
            if (d.id !== id) return d
            return normalizeDecisionTerms({
              ...d,
              ...patch,
              linkedTopicIds: patch.linkedTopicIds ?? d.linkedTopicIds ?? [],
              updatedAt: new Date().toISOString(),
            })
          }),
        })),
      removeDecision: (id) =>
        set((s) => ({
          decisions: s.decisions.filter((d) => d.id !== id),
          activeDecisionId: s.activeDecisionId === id ? null : s.activeDecisionId,
        })),
      setActiveDecision: (id) => set({ activeDecisionId: id }),
      recomputeDecisionConclusion: (id) => {
        const decision = get().decisions.find((d) => d.id === id)
        if (!decision) return
        const conclusion = buildDecisionConclusion({
          title: decision.title,
          priorities: decision.priorities,
          pros: decision.pros,
          cons: decision.cons,
          prayerNotes: decision.prayerNotes,
        })
        get().updateDecision(id, { conclusion, status: 'in_valutazione' })
      },
      pushAiMessage: (message) =>
        set((s) => ({ aiMessages: [...s.aiMessages, message] })),
      clearAi: () => set({ aiMessages: [] }),
      startSession: (topicId = null) => {
        const id = topicId ?? get().activeTopicId
        const topic = get().topics.find((t) => t.id === id)
        const draft = emptyDraft(id)
        if (topic) {
          draft.goal = topic.objectives[0] || ''
          draft.question = topic.questions[0]?.question || draft.question
          draft.practice = topic.practices.find((p) => !p.tried)?.action || ''
          if (topic.resources[0]) {
            draft.resourceTitle = topic.resources[0].title
            draft.resourceUrl = topic.resources[0].url
            draft.resourceLank = topic.resources[0].lank
            draft.resourceDocid = topic.resources[0].docid
          }
        }
        set({
          sessionDraft: draft,
          activeTopicId: id,
          view: 'sessione',
        })
      },
      updateSessionDraft: (patch) =>
        set((s) =>
          s.sessionDraft
            ? { sessionDraft: { ...s.sessionDraft, ...patch } }
            : s,
        ),
      completeSession: () => {
        const draft = get().sessionDraft
        if (!draft) return null
        const topic = get().topics.find((t) => t.id === draft.topicId)
        const started = new Date(draft.startedAt).getTime()
        const minutes = Math.max(
          draft.minutesSpent,
          Math.round((Date.now() - started) / 60000) || 1,
        )
        const log: StudySessionLog = {
          id: uid('sess'),
          topicId: draft.topicId,
          topicTitle: topic?.title || draft.goal || 'Studio personale',
          completedAt: new Date().toISOString(),
          goal: draft.goal,
          highlight: draft.highlight || draft.reflection,
          keyVerse: draft.keyVerse,
          practice: draft.practice,
          gratitude: draft.gratitude,
          minutesSpent: minutes,
          prayer: draft.prayer,
          reflection: draft.reflection,
          question: draft.question,
          answer: draft.answer,
          resourceTitle: draft.resourceTitle,
          resourceUrl: draft.resourceUrl,
        }

        // Merge insights into topic notebook
        if (topic) {
          const reflections = [...topic.reflections]
          if (draft.reflection.trim()) {
            reflections.unshift({
              id: uid('ref'),
              prompt: 'Dalla sessione di oggi',
              response: draft.reflection,
            })
          }
          const questions = [...topic.questions]
          if (draft.answer.trim()) {
            questions.unshift({
              id: uid('q'),
              question: draft.question,
              answer: draft.answer,
            })
          }
          const practices = [...topic.practices]
          if (draft.practice.trim()) {
            practices.unshift({
              id: uid('prac'),
              action: draft.practice,
              tried: false,
              outcome: '',
            })
          }
          // Resta «in corso» se era nuovo; non archivia automaticamente
          // (l’utente sceglie dopo: archiviare o programmare altri giorni).
          const nextStatus =
            topic.status === 'da_iniziare' || topic.status === 'completato'
              ? 'in_corso'
              : topic.status

          // Porta nel Quaderno il materiale e la scrittura usati in sessione
          let resources = [...topic.resources]
          if (draft.resourceUrl?.trim() || draft.resourceTitle?.trim()) {
            const already = resources.some(
              (r) =>
                (draft.resourceUrl && r.url === draft.resourceUrl) ||
                (draft.resourceTitle &&
                  r.title === draft.resourceTitle &&
                  !draft.resourceUrl),
            )
            if (!already) {
              resources = [
                {
                  id: uid('res'),
                  title: draft.resourceTitle || 'Materiale della sessione',
                  url: draft.resourceUrl || '',
                  kind: 'article',
                  lank: draft.resourceLank,
                  docid: draft.resourceDocid,
                  notes: 'Aggiunto dalla sessione guidata',
                },
                ...resources,
              ]
            }
          }
          if (draft.keyVerse?.trim()) {
            const verseTitle = draft.keyVerse.trim()
            const verseAlready = resources.some(
              (r) => r.kind === 'bible' && r.title === verseTitle,
            )
            if (!verseAlready) {
              resources = [
                {
                  id: uid('verse'),
                  title: verseTitle,
                  url: `https://www.jw.org/finder?prefer=lang&wtlocale=I&q=${encodeURIComponent(verseTitle)}`,
                  kind: 'bible',
                  notes: 'Scrittura chiave della sessione',
                },
                ...resources,
              ]
            }
          }

          get().updateTopic(topic.id, {
            status: nextStatus,
            reflections,
            questions,
            practices,
            resources,
            objectives: draft.goal
              ? [draft.goal, ...topic.objectives.filter((o) => o !== draft.goal)]
              : topic.objectives,
          })
        }

        // Resta in Sessione così compare la schermata «completata» con le scelte successive
        set((s) => ({
          sessionLogs: [log, ...s.sessionLogs].slice(0, 100),
          sessionDraft: null,
          view: 'sessione',
        }))
        return log
      },
      abandonSession: () => set({ sessionDraft: null }),
      updateSessionLog: (id, patch) =>
        set((s) => ({
          sessionLogs: s.sessionLogs.map((log) =>
            log.id === id ? { ...log, ...patch } : log,
          ),
        })),
      removeSessionLog: (id) =>
        set((s) => ({ sessionLogs: s.sessionLogs.filter((log) => log.id !== id) })),
      linkSessionToTopic: (sessionId, topicId) => {
        const topic = get().topics.find((t) => t.id === topicId)
        const log = get().sessionLogs.find((l) => l.id === sessionId)
        if (!topic || !log) return
        get().updateSessionLog(sessionId, {
          topicId,
          topicTitle: topic.title,
        })
        if (topic.status === 'da_iniziare') {
          get().updateTopic(topicId, { status: 'in_corso' })
        }
      },
      archiveTopic: (id) => {
        get().updateTopic(id, { status: 'completato' })
      },
      reopenTopic: (id, status = 'in_corso') => {
        get().updateTopic(id, { status })
      },
      addSchedule: (event) => {
        // Programmare altri giorni = non archiviare: tieni l’argomento attivo
        if (event.topicId) {
          const topic = get().topics.find((t) => t.id === event.topicId)
          if (topic && (topic.status === 'completato' || topic.status === 'da_iniziare')) {
            get().updateTopic(event.topicId, { status: 'in_corso' })
          }
        }
        set((s) => ({
          schedules: [event, ...s.schedules]
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .slice(0, 50),
        }))
      },
      updateSchedule: (id, patch) =>
        set((s) => ({
          schedules: s.schedules
            .map((ev) => (ev.id === id ? { ...ev, ...patch } : ev))
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        })),
      removeSchedule: (id) =>
        set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) })),
      saveResource: (resource, sourceQuery) => {
        const key = resourceKey(resource)
        const existing = get().savedResources.find((r) => resourceKey(r) === key)
        if (existing) return null
        const saved: SavedResource = {
          ...resource,
          id: resource.id || uid('saved'),
          savedAt: new Date().toISOString(),
          sourceQuery: sourceQuery?.trim() || undefined,
        }
        set((s) => ({
          savedResources: [saved, ...s.savedResources].slice(0, 200),
        }))
        return saved
      },
      removeSavedResource: (id) =>
        set((s) => ({ savedResources: s.savedResources.filter((r) => r.id !== id) })),
      removeSavedResources: (ids) => {
        if (!ids.length) return
        const setIds = new Set(ids)
        set((s) => ({
          savedResources: s.savedResources.filter((r) => !setIds.has(r.id)),
        }))
      },
      saveSearch: (query, note, resultCount) => {
        const q = query.trim()
        if (!q) return null
        const dup = get().savedSearches.find(
          (s) => s.query.toLowerCase() === q.toLowerCase(),
        )
        if (dup) {
          const updated: SavedSearch = {
            ...dup,
            note: note?.trim() || dup.note,
            resultCount: resultCount ?? dup.resultCount,
            createdAt: new Date().toISOString(),
          }
          set((s) => ({
            savedSearches: [
              updated,
              ...s.savedSearches.filter((x) => x.id !== dup.id),
            ].slice(0, 100),
          }))
          return updated
        }
        const saved: SavedSearch = {
          id: uid('search'),
          query: q,
          createdAt: new Date().toISOString(),
          note: note?.trim() || undefined,
          resultCount,
        }
        set((s) => ({
          savedSearches: [saved, ...s.savedSearches].slice(0, 100),
        }))
        return saved
      },
      removeSavedSearch: (id) =>
        set((s) => ({ savedSearches: s.savedSearches.filter((x) => x.id !== id) })),
      pushBibleReadingPlan: (plan) =>
        set((s) => ({
          bibleReadingPlans: [plan, ...s.bibleReadingPlans].slice(0, 50),
        })),
      updateBibleReadingPlan: (id, patch) =>
        set((s) => ({
          bibleReadingPlans: s.bibleReadingPlans.map((p) =>
            p.id === id
              ? { ...p, ...patch, updatedAt: new Date().toISOString() }
              : p,
          ),
        })),
      removeBibleReadingPlan: (id) =>
        set((s) => ({
          bibleReadingPlans: s.bibleReadingPlans.filter((p) => p.id !== id),
        })),
      pushMinistryNote: (note) =>
        set((s) => ({
          ministryNotes: [note, ...s.ministryNotes].slice(0, 50),
        })),
      updateMinistryNote: (id, patch) =>
        set((s) => ({
          ministryNotes: s.ministryNotes.map((n) =>
            n.id === id
              ? { ...n, ...patch, updatedAt: new Date().toISOString() }
              : n,
          ),
        })),
      removeMinistryNote: (id) =>
        set((s) => ({
          ministryNotes: s.ministryNotes.filter((n) => n.id !== id),
        })),
      addDiscourseNote: (title = 'Nuovo discorso', opts) => {
        const now = new Date().toISOString()
        const sections = defaultSections(opts?.body || '')
        const note: DiscourseNote = {
          id: uid('disc'),
          title: title.trim() || 'Nuovo discorso',
          body: joinSections(sections),
          sections,
          estimatedMinutes: totalMinutes(sections),
          sourceMinistryNoteId: opts?.sourceMinistryNoteId,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({
          discourseNotes: [note, ...s.discourseNotes].slice(0, 40),
          activeDiscourseId: note.id,
          view: 'discorso',
        }))
        return note.id
      },
      updateDiscourseNote: (id, patch) =>
        set((s) => ({
          discourseNotes: s.discourseNotes.map((n) => {
            if (n.id !== id) return n
            const next = {
              ...n,
              ...patch,
              title: patch.title !== undefined ? patch.title : n.title,
              body: patch.body !== undefined ? patch.body : n.body,
              sections: patch.sections !== undefined ? patch.sections : n.sections,
              updatedAt: new Date().toISOString(),
            }
            if (patch.sections) {
              next.body = joinSections(patch.sections)
              next.estimatedMinutes = totalMinutes(patch.sections)
            }
            return next
          }),
        })),
      removeDiscourseNote: (id) =>
        set((s) => {
          const next = s.discourseNotes.filter((n) => n.id !== id)
          return {
            discourseNotes: next,
            activeDiscourseId:
              s.activeDiscourseId === id ? next[0]?.id || null : s.activeDiscourseId,
          }
        }),
      setActiveDiscourse: (id) => set({ activeDiscourseId: id, view: 'discorso' }),
    }),
    {
      name: 'studio-personale-jw-v1',
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<AppState>
        return {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...(p.settings || {}),
            features: {
              ...current.settings.features,
              ...(p.settings?.features || {}),
              pdfJwpub: p.settings?.features?.pdfJwpub !== false,
              videoStudio: p.settings?.features?.videoStudio !== false,
              salvati: p.settings?.features?.salvati !== false,
              lettureBibbia: p.settings?.features?.lettureBibbia !== false,
              ministero: p.settings?.features?.ministero !== false,
              discorso: p.settings?.features?.discorso !== false,
            },
            iCloud: {
              ...current.settings.iCloud!,
              ...(p.settings?.iCloud || {}),
            },
            cloudSync: {
              ...current.settings.cloudSync!,
              ...(p.settings?.cloudSync || {}),
            },
            navOrder: (() => {
              let order = [...(p.settings?.navOrder || current.settings.navOrder)]
              if (!order.includes('sessione')) {
                order = ['home', 'sessione', ...order.filter((v) => v !== 'home')]
              }
              if (!order.includes('diario')) {
                const studioIdx = order.indexOf('studio')
                if (studioIdx >= 0) order.splice(studioIdx + 1, 0, 'diario')
                else order.push('diario')
              }
              if (!order.includes('pdfJwpub')) {
                const diarioIdx = order.indexOf('diario')
                if (diarioIdx >= 0) order.splice(diarioIdx + 1, 0, 'pdfJwpub')
                else order.push('pdfJwpub')
              }
              if (!order.includes('videoStudio')) {
                const pdfIdx = order.indexOf('pdfJwpub')
                if (pdfIdx >= 0) order.splice(pdfIdx + 1, 0, 'videoStudio')
                else order.push('videoStudio')
              }
              if (!order.includes('salvati')) {
                const videoIdx = order.indexOf('videoStudio')
                if (videoIdx >= 0) order.splice(videoIdx + 1, 0, 'salvati')
                else order.push('salvati')
              }
              if (!order.includes('lettureBibbia')) {
                const salvatiIdx = order.indexOf('salvati')
                if (salvatiIdx >= 0) order.splice(salvatiIdx + 1, 0, 'lettureBibbia')
                else order.push('lettureBibbia')
              }
              if (!order.includes('ministero')) {
                const lettureIdx = order.indexOf('lettureBibbia')
                if (lettureIdx >= 0) order.splice(lettureIdx + 1, 0, 'ministero')
                else order.push('ministero')
              }
              if (!order.includes('discorso')) {
                const minIdx = order.indexOf('ministero')
                if (minIdx >= 0) order.splice(minIdx + 1, 0, 'discorso')
                else order.push('discorso')
              }
              if (!order.includes('obiettiviDecisioni')) {
                const decIdx = order.indexOf('decisioni')
                if (decIdx >= 0) order.splice(decIdx + 1, 0, 'obiettiviDecisioni')
                else order.push('obiettiviDecisioni')
              }
              return order
            })(),
          },
          sessionLogs: p.sessionLogs || [],
          sessionDraft: p.sessionDraft || null,
          schedules: p.schedules || [],
          savedResources: p.savedResources || [],
          savedSearches: p.savedSearches || [],
          bibleReadingPlans: p.bibleReadingPlans || [],
          ministryNotes: p.ministryNotes || [],
          discourseNotes: p.discourseNotes || [],
          activeDiscourseId: p.activeDiscourseId ?? null,
          topics: (p.topics || current.topics || []).map(normalizeTopicTerms),
          decisions: (p.decisions || current.decisions || []).map(normalizeDecisionTerms),
          aiMessages: (p.aiMessages || current.aiMessages || []).map((m) =>
            m.role === 'assistant'
              ? { ...m, content: normalizeJwItalian(m.content || '') }
              : m,
          ),
        }
      },
      partialize: (s) => ({
        settings: s.settings,
        topics: s.topics,
        decisions: s.decisions,
        activeTopicId: s.activeTopicId,
        activeDecisionId: s.activeDecisionId,
        aiMessages: s.aiMessages,
        sessionDraft: s.sessionDraft,
        sessionLogs: s.sessionLogs,
        schedules: s.schedules,
        savedResources: s.savedResources,
        savedSearches: s.savedSearches,
        bibleReadingPlans: s.bibleReadingPlans,
        ministryNotes: s.ministryNotes,
        discourseNotes: s.discourseNotes,
        activeDiscourseId: s.activeDiscourseId,
      }),
    },
  ),
)

export const VIEW_LABELS: Record<AppView, string> = {
  home: 'Home',
  argomenti: 'Argomenti',
  sessione: 'Sessione',
  studio: 'Quaderno',
  diario: 'Diario',
  pdfJwpub: 'PDF → EPUB',
  videoStudio: 'Video → studio',
  salvati: 'Da studiare',
  lettureBibbia: 'Letture Bibbia',
  ministero: 'Ministero',
  discorso: 'Discorso',
  decisioni: 'Decisioni',
  obiettiviDecisioni: 'Obiettivi',
  assistente: 'Assistente AI',
  impostazioni: 'Impostazioni',
}
