/** Sync snapshot JW Studio. La chiave viaggia esclusivamente nell’header Authorization. */
import { createHash, timingSafeEqual } from 'node:crypto'

const TABLE = 'jw_studio_snapshots'
const REVISION = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/

function parseKey(header) {
  const match = /^Bearer JWS-([a-f0-9]{12})-([a-f0-9]{24,64})$/i.exec(header || '')
  if (!match) return null
  return {
    cloudId: match[1].toLowerCase(),
    secretHash: createHash('sha256').update(match[2].toLowerCase()).digest('hex'),
  }
}

function isAuthorized(row, key) {
  const stored = Buffer.from(row.secret_hash || '', 'hex')
  const supplied = Buffer.from(key.secretHash, 'hex')
  return stored.length === supplied.length && timingSafeEqual(stored, supplied)
}

async function supabaseFetch(path, { method = 'GET', body } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Sync cloud non configurata sul server')
  const response = await fetch(`${url.trim().replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: serviceKey.trim(),
      Authorization: `Bearer ${serviceKey.trim()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 409) return []
  if (!response.ok) throw new Error('Archivio cloud momentaneamente non disponibile')
  return response.json()
}

function validSnapshot(snapshot) {
  return snapshot?.version === 1 && snapshot.settings && typeof snapshot.settings === 'object' &&
    ['topics', 'decisions', 'aiMessages', 'sessionLogs', 'schedules'].every((key) => Array.isArray(snapshot[key]))
}

function stripPrivateSettings(snapshot) {
  const { cloudSync: _cloudSync, iCloud: _iCloud, openAi: _openAi, ai, ...settings } = snapshot.settings
  return {
    ...snapshot,
    settings: { ...settings, ai: ai ? { provider: ai.provider, geminiModel: ai.geminiModel } : undefined },
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, PUT, OPTIONS')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const key = parseKey(req.headers.authorization)
  if (!key) {
    res.status(400).json({ error: 'Chiave sync non valida. Ricarica l’app se stai usando una versione precedente.' })
    return
  }

  try {
    const path = `${TABLE}?cloud_id=eq.${key.cloudId}`
    if (req.method === 'GET') {
      const [row] = await supabaseFetch(`${path}&select=payload,updated_at,secret_hash`)
      if (!row) return res.status(404).json({ error: 'Nessun dato cloud per questa chiave' })
      if (!isAuthorized(row, key)) return res.status(403).json({ error: 'Chiave sync non autorizzata' })
      if (!validSnapshot(row.payload)) return res.status(422).json({ error: 'Formato dei dati cloud non riconosciuto' })
      return res.status(200).json({ snapshot: stripPrivateSettings(row.payload), updatedAt: row.updated_at })
    }

    const { snapshot, revision } = req.body || {}
    if (!validSnapshot(snapshot) || (revision !== null && !REVISION.test(revision || ''))) {
      return res.status(400).json({ error: 'Dati o versione di sincronizzazione mancanti' })
    }
    const [row] = await supabaseFetch(`${path}&select=secret_hash,updated_at`)
    if (row && !isAuthorized(row, key)) return res.status(403).json({ error: 'Chiave sync non autorizzata' })
    if ((row?.updated_at ?? null) !== revision) {
      return res.status(409).json({ error: 'I dati cloud sono cambiati' })
    }

    const updatedAt = new Date(Math.max(Date.now(), revision ? Date.parse(revision) + 1 : 0)).toISOString()
    const payload = { payload: stripPrivateSettings(snapshot), updated_at: updatedAt }
    const [saved] = row
      ? await supabaseFetch(`${path}&updated_at=eq.${encodeURIComponent(revision)}&secret_hash=eq.${key.secretHash}`, {
          method: 'PATCH',
          body: payload,
        })
      : await supabaseFetch(TABLE, {
          method: 'POST',
          body: { ...payload, cloud_id: key.cloudId, secret_hash: key.secretHash },
        })
    if (!saved) return res.status(409).json({ error: 'I dati cloud sono cambiati' })
    return res.status(200).json({ ok: true, updatedAt: saved.updated_at })
  } catch (error) {
    const message = error?.name === 'TimeoutError' ? 'Archivio cloud non raggiungibile in tempo' : 'Archivio cloud non disponibile'
    return res.status(502).json({ error: message })
  }
}
