import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../api/sync.js'

const testKey = 'JWS-0123456789ab-0123456789abcdef01234567'
const auth = { authorization: `Bearer ${testKey}` }

function request(method, body, headers = auth) {
  const result = { headers: {} }
  const response = {
    setHeader(name, value) { result.headers[name] = value },
    status(code) { result.status = code; return this },
    json(data) { result.data = JSON.parse(JSON.stringify(data)) },
    end() {},
  }
  return handler({ method, body, headers, query: { key: testKey } }, response).then(() => result)
}

test('l’API mantiene le credenziali fuori dallo snapshot e rifiuta aggiornamenti concorrenti obsoleti', async (t) => {
  const previousUrl = process.env.SUPABASE_URL
  const previousKey = process.env.SUPABASE_SERVICE_ROLE
  process.env.SUPABASE_URL = 'https://database.invalid'
  process.env.SUPABASE_SERVICE_ROLE = 'test-only'
  t.after(() => {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previousUrl
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE
    else process.env.SUPABASE_SERVICE_ROLE = previousKey
  })

  let row
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url)
    if (options.method === 'POST') {
      if (row) return Response.json({}, { status: 409 })
      row = JSON.parse(options.body)
    }
    if (options.method === 'PATCH') {
      if (path.searchParams.get('updated_at') !== `eq.${row.updated_at}`) return Response.json([])
      row = { ...row, ...JSON.parse(options.body) }
    }
    return Response.json(row ? [row] : [])
  })
  const snapshot = {
    version: 1,
    settings: {
      cloudSync: { syncKey: testKey },
      iCloud: { apiToken: 'demo-icloud' },
      ai: { provider: 'gemini', geminiApiKey: 'demo-ai' },
    },
    topics: [], decisions: [], aiMessages: [], sessionLogs: [], schedules: [],
  }

  assert.equal((await request('GET', undefined, {})).status, 400)
  assert.equal((await request('GET')).status, 404)
  assert.equal((await request('PUT', { snapshot, revision: null })).status, 200)
  const loaded = await request('GET')
  assert.equal(loaded.headers['Cache-Control'], 'private, no-store')
  assert.deepEqual(loaded.data.snapshot.settings, { ai: { provider: 'gemini' } })
  const { updatedAt: revision } = loaded.data
  const updates = await Promise.all([
    request('PUT', { snapshot: { ...snapshot, topics: [{ id: 'a' }] }, revision }),
    request('PUT', { snapshot: { ...snapshot, topics: [{ id: 'b' }] }, revision }),
  ])
  assert.deepEqual(updates.map((result) => result.status).sort(), [200, 409])
  assert.equal((await request('GET', undefined, {
    authorization: 'Bearer JWS-0123456789ab-000000000000000000000000',
  })).status, 403)
})
