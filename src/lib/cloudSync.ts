import type { AppSettings } from '../types'
import { useAppStore } from '../store/useAppStore'
import { mergeSnapshots } from './icloud/merge'
import type { ICloudSnapshot } from './icloud/types'

export type CloudSyncStatus = 'idle' | 'syncing' | 'ready' | 'error' | 'offline'

type Listener = () => void

let status: CloudSyncStatus = 'idle'
let lastSyncedAt: string | null = null
let lastError: string | null = null
let pushTimer: ReturnType<typeof setTimeout> | null = null
let started = false
let applyingRemote = false
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

function setStatus(next: CloudSyncStatus, error: string | null = null) {
  status = next
  lastError = error
  emit()
}

export function getCloudSyncState() {
  return { status, lastSyncedAt, lastError }
}

export function subscribeCloudSync(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Chiave leggibile da copiare su un altro dispositivo. */
export function generateSyncKey(): string {
  const cloudId = randomHex(6)
  const cloudSecret = randomHex(12)
  return `JWS-${cloudId}-${cloudSecret}`
}

export function isValidSyncKey(key: string): boolean {
  return /^JWS-[a-f0-9]{12}-[a-f0-9]{24,64}$/i.test(String(key || '').trim())
}

function ensureCloudSyncSettings(settings: AppSettings): NonNullable<AppSettings['cloudSync']> {
  const current = settings.cloudSync
  if (current?.syncKey && isValidSyncKey(current.syncKey)) {
    return {
      enabled: current.enabled !== false,
      syncKey: current.syncKey,
    }
  }
  return {
    enabled: true,
    syncKey: generateSyncKey(),
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
    savedResources: s.savedResources,
    savedSearches: s.savedSearches,
    bibleReadingPlans: s.bibleReadingPlans,
    ministryNotes: s.ministryNotes,
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
      savedResources: snapshot.savedResources || [],
      savedSearches: snapshot.savedSearches || [],
      bibleReadingPlans: snapshot.bibleReadingPlans || [],
      ministryNotes: snapshot.ministryNotes || [],
    })
  } finally {
    queueMicrotask(() => {
      applyingRemote = false
    })
  }
}

async function pull(key: string): Promise<ICloudSnapshot | null> {
  const res = await fetch(`/api/sync?key=${encodeURIComponent(key)}`)
  if (res.status === 404) return null
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data.snapshot as ICloudSnapshot
}

async function push(key: string, snapshot: ICloudSnapshot): Promise<string> {
  const res = await fetch('/api/sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, snapshot }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return String(data.updatedAt || snapshot.updatedAt)
}

async function pullAndMerge(key: string) {
  setStatus('syncing')
  try {
    const remote = await pull(key)
    const local = snapshotFromStore()
    if (!remote) {
      lastSyncedAt = await push(key, local)
    } else {
      const merged = mergeSnapshots(local, remote)
      // Evita di riscrivere la chiave sync locale con una vuota dal remoto
      const localKey = useAppStore.getState().settings.cloudSync?.syncKey
      if (localKey && merged.settings.cloudSync) {
        merged.settings = {
          ...merged.settings,
          cloudSync: { ...merged.settings.cloudSync, syncKey: localKey, enabled: true },
        }
      }
      applySnapshot(merged)
      lastSyncedAt = await push(key, merged)
    }
    setStatus('ready')
  } catch (e) {
    setStatus(
      typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
      e instanceof Error ? e.message : 'Sync non riuscita',
    )
  }
}

async function pushNow(key: string) {
  if (applyingRemote) return
  setStatus('syncing')
  try {
    lastSyncedAt = await push(key, snapshotFromStore())
    setStatus('ready')
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'Invio cloud non riuscito')
  }
}

function schedulePush(key: string) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void pushNow(key)
  }, 1400)
}

/** Avvia sync automatica: crea la chiave se manca. */
export async function startCloudSync(): Promise<void> {
  const state = useAppStore.getState()
  const cloudSync = ensureCloudSyncSettings(state.settings)!
  if (!state.settings.cloudSync?.syncKey || state.settings.cloudSync.syncKey !== cloudSync.syncKey) {
    useAppStore.getState().updateSettings({ cloudSync })
  }
  if (cloudSync.enabled === false) {
    setStatus('idle')
    return
  }

  const key = cloudSync.syncKey
  await pullAndMerge(key)

  if (!started) {
    started = true
    useAppStore.subscribe(() => {
      if (applyingRemote) return
      const cfg = useAppStore.getState().settings.cloudSync
      if (!cfg?.enabled || !cfg.syncKey) return
      schedulePush(cfg.syncKey)
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const cfg = useAppStore.getState().settings.cloudSync
      if (!cfg?.enabled || !cfg.syncKey) return
      void pullAndMerge(cfg.syncKey)
    })
  }
}

export async function syncCloudNow(): Promise<void> {
  const cfg = ensureCloudSyncSettings(useAppStore.getState().settings)!
  useAppStore.getState().updateSettings({ cloudSync: cfg })
  if (cfg.enabled === false) return
  await pullAndMerge(cfg.syncKey)
}

/** Collega questo dispositivo a una chiave già usata su un altro. */
export async function adoptSyncKey(rawKey: string): Promise<void> {
  const key = String(rawKey || '').trim()
  if (!isValidSyncKey(key)) throw new Error('Chiave non valida. Formato: JWS-xxxxxxxxxxxx-…')
  useAppStore.getState().updateSettings({
    cloudSync: { enabled: true, syncKey: key },
  })
  await pullAndMerge(key)
}
