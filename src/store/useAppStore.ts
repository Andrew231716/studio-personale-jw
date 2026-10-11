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
  radius: 18,
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
    studio: true,
    decisioni: true,
    assistente: true,
    impostazioni: true,
    recentJwFeed: true,
    schedule: true,
  },
  navOrder: ['home', 'argomenti', 'studio', 'decisioni', 'assistente', 'impostazioni'],
  brandName: 'Studio Personale JW',
  tagline: 'Programma, approfondisci e decidi con l’aiuto di jw.org',
  studyMethodNotes:
    'Metodo ispirato ai consigli di articoli e video recenti su jw.org: preghiera, obiettivo, materiale aggiornato, meditazione, domande e applicazione pratica.',
}

interface AppState {
  view: AppView
  settings: AppSettings
  topics: StudyTopic[]
  decisions: DecisionItem[]
  activeTopicId: string | null
  activeDecisionId: string | null
  aiMessages: AiMessage[]
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
          view: 'studio',
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
    }),
    {
      name: 'studio-personale-jw-v1',
      partialize: (s) => ({
        settings: s.settings,
        topics: s.topics,
        decisions: s.decisions,
        activeTopicId: s.activeTopicId,
        activeDecisionId: s.activeDecisionId,
        aiMessages: s.aiMessages,
      }),
    },
  ),
)

export const VIEW_LABELS: Record<AppView, string> = {
  home: 'Home',
  argomenti: 'Argomenti',
  studio: 'Studio',
  decisioni: 'Decisioni',
  assistente: 'Assistente AI',
  impostazioni: 'Impostazioni',
}
