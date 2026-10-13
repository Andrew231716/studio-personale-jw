import type { AppSettings } from '../../types'
import { useAppStore } from '../../store/useAppStore'
import {
  configureCloudKit,
  describeUser,
  fetchICloudSnapshot,
  isICloudConfigured,
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
    settings: s.settings,
    topics: s.topics,
    decisions: s.decisions,
    activeTopicId: s.activeTopicId,
    activeDecisionId: s.activeDecisionId,
    aiMessages: s.aiMessages,
    sessionDraft: s.sessionDraft,
    sessionLogs: s.sessionLogs,
    schedules: s.schedules,
  }
}

function applySnapshot(snapshot: ICloudSnapshot) {
  applyingRemote = true
  try {
    useAppStore.setState({
      settings: snapshot.settings,
      topics: snapshot.topics,
      decisions: snapshot.decisions,
      activeTopicId: snapshot.activeTopicId,
      activeDecisionId: snapshot.activeDecisionId,
      aiMessages: snapshot.aiMessages,
      sessionDraft: snapshot.sessionDraft,
      sessionLogs: snapshot.sessionLogs,
      schedules: snapshot.schedules,
    })
  } finally {
    queueMicrotask(() => {
      applyingRemote = false
    })
  }
}

async function pushNow(config: ICloudConfig) {
  if (!isICloudConfigured(config) || applyingRemote) return
  if (status === 'signed_out' || status === 'unconfigured') return
  setStatus('syncing')
  try {
    const snapshot = snapshotFromStore()
    await saveICloudSnapshot(config, snapshot)
    lastSyncedAt = snapshot.updatedAt
    setStatus('ready')
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'Sync iCloud non riuscita')
  }
}

function schedulePush(config: ICloudConfig) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void pushNow(config)
  }, 1600)
}

async function pullAndMerge(config: ICloudConfig, user: CloudKitUserIdentity) {
  setStatus('syncing')
  userLabel = describeUser(user)
  emit()
  try {
    const remote = await fetchICloudSnapshot(config)
    const local = snapshotFromStore()
    if (!remote) {
      await saveICloudSnapshot(config, local)
      lastSyncedAt = local.updatedAt
    } else {
      const merged = mergeSnapshots(local, remote)
      applySnapshot(merged)
      await saveICloudSnapshot(config, merged)
      lastSyncedAt = merged.updatedAt
    }
    setStatus('ready')
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'Lettura iCloud non riuscita')
  }
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
