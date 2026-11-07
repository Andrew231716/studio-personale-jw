import type { ICloudSnapshot, SyncMetadata } from './types'

export const SYNC_COLLECTIONS = [
  'topics', 'decisions', 'aiMessages', 'sessionLogs', 'schedules', 'savedResources',
  'savedSearches', 'bibleReadingPlans', 'ministryNotes', 'discourseNotes', 'savedVideoTranscripts',
] as const

type Collection = typeof SYNC_COLLECTIONS[number]
type Item = { id: string; updatedAt?: string; createdAt?: string; completedAt?: string; savedAt?: string }
type TrackedState = Pick<ICloudSnapshot, Collection | 'sessionDraft' | 'syncMetadata'>

function itemTime(item: Item): string {
  return item.updatedAt || item.completedAt || item.createdAt || item.savedAt || ''
}

/** Registra le rimozioni anche mentre il dispositivo è offline. */
export function trackSyncChanges(before: TrackedState, patch: Partial<TrackedState>): SyncMetadata | undefined {
  const previous = before.syncMetadata
  const now = new Date(Math.max(Date.now(), Date.parse(previous?.draftChangedAt || '') + 1 || 0)).toISOString()
  let deleted = previous?.deleted
  for (const key of SYNC_COLLECTIONS) {
    const next = patch[key]
    if (!next || next === before[key]) continue
    const ids = new Set(next.map((item) => item.id))
    const removed = before[key]?.filter((item) => !ids.has(item.id)) || []
    if (!removed.length) continue
    deleted = { ...deleted }
    for (const item of removed) deleted[`${key}:${item.id}`] = now
  }
  const draftChangedAt = patch.sessionDraft !== undefined && patch.sessionDraft !== before.sessionDraft
    ? now
    : previous?.draftChangedAt
  return deleted === previous?.deleted && draftChangedAt === previous?.draftChangedAt
    ? previous
    : { deleted, draftChangedAt }
}

function byIdNewer<T extends Item>(local: T[], remote: T[], collection: Collection, deleted: Record<string, string>): T[] {
  const map = new Map<string, T>()
  for (const item of [...remote, ...local]) {
    const time = itemTime(item)
    if ((deleted[`${collection}:${item.id}`] || '') >= time && deleted[`${collection}:${item.id}`]) continue
    const previous = map.get(item.id)
    if (!previous || time >= itemTime(previous)) map.set(item.id, item)
  }
  return [...map.values()]
}

/** Le bozze precedenti alla migrazione non avevano una data di ultima modifica. */
function newerDraft(local: ICloudSnapshot, remote: ICloudSnapshot) {
  const localTime = local.syncMetadata?.draftChangedAt || local.sessionDraft?.startedAt || ''
  const remoteTime = remote.syncMetadata?.draftChangedAt || remote.sessionDraft?.startedAt || ''
  if (localTime !== remoteTime) return localTime > remoteTime ? local.sessionDraft : remote.sessionDraft
  if (!local.sessionDraft || !remote.sessionDraft) return null
  return local.sessionDraft.step >= remote.sessionDraft.step ? local.sessionDraft : remote.sessionDraft
}

export function mergeSnapshots(local: ICloudSnapshot, remote: ICloudSnapshot): ICloudSnapshot {
  const deleted = { ...remote.syncMetadata?.deleted }
  for (const [key, time] of Object.entries(local.syncMetadata?.deleted || {})) {
    if (time > (deleted[key] || '')) deleted[key] = time
  }
  const draftChangedAt = [local.syncMetadata?.draftChangedAt, remote.syncMetadata?.draftChangedAt]
    .filter(Boolean).sort().at(-1)
  const merge = <K extends Collection>(key: K) =>
    byIdNewer<Item>(local[key] || [], remote[key] || [], key, deleted) as NonNullable<ICloudSnapshot[K]>
  const topics = merge('topics')
  const decisions = merge('decisions')
  const discourseNotes = merge('discourseNotes')
  const latest = remote.updatedAt > local.updatedAt ? remote : local
  const sessionDraft = newerDraft(local, remote)
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: latest.settings,
    topics,
    decisions,
    activeTopicId: topics.some((item) => item.id === latest.activeTopicId) ? latest.activeTopicId : null,
    activeDecisionId: decisions.some((item) => item.id === latest.activeDecisionId) ? latest.activeDecisionId : null,
    aiMessages: merge('aiMessages'),
    sessionDraft: sessionDraft?.topicId && !topics.some((item) => item.id === sessionDraft.topicId)
      ? { ...sessionDraft, topicId: null }
      : sessionDraft,
    sessionLogs: merge('sessionLogs'),
    schedules: merge('schedules'),
    savedResources: merge('savedResources'),
    savedSearches: merge('savedSearches'),
    bibleReadingPlans: merge('bibleReadingPlans'),
    ministryNotes: merge('ministryNotes'),
    discourseNotes,
    activeDiscourseId: discourseNotes.some((item) => item.id === latest.activeDiscourseId) ? latest.activeDiscourseId : null,
    savedVideoTranscripts: merge('savedVideoTranscripts'),
    syncMetadata: { deleted, draftChangedAt },
  }
}
