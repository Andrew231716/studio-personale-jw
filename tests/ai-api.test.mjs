import assert from 'node:assert/strict'
import test from 'node:test'
import { chatCompletion } from '../api/llmChat.js'

const messages = [{ role: 'user', content: 'Proponi una lettura su Timoteo.' }]

test('il limite del motore condiviso è riportato come errore recuperabile', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async () =>
    new Response('Free limit reached: 1 reply every 45 seconds per IP.', { status: 402 }),
  )
  const result = await chatCompletion({ messages })
  assert.equal(result.status, 429)
  assert.match(result.text, /limite condiviso|Limite del motore/)
  assert.equal(upstream.mock.callCount(), 1)
})

test('una pagina HTML del motore non viene presentata come risposta AI', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response('<html>Pagina del fornitore</html>', { headers: { 'content-type': 'text/html' } }),
  )
  assert.equal((await chatCompletion({ messages })).ok, false)
})

test('Gemini migra un modello ritirato e usa la chiave solo nell’header', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /\/gemini-3\.1-flash-lite:generateContent$/)
    assert.equal(options.headers['x-goog-api-key'], 'test-key')
    assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig.thinkingLevel, 'minimal')
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'Internal' }, { text: 'Leggi 1 Timoteo 4:12.' },
    ] } }] })
  })
  const result = await chatCompletion({ messages, model: 'gemini-2.0-flash-lite', geminiApiKey: 'test-key' })
  assert.equal(result.text, 'Leggi 1 Timoteo 4:12.')
  assert.equal(result.engine, 'gemini')
})

test('una chiave Gemini rifiutata non invia il materiale a un secondo fornitore', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', async () =>
    new Response('Forbidden', { status: 403 }),
  )
  const result = await chatCompletion({ messages, provider: 'gemini', geminiApiKey: 'test-key' })
  assert.equal(result.status, 403)
  assert.match(result.text, /Gemini ha rifiutato la chiave/)
  assert.equal(upstream.mock.callCount(), 1)
})
