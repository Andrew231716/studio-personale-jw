/**
 * Chat Completions gratuiti: Gemini (chiave free AI Studio) o Pollinations (senza chiave).
 * Token di output limitati per restare nel piano free.
 */

const POLLINATIONS_URL = 'https://text.pollinations.ai/'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Modelli ammessi + alias di fallback se il nome richiesto non è più valido. */
const GEMINI_MODELS = new Set([
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
  'gemini-flash-latest',
])

const GEMINI_FALLBACKS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
]

/** Cap output: tiene basso il consumo token sul free tier. */
const MAX_OUT_TOKENS = 1536
const DEFAULT_OUT_TOKENS = 1024

export function resolveProvider(req, body = {}) {
  const raw = String(
    req?.headers?.['x-ai-provider'] || body.provider || process.env.AI_PROVIDER || 'free',
  )
    .trim()
    .toLowerCase()
  if (raw === 'gemini') return 'gemini'
  if (raw === 'pollinations') return 'pollinations'
  return 'free'
}

export function resolveGeminiKey(req, body = {}) {
  const headers = req?.headers || {}
  const fromHeader = String(
    headers['x-gemini-key'] || headers['X-Gemini-Key'] || '',
  ).trim()
  const fromBody = String(body.geminiApiKey || body.apiKey || '').trim()
  const fromEnv = String(process.env.GEMINI_API_KEY || '').trim()
  return fromHeader || fromBody || fromEnv || ''
}

function extractOpenAiStyleContent(payload) {
  if (payload == null) return ''
  if (typeof payload === 'string') {
    try {
      return extractOpenAiStyleContent(JSON.parse(payload))
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
  if (payload == null) return { text: '', finishReason: '', blockReason: '' }
  let data = payload
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload)
    } catch {
      return { text: payload.trim(), finishReason: '', blockReason: '' }
    }
  }
  const cand = data?.candidates?.[0]
  const parts = cand?.content?.parts
  const text = Array.isArray(parts)
    ? parts
        .map((p) => (typeof p?.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    : ''
  const finishReason = String(cand?.finishReason || '')
  const blockReason = String(
    data?.promptFeedback?.blockReason || data?.promptFeedback?.blockReasonMessage || '',
  )
  return { text, finishReason, blockReason }
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
  if (contents.length && contents[0].role !== 'user') {
    contents.unshift({ role: 'user', parts: [{ text: '(continua)' }] })
  }
  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: 'Rispondi in italiano, in modo breve.' }] })
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

function modelCandidates(requested) {
  const first = GEMINI_MODELS.has(requested) ? requested : 'gemini-2.0-flash'
  const list = [first, ...GEMINI_FALLBACKS.filter((m) => m !== first)]
  return [...new Set(list)]
}

async function chatGeminiOnce({ messages, temperature, maxTokens, model, apiKey }) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(toGeminiBody(messages, temperature, maxTokens)),
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
      engine: 'gemini',
      text: `Gemini: ${detail}`,
      raw,
      model,
    }
  }
  const { text, finishReason, blockReason } = extractGeminiContent(raw)
  if (!text) {
    const why =
      blockReason ||
      (finishReason && finishReason !== 'STOP' ? finishReason : '') ||
      'risposta vuota'
    return {
      ok: false,
      status: 502,
      engine: 'gemini',
      text: `Gemini: nessuna risposta utilizzabile (${why}).`,
      raw,
      model,
    }
  }
  return { ok: true, status: 200, engine: 'gemini', text, raw, model }
}

async function chatGemini(opts) {
  const models = modelCandidates(String(opts.model || '').trim())
  let last = null
  for (const model of models) {
    const result = await chatGeminiOnce({ ...opts, model })
    last = result
    if (result.ok) return result
    // Riprova solo se modello assente / non supportato
    const msg = String(result.text || '')
    const retryable =
      result.status === 404 ||
      /not found|is not found|not supported|invalid model/i.test(msg)
    if (!retryable) return result
  }
  return last || {
    ok: false,
    status: 502,
    engine: 'gemini',
    text: 'Gemini non disponibile.',
    raw: '',
  }
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
  const content = extractOpenAiStyleContent(raw) || raw
  return {
    ok: Boolean(String(content).trim()),
    status: upstream.status,
    engine: 'pollinations',
    text: content,
    raw,
    model: 'pollinations',
  }
}

function clampOutTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return DEFAULT_OUT_TOKENS
  return Math.min(Math.floor(n), MAX_OUT_TOKENS)
}

/**
 * @param {{
 *   messages: Array<{ role: string, content: string }>,
 *   temperature?: number,
 *   max_tokens?: number,
 *   model?: string,
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
  const maxTokens = clampOutTokens(opts.max_tokens)
  const provider = String(opts.provider || 'free').toLowerCase()
  const geminiKey = String(opts.geminiApiKey || '').trim()
  const model = String(opts.model || '').trim()

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

  if (provider === 'pollinations') {
    return chatPollinations({ messages, temperature, maxTokens })
  }

  // free (default): Gemini se c’è chiave, altrimenti Pollinations
  if (geminiKey) {
    const gem = await chatGemini({
      messages,
      temperature,
      maxTokens,
      model: model || 'gemini-2.0-flash',
      apiKey: geminiKey,
    })
    if (gem.ok) return gem
    const fallback = await chatPollinations({ messages, temperature, maxTokens })
    if (fallback.ok) {
      return {
        ...fallback,
        text: `${fallback.text}`,
        note: `gemini_failed:${String(gem.text || '').slice(0, 120)}`,
      }
    }
    return gem
  }

  return chatPollinations({ messages, temperature, maxTokens })
}
