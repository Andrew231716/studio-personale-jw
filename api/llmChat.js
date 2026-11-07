/**
 * Chat Completions gratuiti: Gemini (chiave free AI Studio) o Pollinations (senza chiave).
 * Token di output limitati per restare nel piano free.
 */

const POLLINATIONS_URL = 'https://text.pollinations.ai/'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_MODELS = new Set([DEFAULT_GEMINI_MODEL, 'gemini-2.5-flash'])
const REQUEST_TIMEOUT = 42_000

/** Cap output: sempre pochi token (free tier / risparmio). */
const MAX_OUT_TOKENS = 768
const DEFAULT_OUT_TOKENS = 512

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
  const choice = payload?.choices?.[0]
  const text = choice?.message?.content ?? choice?.text ?? payload?.content
  return typeof text === 'string' ? text.trim() : ''
}

function failure(engine, status, text) {
  return { ok: false, engine, status, text }
}

function connectionFailure(engine, error) {
  const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
  return failure(engine, timedOut ? 504 : 502, timedOut
    ? 'Il motore AI ha impiegato troppo tempo. Riprova tra poco.'
    : 'Connessione al motore AI non riuscita. Riprova tra poco.')
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

async function chatGemini({ messages, temperature, maxTokens, model, apiKey }) {
  const engine = 'gemini'
  const selectedModel = GEMINI_MODELS.has(model) ? model : DEFAULT_GEMINI_MODEL
  const body = toGeminiBody(messages, temperature, maxTokens)
  body.generationConfig.thinkingConfig = selectedModel === 'gemini-2.5-flash'
    ? { thinkingBudget: 0 }
    : { thinkingLevel: 'minimal' }

  try {
    const upstream = await fetch(`${GEMINI_BASE}/${selectedModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      const invalidKey = upstream.status === 401 || upstream.status === 403
        || data?.error?.details?.some?.((detail) => detail?.reason === 'API_KEY_INVALID')
      if (invalidKey) {
        return failure(engine, upstream.status, 'Gemini ha rifiutato la chiave. Controllala in Impostazioni → Motore AI.')
      }
      if (upstream.status === 429) {
        return failure(engine, 429, 'Limite Gemini raggiunto. Controlla la quota in Google AI Studio o riprova più tardi.')
      }
      if (upstream.status === 404) {
        return failure(engine, 502, 'Modello Gemini non disponibile. Seleziona Gemini 3.1 Flash-Lite in Impostazioni → Motore AI.')
      }
      return failure(engine, 502, 'Gemini non ha accettato la richiesta. Riprova tra poco.')
    }

    const candidate = data?.candidates?.[0]
    const parts = candidate?.content?.parts
    const text = Array.isArray(parts)
      ? parts.filter((part) => !part?.thought && typeof part?.text === 'string').map((part) => part.text).join('').trim()
      : ''
    if (!text || candidate.finishReason === 'MAX_TOKENS') {
      return failure(engine, 502, 'Gemini non ha restituito una risposta completa. Riprova con una richiesta più breve.')
    }
    return { ok: true, status: 200, engine, text, model: selectedModel }
  } catch (error) {
    return connectionFailure(engine, error)
  }
}

async function chatPollinations({ messages, temperature, maxTokens }) {
  const engine = 'pollinations'
  const apiKey = String(process.env.POLLINATIONS_API_KEY || '').trim()
  const url = apiKey ? 'https://gen.pollinations.ai/v1/chat/completions' : POLLINATIONS_URL
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, model: 'openai', temperature, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })
    if (upstream.status === 402 || upstream.status === 429) {
      return apiKey
        ? failure(engine, 429, 'Limite del motore AI raggiunto. Riprova più tardi.')
        : failure(engine, 429, 'Il motore gratuito ha raggiunto il limite condiviso. Riprova fra circa un minuto oppure configura Gemini in Impostazioni → Motore AI.')
    }
    if (!upstream.ok) {
      return failure(engine, 502, 'Il motore gratuito non è disponibile. Riprova tra poco oppure configura Gemini in Impostazioni → Motore AI.')
    }

    const raw = (await upstream.text()).trim()
    let content = ''
    if (!apiKey && !/^[<{]/.test(raw) && !upstream.headers.get('content-type')?.includes('text/html')) {
      content = raw
    } else {
      const data = JSON.parse(raw)
      content = extractOpenAiStyleContent(data)
      if (!apiKey && !data?.error && (data?.pieces || Array.isArray(data))) content ||= raw
      if (data?.choices?.[0]?.finish_reason === 'length') content = ''
    }
    if (!content || /^\s*<(!doctype|html|head|body)\b/i.test(content)) {
      return failure(engine, 502, 'Il motore gratuito ha restituito una risposta inutilizzabile. Riprova tra poco.')
    }
    return { ok: true, status: 200, engine, text: content, model: 'openai' }
  } catch (error) {
    if (error instanceof SyntaxError) return failure(engine, 502, 'Il motore gratuito ha restituito una risposta inutilizzabile. Riprova tra poco.')
    return connectionFailure(engine, error)
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

  if (provider === 'gemini' || (provider === 'free' && geminiKey)) {
    if (!geminiKey) {
      return failure('gemini', 400, 'Inserisci la chiave Gemini in Impostazioni → Motore AI.')
    }
    return chatGemini({ messages, temperature, maxTokens, model, apiKey: geminiKey })
  }
  return chatPollinations({ messages, temperature, maxTokens })
}
