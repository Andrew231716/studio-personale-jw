import type { ICloudSnapshot } from './types'

function itemTime(
  item: { updatedAt?: string; createdAt?: string; completedAt?: string; savedAt?: string },
  timeKey: 'updatedAt' | 'createdAt' | 'completedAt',
): string {
  if (timeKey === 'updatedAt') return item.updatedAt || item.createdAt || item.savedAt || ''
  if (timeKey === 'completedAt') return item.completedAt || item.createdAt || ''
  return item.createdAt || item.savedAt || ''
}

function byIdNewer<T extends { id: string; updatedAt?: string; createdAt?: string; completedAt?: string }>(
  local: T[],
  remote: T[],
  timeKey: 'updatedAt' | 'createdAt' | 'completedAt' = 'updatedAt',
): T[] {
  const map = new Map<string, T>()
  for (const item of [...remote, ...local]) {
    const prev = map.get(item.id)
    if (!prev) {
      map.set(item.id, item)
      continue
    }
    const prevTime = itemTime(prev, timeKey)
    const nextTime = itemTime(item, timeKey)
    map.set(item.id, nextTime >= prevTime ? item : prev)
  }
  return [...map.values()]
}

/** Unisce locale e remoto: per le collezioni tiene il record più recente per id. */
export function mergeSnapshots(local: ICloudSnapshot, remote: ICloudSnapshot): ICloudSnapshot {
  const newerSettings = remote.updatedAt >= local.updatedAt ? remote.settings : local.settings
  const newerDraft =
    (remote.sessionDraft?.startedAt || '') >= (local.sessionDraft?.startedAt || '')
      ? remote.sessionDraft
      : local.sessionDraft

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: newerSettings,
    topics: byIdNewer(local.topics, remote.topics, 'updatedAt'),
    decisions: byIdNewer(local.decisions, remote.decisions, 'updatedAt'),
    activeTopicId: remote.updatedAt >= local.updatedAt ? remote.activeTopicId : local.activeTopicId,
    activeDecisionId:
      remote.updatedAt >= local.updatedAt ? remote.activeDecisionId : local.activeDecisionId,
    aiMessages: byIdNewer(local.aiMessages, remote.aiMessages, 'createdAt'),
    sessionDraft: newerDraft,
    sessionLogs: byIdNewer(local.sessionLogs, remote.sessionLogs, 'completedAt'),
    schedules: byIdNewer(local.schedules, remote.schedules, 'createdAt'),
    savedResources: byIdNewer(
      local.savedResources || [],
      remote.savedResources || [],
      'createdAt',
    ),
    savedSearches: byIdNewer(
      local.savedSearches || [],
      remote.savedSearches || [],
      'createdAt',
    ),
  }
}
