import { repairBiblePlanTitle } from '../biblePlanTitle'
import type { AppSettings } from '../../types'
import {
  mergeAppSettings,
  normalizeDecisionTerms,
  normalizeTopicTerms,
  useAppStore,
} from '../../store/useAppStore'
import {
  configureCloudKit,
  describeUser,
  fetchICloudSnapshot,
  isICloudConfigured,
  ICloudConflictError,
  saveICloudSnapshot,
  setupICloudAuth,
} from './cloudkit'
import { mergeSnapshots } from './merge'
import type { CloudKitUserIdentity, ICloudConfig, ICloudSnapshot, ICloudSyncStatus } from './types'

type Listener = () => void

let status: ICloudSyncStatus = 'unconfigured'
let lastSyncedAt: string | null = null
let lastError: string | null = null
let userLabel = ''
let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false
let applyingRemote = false
let authHooksBound = false
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

function setStatus(next: ICloudSyncStatus, error: string | null = null) {
  status = next
  lastError = error
  emit()
}

export function getICloudSyncState() {
  return { status, lastSyncedAt, lastError, userLabel }
}

export function subscribeICloudSync(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resolveICloudConfig(settings: AppSettings): ICloudConfig {
  const fromSettings = settings.iCloud
  return {
    enabled: fromSettings?.enabled ?? true,
    containerId:
      fromSettings?.containerId?.trim() ||
      String(import.meta.env.VITE_CLOUDKIT_CONTAINER_ID || '').trim(),
    apiToken:
      fromSettings?.apiToken?.trim() ||
      String(import.meta.env.VITE_CLOUDKIT_API_TOKEN || '').trim(),
    environment:
      fromSettings?.environment ||
      (import.meta.env.VITE_CLOUDKIT_ENVIRONMENT === 'production'
        ? 'production'
        : 'development'),
  }
}

function snapshotFromStore(): ICloudSnapshot {
  const s = useAppStore.getState()
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: {
      ...s.settings,
      cloudSync: undefined,
      iCloud: undefined,
      openAi: undefined,
      ai: { provider: s.settings.ai?.provider, geminiModel: s.settings.ai?.geminiModel },
    },
    syncMetadata: s.syncMetadata,
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
  }
}

function applySnapshot(snapshot: ICloudSnapshot) {
  applyingRemote = true
  try {
    const cur = useAppStore.getState()
    useAppStore.setState({
      settings: {
        ...mergeAppSettings(cur.settings, { ...snapshot.settings, openAi: undefined, ai: {
          provider: snapshot.settings.ai?.provider,
          geminiModel: snapshot.settings.ai?.geminiModel,
        } }),
        cloudSync: cur.settings.cloudSync,
        iCloud: cur.settings.iCloud,
      },
      syncMetadata: snapshot.syncMetadata,
      topics: (snapshot.topics || []).map(normalizeTopicTerms),
      decisions: (snapshot.decisions || []).map(normalizeDecisionTerms),
      activeTopicId: snapshot.activeTopicId,
      activeDecisionId: snapshot.activeDecisionId,
      aiMessages: snapshot.aiMessages,
      sessionDraft: snapshot.sessionDraft,
      sessionLogs: snapshot.sessionLogs,
      schedules: snapshot.schedules,
      savedResources: snapshot.savedResources || [],
      savedSearches: snapshot.savedSearches || [],
      bibleReadingPlans: (snapshot.bibleReadingPlans || []).map(repairBiblePlanTitle),
      ministryNotes: snapshot.ministryNotes || [],
      discourseNotes: snapshot.discourseNotes || [],
      activeDiscourseId: snapshot.activeDiscourseId ?? null,
      savedVideoTranscripts: snapshot.savedVideoTranscripts || [],
    })
  } finally {
    queueMicrotask(() => {
      applyingRemote = false
    })
  }
}

let pending: Promise<void> = Promise.resolve()

function sync(config: ICloudConfig): Promise<void> {
  const current = () => {
    const active = resolveICloudConfig(useAppStore.getState().settings)
    return status !== 'signed_out' && isICloudConfigured(active) &&
      active.containerId === config.containerId && active.apiToken === config.apiToken &&
      active.environment === config.environment
  }
  pending = pending.then(async () => {
    if (!current()) return
    setStatus('syncing')
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await fetchICloudSnapshot(config)
      if (!current()) return
      if (remote) applySnapshot(mergeSnapshots(snapshotFromStore(), remote))
      const snapshot = snapshotFromStore()
      try {
        await saveICloudSnapshot(config, snapshot)
      } catch (error) {
        if (error instanceof ICloudConflictError && attempt < 2) continue
        throw error
      }
      if (!current()) return
      lastSyncedAt = snapshot.updatedAt
      setStatus('ready')
      return
    }
  }).catch((error: unknown) => {
    if (current()) setStatus('error', error instanceof Error ? error.message : 'Sync iCloud non riuscita')
  })
  return pending
}

function schedulePush(config: ICloudConfig) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => { void sync(config) }, 1600)
}

function pullAndMerge(config: ICloudConfig, user: CloudKitUserIdentity) {
  userLabel = describeUser(user)
  setStatus('ready')
  return sync(config)
}

function bindAuthHooks(config: ICloudConfig) {
  if (authHooksBound) return
  authHooksBound = true
  void configureCloudKit(config).then((ck) => {
    void ck.whenUserSignsIn().then((signedIn) => {
      void pullAndMerge(resolveICloudConfig(useAppStore.getState().settings), signedIn)
    })
    void ck.whenUserSignsOut().then(() => {
      userLabel = ''
      setStatus('signed_out')
    })
  })
}

export async function startICloudSync(): Promise<void> {
  const config = resolveICloudConfig(useAppStore.getState().settings)
  if (!isICloudConfigured(config)) {
    setStatus('unconfigured')
    userLabel = ''
    emit()
    return
  }

  try {
    bindAuthHooks(config)
    const user = await setupICloudAuth(config)

    if (!user) {
      setStatus('signed_out')
      return
    }

    await pullAndMerge(config, user)

    if (!started) {
      started = true
      useAppStore.subscribe(() => {
        if (applyingRemote) return
        const next = resolveICloudConfig(useAppStore.getState().settings)
        if (!isICloudConfigured(next)) return
        if (status === 'signed_out' || status === 'unconfigured') return
        schedulePush(next)
      })

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        const next = resolveICloudConfig(useAppStore.getState().settings)
        if (!isICloudConfigured(next)) return
        if (status === 'signed_out' || status === 'unconfigured') return
        void setupICloudAuth(next).then((u) => {
          if (u) void pullAndMerge(next, u)
        })
      })
    }
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'iCloud non disponibile')
  }
}

export async function syncICloudNow(): Promise<void> {
  const config = resolveICloudConfig(useAppStore.getState().settings)
  if (!isICloudConfigured(config)) {
    setStatus('unconfigured')
    return
  }
  bindAuthHooks(config)
  const user = await setupICloudAuth(config)
  if (!user) {
    setStatus('signed_out')
    return
  }
  await pullAndMerge(config, user)
}
