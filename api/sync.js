/**
 * Sync snapshot JW Studio su Supabase (solo service role lato server).
 * GET  /api/sync?key=JWS-...
 * PUT  /api/sync  body: { key, snapshot }
 */

function parseKey(raw) {
  const key = String(raw || '').trim()
  const m = /^JWS-([a-f0-9]{12})-([a-f0-9]{24,64})$/i.exec(key)
  if (!m) return null
  return { cloudId: m[1].toLowerCase(), cloudSecret: m[2].toLowerCase() }
}

async function sha256Hex(text) {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(text)
    const hash = await crypto.subtle.digest('SHA-256', data)
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(text).digest('hex')
}

function env(name) {
  return String(process.env[name] || '').trim()
}

function supabaseConfig() {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE') || env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE non configurati sul server')
  }
  return { url: url.replace(/\/$/, ''), serviceKey }
}

async function supabaseFetch(path, { method = 'GET', body } = {}) {
  const { url, serviceKey } = supabaseConfig()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=representation' : 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const msg = typeof data === 'object' && data?.message ? data.message : text || res.statusText
    throw new Error(msg)
  }
  return data
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  try {
    if (req.method === 'GET') {
      const parsed = parseKey(req.query.key)
      if (!parsed) {
        res.status(400).json({ error: 'Chiave sync non valida' })
        return
      }
      const secretHash = await sha256Hex(parsed.cloudSecret)
      const rows = await supabaseFetch(
        `jw_studio_snapshots?cloud_id=eq.${encodeURIComponent(parsed.cloudId)}&select=payload,updated_at,secret_hash`,
      )
      const row = Array.isArray(rows) ? rows[0] : null
      if (!row) {
        res.status(404).json({ error: 'Nessun dato cloud per questa chiave' })
        return
      }
      if (row.secret_hash !== secretHash) {
        res.status(403).json({ error: 'Chiave sync non autorizzata' })
        return
      }
      res.status(200).json({
        snapshot: row.payload,
        updatedAt: row.updated_at,
      })
      return
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      const parsed = parseKey(body.key)
      if (!parsed) {
        res.status(400).json({ error: 'Chiave sync non valida' })
        return
      }
      if (!body.snapshot || typeof body.snapshot !== 'object') {
        res.status(400).json({ error: 'Snapshot mancante' })
        return
      }
      const secretHash = await sha256Hex(parsed.cloudSecret)
      const existing = await supabaseFetch(
        `jw_studio_snapshots?cloud_id=eq.${encodeURIComponent(parsed.cloudId)}&select=secret_hash`,
      )
      const row = Array.isArray(existing) ? existing[0] : null
      if (row && row.secret_hash !== secretHash) {
        res.status(403).json({ error: 'Chiave sync non autorizzata' })
        return
      }

      const updatedAt = new Date().toISOString()
      await supabaseFetch('jw_studio_snapshots', {
        method: 'POST',
        body: [
          {
            cloud_id: parsed.cloudId,
            secret_hash: secretHash,
            payload: body.snapshot,
            updated_at: updatedAt,
          },
        ],
      })
      res.status(200).json({ ok: true, updatedAt })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    res.status(502).json({ error: String(error?.message || error) })
  }
}
