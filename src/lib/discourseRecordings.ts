/** Registrazioni audio Discorso in IndexedDB (i blob non entrano in localStorage). */

import { uid } from './id'
import type { TranscriptProgress, TranscriptSegment } from './discourseTranscribe'

const DB_NAME = 'jw-studio-discourse-recordings'
const DB_VERSION = 2
const STORE = 'recordings'

export interface DiscourseRecordingMeta {
  id: string
  discourseId: string
  createdAt: string
  durationMs?: number
  mimeType: string
  sectionId?: string
  title?: string
  label?: string
  byteLength?: number
  /** Trascrizione salvata (se già eseguita). */
  transcript?: string
  segments?: TranscriptSegment[]
  progress?: TranscriptProgress
  summary?: string
  translation?: string
  fileName?: string
  /** Record name CloudKit (DiscourseAudio). */
  iCloudRecordName?: string
  iCloudSyncedAt?: string
  /** Presente su iCloud ma blob non ancora scaricato in locale. */
  iCloudRemoteOnly?: boolean
}

interface RecordingRow extends DiscourseRecordingMeta {
  blob?: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('discourseId', 'discourseId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Apertura IndexedDB fallita'))
  })
}

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || ''
}

export function mediaRecorderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

async function putRow(row: RecordingRow): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

function metaOf(row: RecordingRow): DiscourseRecordingMeta {
  const { blob: _b, ...meta } = row
  return {
    ...meta,
    iCloudRemoteOnly: Boolean(meta.iCloudRemoteOnly) || !row.blob || row.blob.size === 0,
  }
}

export async function saveDiscourseRecording(params: {
  discourseId: string
  blob: Blob
  durationMs?: number
  sectionId?: string
  title?: string
  label?: string
  fileName?: string
}): Promise<DiscourseRecordingMeta> {
  const id = uid('drec')
  const meta: DiscourseRecordingMeta = {
    id,
    discourseId: params.discourseId,
    createdAt: new Date().toISOString(),
    durationMs: params.durationMs,
    mimeType: params.blob.type || 'audio/webm',
    label: params.label,
    sectionId: params.sectionId,
    title: params.title,
    fileName: params.fileName,
    byteLength: params.blob.size,
    iCloudRemoteOnly: false,
  }
  await putRow({ ...meta, blob: params.blob })
  return meta
}

/** Salva/aggiorna una registrazione scaricata da iCloud. */
export async function saveDiscourseRecordingFromRemote(
  params: DiscourseRecordingMeta & { blob: Blob },
): Promise<DiscourseRecordingMeta> {
  const meta: DiscourseRecordingMeta = {
    ...params,
    byteLength: params.blob.size,
    mimeType: params.mimeType || params.blob.type || 'audio/webm',
    iCloudRemoteOnly: false,
  }
  const { blob, ...rest } = { ...meta, blob: params.blob }
  await putRow({ ...rest, blob })
  return meta
}

export async function listDiscourseRecordings(
  discourseId: string,
): Promise<DiscourseRecordingMeta[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('discourseId')
      const req = idx.getAll(discourseId)
      req.onsuccess = () => {
        const rows = (req.result || []) as RecordingRow[]
        resolve(
          rows
            .map((row) => metaOf(row))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        )
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return []
  }
}

export async function getDiscourseRecordingBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const row = req.result as RecordingRow | undefined
        resolve(row?.blob && row.blob.size > 0 ? row.blob : null)
      }
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

export async function deleteDiscourseRecording(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

type RecordingPatch = Partial<
  Pick<
    DiscourseRecordingMeta,
    | 'transcript'
    | 'sectionId'
    | 'segments'
    | 'summary'
    | 'translation'
    | 'progress'
    | 'iCloudRecordName'
    | 'iCloudSyncedAt'
    | 'iCloudRemoteOnly'
    | 'title'
    | 'label'
  >
>

export async function updateDiscourseRecording(
  id: string,
  patch: RecordingPatch,
): Promise<DiscourseRecordingMeta | null> {
  const db = await openDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.get(id)
    let saved: DiscourseRecordingMeta | null = null
    req.onsuccess = () => {
      const row = req.result as RecordingRow | undefined
      if (!row) {
        resolve(null)
        return
      }
      const next: RecordingRow = { ...row, ...patch }
      store.put(next)
      saved = metaOf(next)
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error)
    }
    tx.oncomplete = () => {
      db.close()
      resolve(saved)
    }
  })
}

export function formatRecordingDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}
