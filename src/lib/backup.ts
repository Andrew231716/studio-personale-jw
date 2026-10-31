import { useAppStore } from '../store/useAppStore'
import type {
  AiMessage,
  AppSettings,
  BibleReadingPlan,
  DecisionItem,
  MinistryAssistNote,
  SavedResource,
  SavedSearch,
  ScheduledStudy,
  StudySessionDraft,
  StudySessionLog,
  StudyTopic,
} from '../types'

export const BACKUP_FORMAT = 'studio-personale-jw-backup'
export const BACKUP_VERSION = 1

export interface StudioBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  data: {
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
  }
}

export function buildBackup(): StudioBackup {
  const s = useAppStore.getState()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
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
    },
  }
}

export function downloadBackup(): string {
  const backup = buildBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `studio-personale-jw-backup-${stamp}.json`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

export function parseBackup(raw: string): StudioBackup {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Il file non è un JSON valido.')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup non riconosciuto.')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error('Questo file non è un backup di Studio Personale JW.')
  }
  if (!obj.data || typeof obj.data !== 'object') {
    throw new Error('Il backup non contiene dati.')
  }
  return obj as unknown as StudioBackup
}

/** Sostituisce i dati locali con quelli del backup (dopo conferma utente). */
export function applyBackup(backup: StudioBackup): void {
  const d = backup.data
  useAppStore.setState({
    settings: d.settings ?? useAppStore.getState().settings,
    topics: Array.isArray(d.topics) ? d.topics : [],
    decisions: Array.isArray(d.decisions) ? d.decisions : [],
    activeTopicId: d.activeTopicId ?? null,
    activeDecisionId: d.activeDecisionId ?? null,
    aiMessages: Array.isArray(d.aiMessages) ? d.aiMessages : [],
    sessionDraft: d.sessionDraft ?? null,
    sessionLogs: Array.isArray(d.sessionLogs) ? d.sessionLogs : [],
    schedules: Array.isArray(d.schedules) ? d.schedules : [],
    savedResources: Array.isArray(d.savedResources) ? d.savedResources : [],
    savedSearches: Array.isArray(d.savedSearches) ? d.savedSearches : [],
    bibleReadingPlans: Array.isArray(d.bibleReadingPlans) ? d.bibleReadingPlans : [],
    ministryNotes: Array.isArray(d.ministryNotes) ? d.ministryNotes : [],
  })
}

export async function readBackupFile(file: File): Promise<StudioBackup> {
  const text = await file.text()
  return parseBackup(text)
}
