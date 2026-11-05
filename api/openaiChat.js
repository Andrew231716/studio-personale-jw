/**
 * Chat Completions multi-provider.
 * - free / gemini / pollinations: gratuiti (Gemini con chiave free AI Studio, Pollinations senza chiave)
 * - openai: a pagamento (crediti API)
 * Usato da /api/ai e /api/export-revise.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const POLLINATIONS_URL = 'https://text.pollinations.ai/'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const OPENAI_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o4-mini',
])

const GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
])

export function resolveProvider(req, body = {}) {
  const raw = String(
    req?.headers?.['x-ai-provider'] || body.provider || process.env.AI_PROVIDER || 'free',
  )
    .trim()
    .toLowerCase()
  if (raw === 'openai' || raw === 'chatgpt') return 'openai'
  if (raw === 'gemini') return 'gemini'
  if (raw === 'pollinations') return 'pollinations'
  return 'free'
}

export function resolveOpenAiKey(req, body = {}) {
  const fromHeader = String(req?.headers?.['x-openai-key'] || '').trim()
  const fromBody = String(body.apiKey || body.openaiApiKey || '').trim()
  const fromEnv = String(process.env.OPENAI_API_KEY || '').trim()
  return fromHeader || fromBody || fromEnv || ''
}

export function resolveGeminiKey(req, body = {}) {
  const fromHeader = String(req?.headers?.['x-gemini-key'] || '').trim()
  const fromBody = String(body.geminiApiKey || '').trim()
  const fromEnv = String(process.env.GEMINI_API_KEY || '').trim()
  return fromHeader || fromBody || fromEnv || ''
}

function extractOpenAiContent(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') {
    try {
      return extractOpenAiContent(JSON.parse(payload))
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

function extractGeminiContent(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') {
    try {
      return extractGeminiContent(JSON.parse(payload))
    } catch {
      return payload
    }
  }
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim()
}

function toGeminiBody(messages, temperature, maxTokens) {
  let systemText = ''
  const contents = []
  for (const m of messages) {
    const role = m?.role
    const text = String(m?.content || '')
    if (!text.trim()) continue
    if (role === 'system') {
      systemText = systemText ? `${systemText}\n\n${text}` : text
      continue
    }
    const gemRole = role === 'assistant' ? 'model' : 'user'
    const prev = contents[contents.length - 1]
    if (prev && prev.role === gemRole) {
      prev.parts[0].text += `\n\n${text}`
    } else {
      contents.push({ role: gemRole, parts: [{ text }] })
    }
  }
  // Gemini vuole che il primo content sia user
  if (contents.length && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '(continua)' }] })
  }
  const body = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  }
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] }
  }
  return body
}

async function chatOpenAi({ messages, temperature, maxTokens, model, apiKey }) {
  const resolved = OPENAI_MODELS.has(model) ? model : 'gpt-4o-mini'
  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolved,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })
  const raw = await upstream.text()
  if (!upstream.ok) {
    let detail = raw.slice(0, 400)
    try {
      detail = JSON.parse(raw)?.error?.message || detail
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
  const content = extractOpenAiContent(raw)
  if (!content.trim()) {
    return {
      ok: false,
      status: 502,
      engine: 'openai',
      text: 'OpenAI ha restituito una risposta vuota.',
      raw,
    }
  }
  return { ok: true, status: 200, engine: 'openai', text: content, raw, model: resolved }
}

async function chatGemini({ messages, temperature, maxTokens, model, apiKey }) {
  const resolved = GEMINI_MODELS.has(model) ? model : 'gemini-2.0-flash'
  const url = `${GEMINI_BASE}/${resolved}:generateContent?key=${encodeURIComponent(apiKey)}`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toGeminiBody(messages, temperature, maxTokens)),
  })
  const raw = await upstream.text()
  if (!upstream.ok) {
    let detail = raw.slice(0, 400)
    try {
      const err = JSON.parse(raw)
      detail = err?.error?.message || detail
    } catch {
      /* plain */
    }
    return {
      ok: false,
      status: upstream.status,
      engine: 'gemini',
      text: `Gemini: ${detail}`,
      raw,
    }
  }
  const content = extractGeminiContent(raw)
  if (!content.trim()) {
    return {
      ok: false,
      status: 502,
      engine: 'gemini',
      text: 'Gemini ha restituito una risposta vuota.',
      raw,
    }
  }
  return { ok: true, status: 200, engine: 'gemini', text: content, raw, model: resolved }
}

async function chatPollinations({ messages, temperature, maxTokens }) {
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
  const content = extractOpenAiContent(raw) || raw
  return {
    ok: Boolean(String(content).trim()),
    status: upstream.status,
    engine: 'pollinations',
    text: content,
    raw,
    model: 'openai',
  }
}

/**
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   temperature?: number,
 *   max_tokens?: number,
 *   model?: string,
 *   apiKey?: string,
 *   geminiApiKey?: string,
 *   provider?: string,
 * }} opts
 */
export async function chatCompletion(opts) {
  const messages = Array.isArray(opts.messages) ? opts.messages : []
  if (!messages.length) {
    return { ok: false, status: 400, engine: 'none', text: 'Messaggi mancanti', raw: '' }
  }

  const temperature =
    typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)
      ? opts.temperature
      : 0.25
  const maxTokens =
    typeof opts.max_tokens === 'number' && opts.max_tokens > 0
      ? Math.min(Math.floor(opts.max_tokens), 8192)
      : 3500

  const provider = String(opts.provider || 'free').toLowerCase()
  const openAiKey = String(opts.apiKey || '').trim()
  const geminiKey = String(opts.geminiApiKey || '').trim()
  const model = String(opts.model || '').trim()

  // OpenAI solo se esplicitamente richiesto
  if (provider === 'openai') {
    if (!openAiKey) {
      return {
        ok: false,
        status: 400,
        engine: 'openai',
        text: 'Provider OpenAI selezionato ma manca la chiave API.',
        raw: '',
      }
    }
    return chatOpenAi({
      messages,
      temperature,
      maxTokens,
      model,
      apiKey: openAiKey,
    })
  }

  // Gemini esplicito
  if (provider === 'gemini') {
    if (!geminiKey) {
      return {
        ok: false,
        status: 400,
        engine: 'gemini',
        text: 'Provider Gemini selezionato ma manca la chiave API gratuita.',
        raw: '',
      }
    }
    return chatGemini({
      messages,
      temperature,
      maxTokens,
      model,
      apiKey: geminiKey,
    })
  }

  // pollinations esplicito
  if (provider === 'pollinations') {
    return chatPollinations({ messages, temperature, maxTokens })
  }

  // free (default): Gemini se c’è chiave free, altrimenti Pollinations senza chiave
  if (geminiKey) {
    const gem = await chatGemini({
      messages,
      temperature,
      maxTokens,
      model: model || 'gemini-2.0-flash',
      apiKey: geminiKey,
    })
    if (gem.ok) return gem
    // Se Gemini fallisce, prova il motore senza chiave
    const fallback = await chatPollinations({ messages, temperature, maxTokens })
    if (fallback.ok) return { ...fallback, text: fallback.text }
    return gem
  }

  return chatPollinations({ messages, temperature, maxTokens })
}
