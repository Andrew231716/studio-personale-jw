import {
  mergeAppSettings,
  normalizeDecisionTerms,
  normalizeTopicTerms,
  useAppStore,
} from '../store/useAppStore'
import { isValidSyncKey } from './cloudSync'
import type {
  AiMessage,
  AppSettings,
  BibleReadingPlan,
  DecisionItem,
  DiscourseNote,
  MinistryAssistNote,
  SavedResource,
  SavedSearch,
  SavedVideoTranscript,
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
    discourseNotes?: DiscourseNote[]
    activeDiscourseId?: string | null
    savedVideoTranscripts?: SavedVideoTranscript[]
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
      discourseNotes: s.discourseNotes,
      activeDiscourseId: s.activeDiscourseId,
      savedVideoTranscripts: s.savedVideoTranscripts,
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
  const cur = useAppStore.getState()
  useAppStore.setState({
    settings: mergeAppSettings(cur.settings, d.settings),
    topics: (Array.isArray(d.topics) ? d.topics : []).map(normalizeTopicTerms),
    decisions: (Array.isArray(d.decisions) ? d.decisions : []).map(normalizeDecisionTerms),
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
    discourseNotes: Array.isArray(d.discourseNotes) ? d.discourseNotes : [],
    activeDiscourseId: d.activeDiscourseId ?? null,
    savedVideoTranscripts: Array.isArray(d.savedVideoTranscripts)
      ? d.savedVideoTranscripts
      : [],
  })
}

function stampOf(item: { updatedAt?: string; createdAt?: string; savedAt?: string }): number {
  const raw = item.updatedAt || item.createdAt || item.savedAt || ''
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

/** Unisce due liste per id: resta la versione più recente; gli id solo locali restano. */
function mergeById<
  T extends { id: string; updatedAt?: string; createdAt?: string; savedAt?: string },
>(local: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of local) map.set(item.id, item)
  for (const item of incoming) {
    const prev = map.get(item.id)
    if (!prev || stampOf(item) >= stampOf(prev)) map.set(item.id, item)
  }
  return Array.from(map.values())
}

/**
 * Unisce backup e dati locali senza cancellare ciò che esiste solo qui.
 * A parità di id vince l’elemento più recente (updatedAt/createdAt).
 */
export function mergeBackup(backup: StudioBackup): void {
  const d = backup.data
  const cur = useAppStore.getState()
  const baseCloud = cur.settings.cloudSync || { enabled: false, syncKey: '' }
  const incomingCloud = d.settings?.cloudSync
  const cloudSync =
    incomingCloud && isValidSyncKey(incomingCloud.syncKey || '')
      ? {
          enabled: incomingCloud.enabled ?? baseCloud.enabled,
          syncKey: incomingCloud.syncKey || baseCloud.syncKey,
        }
      : {
          enabled: incomingCloud?.enabled ?? baseCloud.enabled,
          syncKey: baseCloud.syncKey || incomingCloud?.syncKey || '',
        }

  const settings: AppSettings = mergeAppSettings(cur.settings, {
    ...(d.settings || {}),
    cloudSync,
  })

  const topics = mergeById(cur.topics, Array.isArray(d.topics) ? d.topics : []).map(
    normalizeTopicTerms,
  )
  const decisions = mergeById(
    cur.decisions,
    Array.isArray(d.decisions) ? d.decisions : [],
  ).map(normalizeDecisionTerms)
  const sessionLogs = mergeById(
    cur.sessionLogs,
    Array.isArray(d.sessionLogs) ? d.sessionLogs : [],
  )
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 100)
  const schedules = mergeById(
    cur.schedules,
    Array.isArray(d.schedules) ? d.schedules : [],
  )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 50)
  const savedResources = mergeById(
    cur.savedResources,
    Array.isArray(d.savedResources) ? d.savedResources : [],
  ).slice(0, 200)
  const savedSearches = mergeById(
    cur.savedSearches,
    Array.isArray(d.savedSearches) ? d.savedSearches : [],
  ).slice(0, 100)
  const bibleReadingPlans = mergeById(
    cur.bibleReadingPlans,
    Array.isArray(d.bibleReadingPlans) ? d.bibleReadingPlans : [],
  ).slice(0, 50)
  const ministryNotes = mergeById(
    cur.ministryNotes,
    Array.isArray(d.ministryNotes) ? d.ministryNotes : [],
  ).slice(0, 50)
  const discourseNotes = mergeById(
    cur.discourseNotes,
    Array.isArray(d.discourseNotes) ? d.discourseNotes : [],
  ).slice(0, 40)
  const savedVideoTranscripts = mergeById(
    cur.savedVideoTranscripts || [],
    Array.isArray(d.savedVideoTranscripts) ? d.savedVideoTranscripts : [],
  )
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 40)
  const aiMessages = mergeById(
    cur.aiMessages,
    Array.isArray(d.aiMessages) ? d.aiMessages : [],
  ).slice(-200)

  useAppStore.setState({
    settings,
    topics,
    decisions,
    sessionLogs,
    schedules,
    savedResources,
    savedSearches,
    bibleReadingPlans,
    ministryNotes,
    discourseNotes,
    savedVideoTranscripts,
    aiMessages,
    activeTopicId: cur.activeTopicId || d.activeTopicId || null,
    activeDecisionId: cur.activeDecisionId || d.activeDecisionId || null,
    activeDiscourseId: cur.activeDiscourseId || d.activeDiscourseId || null,
    sessionDraft: cur.sessionDraft || d.sessionDraft || null,
  })
}

export async function readBackupFile(file: File): Promise<StudioBackup> {
  const text = await file.text()
  return parseBackup(text)
}
