/**
 * Chat Completions: OpenAI ufficiale (se c’è chiave) oppure fallback Pollinations.
 * Usato da /api/ai e /api/export-revise.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const POLLINATIONS_URL = 'https://text.pollinations.ai/'

const ALLOWED_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o4-mini',
])

export function resolveOpenAiKey(req, body = {}) {
  const fromHeader = String(req?.headers?.['x-openai-key'] || '').trim()
  const fromBody = String(body.apiKey || body.openaiApiKey || '').trim()
  const fromEnv = String(process.env.OPENAI_API_KEY || '').trim()
  return fromHeader || fromBody || fromEnv || ''
}

export function resolveModel(requested, hasOpenAiKey) {
  const raw = String(requested || '').trim()
  if (hasOpenAiKey) {
    if (ALLOWED_MODELS.has(raw)) return raw
    return 'gpt-4o-mini'
  }
  // Pollinations: modello "openai" = proxy gratuito verso un modello OpenAI-like
  if (raw === 'openai' || !raw) return 'openai'
  return raw
}

function extractContent(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') {
    try {
      return extractContent(JSON.parse(payload))
    } catch {
      return payload
    }
  }
  const choice = payload?.choices?.[0]
  const msg = choice?.message?.content ?? choice?.text
  if (typeof msg === 'string' && msg.trim()) return msg
  if (typeof payload?.content === 'string') return payload.content
  return ''
}

/**
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   temperature?: number,
 *   max_tokens?: number,
 *   model?: string,
 *   apiKey?: string,
 * }} opts
 */
export async function chatCompletion(opts) {
  const messages = Array.isArray(opts.messages) ? opts.messages : []
  if (!messages.length) {
    return { ok: false, status: 400, engine: 'none', text: 'Messaggi mancanti', raw: '' }
  }

  const apiKey = String(opts.apiKey || '').trim()
  const temperature =
    typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)
      ? opts.temperature
      : 0.25
  const maxTokens =
    typeof opts.max_tokens === 'number' && opts.max_tokens > 0
      ? Math.min(Math.floor(opts.max_tokens), 8192)
      : 3500
  const model = resolveModel(opts.model, Boolean(apiKey))

  if (apiKey) {
    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    })
    const raw = await upstream.text()
    if (!upstream.ok) {
      let detail = raw.slice(0, 400)
      try {
        const errJson = JSON.parse(raw)
        detail = errJson?.error?.message || detail
      } catch {
        /* plain */
      }
      return {
        ok: false,
        status: upstream.status,
        engine: 'openai',
        text: `OpenAI: ${detail}`,
        raw,
      }
    }
    const content = extractContent(raw)
    if (!content.trim()) {
      return {
        ok: false,
        status: 502,
        engine: 'openai',
        text: 'OpenAI ha restituito una risposta vuota.',
        raw,
      }
    }
    return { ok: true, status: 200, engine: 'openai', text: content, raw, model }
  }

  const upstream = await fetch(POLLINATIONS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'openai',
      temperature,
      seed: Date.now() % 100000,
      max_tokens: maxTokens,
    }),
  })
  const raw = await upstream.text()
  if (!upstream.ok) {
    return {
      ok: false,
      status: upstream.status,
      engine: 'pollinations',
      text: raw.slice(0, 400) || `AI HTTP ${upstream.status}`,
      raw,
    }
  }
  const content = extractContent(raw) || raw
  return {
    ok: Boolean(content.trim()),
    status: upstream.status,
    engine: 'pollinations',
    text: content,
    raw,
    model: 'openai',
  }
}
