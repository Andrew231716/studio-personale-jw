import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_PRACTICE_IDEAS,
  DEFAULT_REFLECTION_PROMPTS,
  buildDecisionConclusion,
} from '../lib/studyMethod'
import { uid } from '../lib/id'
import type {
  AiMessage,
  AppSettings,
  AppView,
  DecisionItem,
  ScheduledStudy,
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
    decisioni: true,
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
    'decisioni',
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
  setView: (view: AppView) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateTheme: (patch: Partial<ThemeConfig>) => void
  resetTheme: () => void
  addTopic: (title: string, interest?: string) => string
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
  addSchedule: (event: ScheduledStudy) => void
  removeSchedule: (id: string) => void
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
        const topic = seedTopic(title.trim(), interest.trim())
        set((s) => ({
          topics: [topic, ...s.topics],
          activeTopicId: topic.id,
          view: 'sessione',
          sessionDraft: emptyDraft(topic.id),
        }))
        return topic.id
      },
      updateTopic: (id, patch) =>
        set((s) => ({
          topics: s.topics.map((t) =>
            t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t,
          ),
        })),
      removeTopic: (id) =>
        set((s) => ({
          topics: s.topics.filter((t) => t.id !== id),
          activeTopicId: s.activeTopicId === id ? null : s.activeTopicId,
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
          relatedResources: [],
          conclusion: '',
          prayerNotes: '',
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
          decisions: s.decisions.map((d) =>
            d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d,
          ),
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
          get().updateTopic(topic.id, {
            status: 'in_corso',
            reflections,
            questions,
            practices,
            objectives: draft.goal
              ? [draft.goal, ...topic.objectives.filter((o) => o !== draft.goal)]
              : topic.objectives,
          })
        }

        set((s) => ({
          sessionLogs: [log, ...s.sessionLogs].slice(0, 100),
          sessionDraft: null,
          view: 'home',
        }))
        return log
      },
      abandonSession: () => set({ sessionDraft: null }),
      addSchedule: (event) =>
        set((s) => ({
          schedules: [event, ...s.schedules]
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .slice(0, 50),
        })),
      removeSchedule: (id) =>
        set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) })),
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
              return order
            })(),
          },
          sessionLogs: p.sessionLogs || [],
          sessionDraft: p.sessionDraft || null,
          schedules: p.schedules || [],
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
  decisioni: 'Decisioni',
  assistente: 'Assistente AI',
  impostazioni: 'Impostazioni',
}
