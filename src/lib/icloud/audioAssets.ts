/**
 * Registrazioni Discorso come CloudKit Asset (record type DiscourseAudio).
 * Schema: localId, discourseId, createdAt, mimeType, durationMs, byteLength,
 * title, label, sectionId, syncedAt (STRING/INT64) + audio (ASSET).
 */

import {
  getDiscourseRecordingBlob,
  saveDiscourseRecordingFromRemote,
  updateDiscourseRecording,
  type DiscourseRecordingMeta,
} from '../discourseRecordings'
import { useAppStore } from '../../store/useAppStore'
import { configureCloudKit, isICloudConfigured } from './cloudkit'
import { getICloudSyncState, resolveICloudConfig } from './sync'
import {
  ICLOUD_AUDIO_RECORD_TYPE,
  type CloudKitAssetValue,
  type CloudKitRecord,
  type ICloudConfig,
} from './types'

function fieldString(record: CloudKitRecord, name: string): string {
  const raw = record.fields?.[name]?.value
  return typeof raw === 'string' ? raw : raw != null ? String(raw) : ''
}

function fieldNumber(record: CloudKitRecord, name: string): number | undefined {
  const raw = record.fields?.[name]?.value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function recordingICloudRecordName(id: string): string {
  return (
    String(id || '')
      .replace(/[^A-Za-z0-9._-]/g, '_')
      .slice(0, 220) || `drec_${Date.now()}`
  )
}

export function getICloudAudioConfig(): ICloudConfig | null {
  const config = resolveICloudConfig(useAppStore.getState().settings)
  if (!isICloudConfigured(config)) return null
  const sync = getICloudSyncState()
  if (sync.status === 'signed_out' || sync.status === 'unconfigured') return null
  return config
}

export function iCloudAudioAvailable(): boolean {
  return Boolean(getICloudAudioConfig())
}

function metaFromRecord(
  record: CloudKitRecord & { serverErrorCode?: string },
): DiscourseRecordingMeta | null {
  if (!record.recordName || record.deleted || record.serverErrorCode) return null
  const localId = fieldString(record, 'localId') || record.recordName
  const discourseId = fieldString(record, 'discourseId')
  if (!discourseId) return null
  return {
    id: localId,
    discourseId,
    createdAt: fieldString(record, 'createdAt') || new Date().toISOString(),
    mimeType: fieldString(record, 'mimeType') || 'audio/webm',
    durationMs: fieldNumber(record, 'durationMs'),
    byteLength: fieldNumber(record, 'byteLength'),
    title: fieldString(record, 'title') || undefined,
    label: fieldString(record, 'label') || undefined,
    sectionId: fieldString(record, 'sectionId') || undefined,
    iCloudRecordName: record.recordName,
    iCloudSyncedAt: fieldString(record, 'syncedAt') || new Date().toISOString(),
    iCloudRemoteOnly: true,
  }
}

function schemaError(reason: string): Error {
  if (/does not exist|unknown field|schema|record type/i.test(reason)) {
    return new Error(
      'Crea in CloudKit Dashboard il tipo «DiscourseAudio» con campo ASSET «audio» (ambiente Development), poi riprova.',
    )
  }
  if (/QUOTA|limit|storage|space|capacity/i.test(reason)) {
    return new Error(
      'Spazio iCloud insufficiente. Libera spazio sull’Apple ID o riduci i file audio.',
    )
  }
  return new Error(reason)
}

export async function listICloudDiscourseRecordings(
  discourseId: string,
): Promise<DiscourseRecordingMeta[]> {
  const config = getICloudAudioConfig()
  if (!config) throw new Error('Accedi a iCloud in Impostazioni per usare le registrazioni cloud.')
  const container = await configureCloudKit(config)
  const db = container.privateCloudDatabase
  if (!db.performQuery) {
    throw new Error('Questo browser/CloudKit non supporta le query. Usa Safari aggiornato.')
  }
  const response = await db.performQuery(
    {
      recordType: ICLOUD_AUDIO_RECORD_TYPE,
      filterBy: [
        {
          fieldName: 'discourseId',
          comparator: 'EQUALS',
          fieldValue: { value: discourseId },
        },
      ],
      sortBy: [{ fieldName: 'createdAt', ascending: false }],
    },
    { resultsLimit: 80 },
  )
  const err = response.records.find((r) => r.serverErrorCode)?.serverErrorCode
  const reason = response.records.find((r) => r.reason)?.reason || err || ''
  if (reason && /does not exist|unknown|schema|record type/i.test(reason)) {
    throw schemaError(reason)
  }
  return response.records
    .map(metaFromRecord)
    .filter((m): m is DiscourseRecordingMeta => Boolean(m))
}

export async function uploadDiscourseRecordingToICloud(
  meta: DiscourseRecordingMeta,
): Promise<DiscourseRecordingMeta> {
  const config = getICloudAudioConfig()
  if (!config) throw new Error('Accedi a iCloud in Impostazioni per caricare l’audio.')
  const blob = await getDiscourseRecordingBlob(meta.id)
  if (!blob?.size) throw new Error('Registrazione non trovata in locale.')
  if (blob.size > 180_000_000) {
    throw new Error('File troppo grande per iCloud da browser (max ~180 MB).')
  }

  const container = await configureCloudKit(config)
  const recordName = recordingICloudRecordName(meta.iCloudRecordName || meta.id)
  const syncedAt = new Date().toISOString()
  const ext = (meta.mimeType || blob.type || '').includes('mp4')
    ? 'm4a'
    : (meta.mimeType || blob.type || '').includes('mpeg')
      ? 'mp3'
      : 'webm'
  const file = new File([blob], `${recordName}.${ext}`, {
    type: blob.type || meta.mimeType || 'audio/webm',
  })

  const response = await container.privateCloudDatabase.saveRecords({
    recordName,
    recordType: ICLOUD_AUDIO_RECORD_TYPE,
    fields: {
      localId: { value: meta.id },
      discourseId: { value: meta.discourseId },
      createdAt: { value: meta.createdAt },
      mimeType: { value: meta.mimeType || file.type },
      durationMs: { value: meta.durationMs ?? 0 },
      byteLength: { value: blob.size },
      title: { value: meta.title || '' },
      label: { value: meta.label || '' },
      sectionId: { value: meta.sectionId || '' },
      syncedAt: { value: syncedAt },
      audio: { value: file },
    },
  })
  const record = response.records[0]
  if (!record || record.serverErrorCode) {
    throw schemaError(record?.reason || record?.serverErrorCode || 'Upload iCloud non riuscito')
  }
  const saved = await updateDiscourseRecording(meta.id, {
    iCloudRecordName: record.recordName || recordName,
    iCloudSyncedAt: syncedAt,
    iCloudRemoteOnly: false,
  })
  return saved || {
    ...meta,
    iCloudRecordName: record.recordName || recordName,
    iCloudSyncedAt: syncedAt,
    iCloudRemoteOnly: false,
  }
}

export async function downloadICloudDiscourseAudio(
  recordName: string,
): Promise<DiscourseRecordingMeta> {
  const config = getICloudAudioConfig()
  if (!config) throw new Error('Accedi a iCloud in Impostazioni per scaricare l’audio.')
  const container = await configureCloudKit(config)
  const response = await container.privateCloudDatabase.fetchRecords(recordName)
  const record = response.records[0]
  if (!record || record.deleted || record.serverErrorCode === 'NOT_FOUND') {
    throw new Error('Registrazione non trovata su iCloud.')
  }
  if (record.serverErrorCode) throw schemaError(record.reason || record.serverErrorCode)
  const meta = metaFromRecord(record)
  if (!meta) throw new Error('Metadati audio iCloud non validi.')
  const asset = record.fields?.audio?.value as CloudKitAssetValue | undefined
  if (!asset?.downloadURL) throw new Error('Asset audio assente su iCloud.')
  const res = await fetch(asset.downloadURL)
  if (!res.ok) throw new Error(`Download audio iCloud non riuscito (HTTP ${res.status}).`)
  const blob = await res.blob()
  const typed =
    blob.type && blob.type !== 'application/octet-stream'
      ? blob
      : new Blob([blob], { type: meta.mimeType || 'audio/webm' })
  return saveDiscourseRecordingFromRemote({
    ...meta,
    byteLength: typed.size,
    iCloudRemoteOnly: false,
    iCloudSyncedAt: new Date().toISOString(),
    blob: typed,
  })
}

export async function deleteICloudDiscourseRecording(recordName: string): Promise<void> {
  const config = getICloudAudioConfig()
  if (!config) return
  const container = await configureCloudKit(config)
  const db = container.privateCloudDatabase
  if (!db.deleteRecords) return
  const response = await db.deleteRecords(recordName, { force: true })
  const record = response.records[0]
  if (record?.serverErrorCode && record.serverErrorCode !== 'NOT_FOUND') {
    throw schemaError(record.reason || record.serverErrorCode)
  }
}

/** Unisce elenco locale + remoto; scarica solo su richiesta. */
export async function mergeLocalAndICloudRecordings(
  discourseId: string,
  local: DiscourseRecordingMeta[],
): Promise<DiscourseRecordingMeta[]> {
  if (!iCloudAudioAvailable()) return local
  try {
    const remote = await listICloudDiscourseRecordings(discourseId)
    const byId = new Map<string, DiscourseRecordingMeta>()
    for (const item of local) byId.set(item.id, item)
    for (const item of remote) {
      const existing = byId.get(item.id)
      if (!existing) {
        byId.set(item.id, item)
      } else if (!existing.iCloudRecordName && item.iCloudRecordName) {
        byId.set(item.id, {
          ...existing,
          iCloudRecordName: item.iCloudRecordName,
          iCloudSyncedAt: item.iCloudSyncedAt || existing.iCloudSyncedAt,
        })
      }
    }
    return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return local
  }
}

export async function syncDiscourseRecordingsToICloud(
  locals: DiscourseRecordingMeta[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: number; failed: number; message: string }> {
  const pending = locals.filter((r) => !r.iCloudSyncedAt && !r.iCloudRemoteOnly)
  let uploaded = 0
  let failed = 0
  let lastError = ''
  for (let i = 0; i < pending.length; i++) {
    onProgress?.(i + 1, pending.length)
    try {
      await uploadDiscourseRecordingToICloud(pending[i])
      uploaded++
    } catch (e) {
      failed++
      lastError = e instanceof Error ? e.message : 'Errore upload'
    }
  }
  return {
    uploaded,
    failed,
    message: pending.length
      ? failed
        ? `Caricate ${uploaded}/${pending.length}. ${lastError}`
        : `Caricate su iCloud: ${uploaded} registrazioni.`
      : 'Niente di nuovo da caricare: già su iCloud o solo cloud.',
  }
}
