export type ContentKind = 'article' | 'video' | 'audio' | 'index' | 'other'

export interface JwResult {
  id: string
  title: string
  snippet: string
  kind: ContentKind
  url: string
  wolUrl?: string
  lank?: string
  docid?: string
  image?: string
  duration?: string
  context?: string
}

export interface StudyResource {
  id: string
  title: string
  url: string
  kind: ContentKind
  notes?: string
  lank?: string
  docid?: string
  libraryUrl?: string
}

export interface StudyTopic {
  id: string
  title: string
  interest: string
  status: 'da_iniziare' | 'in_corso' | 'approfondire' | 'completato'
  createdAt: string
  updatedAt: string
  objectives: string[]
  reflections: ReflectionPoint[]
  questions: StudyQuestion[]
  practices: PracticeItem[]
  resources: StudyResource[]
  schedule?: StudySchedule
}

export interface ReflectionPoint {
  id: string
  prompt: string
  response: string
}

export interface StudyQuestion {
  id: string
  question: string
  answer: string
}

export interface PracticeItem {
  id: string
  action: string
  tried: boolean
  outcome: string
}

export interface StudySchedule {
  days: string[]
  minutesPerSession: number
  startDate?: string
  notes?: string
}

export type DecisionScale = 'piccola' | 'grande'

export interface DecisionItem {
  id: string
  title: string
  context: string
  scale: DecisionScale
  priorities: PriorityItem[]
  pros: string[]
  cons: string[]
  relatedResources: StudyResource[]
  conclusion: string
  prayerNotes: string
  status: 'aperta' | 'in_valutazione' | 'decisa'
  createdAt: string
  updatedAt: string
}

export interface PriorityItem {
  id: string
  label: string
  weight: number
  note: string
}

export interface AiMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export type AppView =
  | 'home'
  | 'argomenti'
  | 'sessione'
  | 'studio'
  | 'diario'
  | 'decisioni'
  | 'assistente'
  | 'impostazioni'

export type SummaryPeriod = 'giorno' | 'settimana' | 'mese'

export interface FeatureFlags {
  home: boolean
  argomenti: boolean
  sessione: boolean
  studio: boolean
  diario: boolean
  decisioni: boolean
  assistente: boolean
  impostazioni: boolean
  recentJwFeed: boolean
  schedule: boolean
}

export interface StudySessionDraft {
  topicId: string | null
  step: number
  prayer: string
  goal: string
  resourceTitle: string
  resourceUrl: string
  resourceLank?: string
  resourceDocid?: string
  highlight: string
  keyVerse: string
  reflection: string
  question: string
  answer: string
  practice: string
  gratitude: string
  startedAt: string
  minutesSpent: number
}

export interface StudySessionLog {
  id: string
  topicId: string | null
  topicTitle: string
  completedAt: string
  goal: string
  highlight: string
  keyVerse: string
  practice: string
  gratitude: string
  minutesSpent: number
  prayer?: string
  reflection?: string
  question?: string
  answer?: string
  resourceTitle?: string
  resourceUrl?: string
}

export interface ScheduledStudy {
  id: string
  title: string
  topicId: string | null
  topicTitle: string
  startsAt: string
  durationMinutes: number
  reminderMinutes: number
  notes: string
  createdAt: string
}

export interface ThemeConfig {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  muted: string
  radius: number
  fontDisplay: string
  fontBody: string
  density: 'comoda' | 'media' | 'compatta'
  heroStyle: 'pieno' | 'morbido'
}

export interface AppSettings {
  language: 'I' | 'E'
  theme: ThemeConfig
  features: FeatureFlags
  navOrder: AppView[]
  brandName: string
  tagline: string
  studyMethodNotes: string
}
