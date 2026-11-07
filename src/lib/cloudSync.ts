import { repairBiblePlanTitle } from './biblePlanTitle'
import type { AppSettings } from '../types'
import {
  mergeAppSettings,
  normalizeDecisionTerms,
  normalizeTopicTerms,
  useAppStore,
} from '../store/useAppStore'
import { mergeSnapshots, SYNC_COLLECTIONS } from './icloud/merge'
import { readApiJson } from './apiJson'
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

function snapshotFromStore(): ICloudSnapshot {
  const s = useAppStore.getState()
  // Non sincronizzare le chiavi AI sul cloud (restano solo sul dispositivo).
  const settings: AppSettings = {
    ...s.settings,
    cloudSync: undefined,
    iCloud: undefined,
    ai: {
      provider: s.settings.ai?.provider || 'free',
      geminiApiKey: '',
      geminiModel: s.settings.ai?.geminiModel || 'gemini-3.1-flash-lite',
    },
    openAi: undefined,
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings,
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
        ...mergeAppSettings(cur.settings, snapshot.settings),
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
    applyingRemote = false
  }
}

function currentKey(): string | undefined {
  const cfg = useAppStore.getState().settings.cloudSync
  return cfg?.enabled && cfg.consent && isValidSyncKey(cfg.syncKey) ? cfg.syncKey : undefined
}

function syncRequest(key: string, options?: { snapshot: ICloudSnapshot; revision: string | null }) {
  return fetch('/api/sync', {
    method: options ? 'PUT' : 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${key}`,
      ...(options ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options ? JSON.stringify(options) : undefined,
  })
}

async function pull(key: string) {
  const res = await syncRequest(key)
  if (res.status === 404) return null
  return readApiJson<{ snapshot: ICloudSnapshot; updatedAt: string }>(res, 'Lettura cloud non riuscita')
}

let pending: Promise<void> = Promise.resolve()

function sync(key: string): Promise<void> {
  const task = pending.then(async () => {
    if (key !== currentKey()) return
    setStatus('syncing')
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await pull(key)
      if (key !== currentKey()) return
      const local = snapshotFromStore()
      const merged = remote ? mergeSnapshots(local, remote.snapshot) : local
      if (remote) applySnapshot(merged)
      // Usa le impostazioni sanificate del dispositivo dopo l’eventuale unione.
      const snapshot = remote ? snapshotFromStore() : merged
      const res = await syncRequest(key, { snapshot, revision: remote?.updatedAt ?? null })
      if (key !== currentKey()) return
      if (res.status === 409) continue
      const result = await readApiJson<{ updatedAt: string }>(res, 'Invio cloud non riuscito')
      lastSyncedAt = result.updatedAt
      setStatus('ready')
      return
    }
    throw new Error('I dati sono cambiati su un altro dispositivo. Tocca Sincronizza per riprovare.')
  }).catch((error: unknown) => {
    if (key !== currentKey()) return
    setStatus(
      typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
      error instanceof Error ? error.message : 'Sync non riuscita',
    )
    throw error
  })
  pending = task.catch(() => {})
  return task
}

function syncInBackground() {
  const key = currentKey()
  if (key) void sync(key).catch(() => {})
}

/** Ascolta i salvataggi locali dopo l’avvio, anche se il cloud è ancora disattivato. */
export function startCloudSync(): void {
  if (started) return
  started = true
  useAppStore.subscribe((state, previous) => {
    if (applyingRemote) return
    const key = currentKey()
    if (!key) {
      if (pushTimer) clearTimeout(pushTimer)
      if (status !== 'idle') setStatus('idle')
      return
    }
    if (
      state.settings === previous.settings &&
      state.sessionDraft === previous.sessionDraft &&
      !SYNC_COLLECTIONS.some((name) => state[name] !== previous[name])
    ) return
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(syncInBackground, 1400)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncInBackground()
  })
  window.addEventListener('online', syncInBackground)
  syncInBackground()
}

export async function syncCloudNow(): Promise<void> {
  const key = currentKey()
  if (!key) return
  if (pushTimer) clearTimeout(pushTimer)
  await sync(key)
}

export async function enableCloudSync(): Promise<void> {
  const saved = useAppStore.getState().settings.cloudSync?.syncKey || ''
  const key = isValidSyncKey(saved) ? saved : generateSyncKey()
  useAppStore.getState().updateSettings({ cloudSync: { enabled: true, consent: true, syncKey: key } })
  await syncCloudNow()
}

/** Verifica la chiave di un altro dispositivo prima di collegare i dati locali. */
export async function adoptSyncKey(rawKey: string): Promise<void> {
  const key = String(rawKey || '').trim()
  if (!isValidSyncKey(key)) throw new Error('Chiave non valida. Formato: JWS-xxxxxxxxxxxx-…')
  if (!(await pull(key))) throw new Error('Nessun dato cloud per questa chiave. Sincronizza prima l’altro dispositivo.')
  useAppStore.getState().updateSettings({ cloudSync: { enabled: true, consent: true, syncKey: key } })
  await syncCloudNow()
}
