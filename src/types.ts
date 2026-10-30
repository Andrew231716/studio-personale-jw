export type ContentKind =
  | 'article'
  | 'video'
  | 'audio'
  | 'index'
  | 'book'
  | 'brochure'
  | 'bible'
  | 'other'

/** Sezioni come sulla ricerca / biblioteca di jw.org */
export type JwSectionId =
  | 'articoli'
  | 'libri'
  | 'opuscoli'
  | 'video'
  | 'audio'
  | 'guida_ricerche'
  | 'indici'
  | 'bibbia'
  | 'volantini'
  | 'programmi'
  | 'altro'

export interface JwResult {
  id: string
  title: string
  snippet: string
  kind: ContentKind
  section: JwSectionId
  url: string
  wolUrl?: string
  lank?: string
  docid?: string
  image?: string
  duration?: string
  /** Contesto pubblicazione dall’API (es. «LIBRI», «LA TORRE DI GUARDIA») */
  context?: string
  subtype?: string
  rank?: number
  themeScore?: number
  matchedQueries?: string[]
}

export interface JwResultSection {
  id: JwSectionId
  label: string
  items: JwResult[]
}

export interface JwDeepSearchResult {
  sections: JwResultSection[]
  flat: JwResult[]
  queriesUsed: string[]
  themeTokens: string[]
}

export interface StudyResource {
  id: string
  title: string
  url: string
  kind: ContentKind
  notes?: string
  lank?: string
  docid?: string
  wolUrl?: string
  /** Codice bible= per versetti / libri */
  bible?: string
  /** Simbolo pubblicazione (es. rff, ia) */
  pub?: string
  libraryUrl?: string
}

/** Materiale jw.org salvato per uno studio futuro (non ancora legato a un argomento). */
export interface SavedResource extends StudyResource {
  savedAt: string
  sourceQuery?: string
}

/** Ricerca salvata per riprenderla più tardi. */
export interface SavedSearch {
  id: string
  query: string
  createdAt: string
  note?: string
  resultCount?: number
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
  /** Trascrizione da sottotitoli di un video JW, se lo studio nasce da un video. */
  transcript?: string
  transcriptMeta?: {
    lank: string
    videoTitle: string
    sourceUrl?: string
    createdAt: string
    /** Intervallo usato per la trascrizione, in secondi. */
    rangeStartSec?: number
    rangeEndSec?: number
  }
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
  | 'pdfJwpub'
  | 'videoStudio'
  | 'salvati'
  | 'lettureBibbia'
  | 'ministero'
  | 'decisioni'
  | 'assistente'
  | 'impostazioni'

export type SummaryPeriod = 'giorno' | 'settimana' | 'mese'

export type BibleReadingKind = 'personaggio' | 'racconto' | 'libro' | 'tema'

export interface BibleScriptureRef {
  id: string
  label: string
  /** Codice bible= jw.org / JW Library */
  bible?: string
  url?: string
  note?: string
}

export interface BibleReflection {
  id: string
  text: string
  createdAt: string
}

export interface BibleReadingPlan {
  id: string
  title: string
  kind: BibleReadingKind
  query: string
  plan: string
  resources: StudyResource[]
  scriptures?: BibleScriptureRef[]
  reflections?: BibleReflection[]
  blurb?: string
  createdAt: string
  updatedAt?: string
}

export type MinistryAssistKind = 'riassunto' | 'schema' | 'spunto' | 'scritture' | 'presentazione'

export interface MinistryAssistNote {
  id: string
  title: string
  kind: MinistryAssistKind
  topic: string
  content: string
  resources: StudyResource[]
  sourceTitle?: string
  sourceUrl?: string
  createdAt: string
}

export interface FeatureFlags {
  home: boolean
  argomenti: boolean
  sessione: boolean
  studio: boolean
  diario: boolean
  pdfJwpub: boolean
  videoStudio: boolean
  salvati: boolean
  lettureBibbia: boolean
  ministero: boolean
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

export interface ICloudSettings {
  enabled: boolean
  containerId: string
  apiToken: string
  environment: 'development' | 'production'
}

/** Sync cloud tra dispositivi (chiave JWS-…), gestita dal server. */
export interface CloudSyncSettings {
  enabled: boolean
  syncKey: string
}

export interface AppSettings {
  language: 'I' | 'E'
  theme: ThemeConfig
  features: FeatureFlags
  navOrder: AppView[]
  brandName: string
  tagline: string
  studyMethodNotes: string
  /** Sync database privato iCloud (CloudKit) — opzionale avanzato. */
  iCloud?: ICloudSettings
  /** Sync cloud automatica tra dispositivi. */
  cloudSync?: CloudSyncSettings
}
