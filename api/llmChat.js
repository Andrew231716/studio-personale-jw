/**
 * Chat Completions free in catena:
 * Gemini → Groq → OpenRouter (:free) → Pollinations.
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
  if (raw === 'groq') return 'groq'
  if (raw === 'openrouter') return 'openrouter'
  if (raw === 'pollinations') return 'pollinations'
  return 'free'
}

function uniqKeys(values) {
  const out = []
  const seen = new Set()
  for (const value of values) {
    const key = String(value || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function splitKeys(value) {
  if (Array.isArray(value)) return value.map((s) => String(s || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolveKeysFrom(req, body, spec) {
  const headers = req?.headers || {}
  return uniqKeys([
    headers[spec.header] || headers[spec.headerAlt],
    body[spec.bodyPrimary],
    ...splitKeys(headers[spec.headerList] || headers[spec.headerListAlt]),
    ...splitKeys(body[spec.bodyList]),
    process.env[spec.env],
    ...splitKeys(process.env[spec.envList]),
  ])
}

export function resolveGeminiKey(req, body = {}) {
  return resolveGeminiKeys(req, body)[0] || ''
}

/** Tutte le chiavi Gemini disponibili (rotazione su 429). */
export function resolveGeminiKeys(req, body = {}) {
  return resolveKeysFrom(req, body, {
    header: 'x-gemini-key',
    headerAlt: 'X-Gemini-Key',
    headerList: 'x-gemini-keys',
    headerListAlt: 'X-Gemini-Keys',
    bodyPrimary: 'geminiApiKey',
    bodyList: 'geminiApiKeys',
    env: 'GEMINI_API_KEY',
    envList: 'GEMINI_API_KEYS',
  }).concat(
    // compat vecchio campo apiKey solo se sembra Gemini
    String(body.apiKey || '').startsWith('AIza') ? [String(body.apiKey).trim()] : [],
  ).filter((key, i, arr) => arr.indexOf(key) === i)
}

export function resolveGroqKeys(req, body = {}) {
  return resolveKeysFrom(req, body, {
    header: 'x-groq-key',
    headerAlt: 'X-Groq-Key',
    headerList: 'x-groq-keys',
    headerListAlt: 'X-Groq-Keys',
    bodyPrimary: 'groqApiKey',
    bodyList: 'groqApiKeys',
    env: 'GROQ_API_KEY',
    envList: 'GROQ_API_KEYS',
  })
}

export function resolveOpenRouterKeys(req, body = {}) {
  return resolveKeysFrom(req, body, {
    header: 'x-openrouter-key',
    headerAlt: 'X-OpenRouter-Key',
    headerList: 'x-openrouter-keys',
    headerListAlt: 'X-OpenRouter-Keys',
    bodyPrimary: 'openRouterApiKey',
    bodyList: 'openRouterApiKeys',
    env: 'OPENROUTER_API_KEY',
    envList: 'OPENROUTER_API_KEYS',
  })
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
        : failure(engine, 429, 'Il motore gratuito ha raggiunto il limite condiviso. Riprova fra circa un minuto oppure configura altre chiavi in Impostazioni → Motore AI.')
    }
    if (!upstream.ok) {
      return failure(engine, 502, 'Il motore gratuito non è disponibile. Riprova tra poco oppure configura altre chiavi in Impostazioni → Motore AI.')
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

async function chatOpenAiCompatible({
  engine,
  url,
  apiKey,
  messages,
  temperature,
  maxTokens,
  model,
  extraHeaders = {},
}) {
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })
    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        return failure(engine, upstream.status, `${engine} ha rifiutato la chiave. Controllala in Impostazioni → Motore AI.`)
      }
      if (upstream.status === 429) {
        return failure(engine, 429, `Limite ${engine} raggiunto. Riprova più tardi o usa un’altra chiave.`)
      }
      return failure(
        engine,
        502,
        String(data?.error?.message || `${engine} non ha accettato la richiesta.`).slice(0, 220),
      )
    }
    const text = extractOpenAiStyleContent(data)
    if (!text) {
      return failure(engine, 502, `${engine} non ha restituito una risposta utilizzabile.`)
    }
    return { ok: true, status: 200, engine, text, model }
  } catch (error) {
    return connectionFailure(engine, error)
  }
}

function chatGroq({ messages, temperature, maxTokens, apiKey }) {
  return chatOpenAiCompatible({
    engine: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey,
    messages,
    temperature,
    maxTokens,
    model: 'llama-3.1-8b-instant',
  })
}

function chatOpenRouter({ messages, temperature, maxTokens, apiKey }) {
  return chatOpenAiCompatible({
    engine: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey,
    messages,
    temperature,
    maxTokens,
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    extraHeaders: {
      'HTTP-Referer': 'https://studio-personale-jw.vercel.app',
      'X-Title': 'Studio personale JW',
    },
  })
}

function clampOutTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return DEFAULT_OUT_TOKENS
  return Math.min(Math.floor(n), MAX_OUT_TOKENS)
}

function isRotatable(result) {
  return result.status === 429 || result.status === 401 || result.status === 403 || result.status === 502 || result.status === 504
}

/**
 * Catena free: Gemini → Groq → OpenRouter → Pollinations.
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
  const model = String(opts.model || '').trim()
  const allowFreeFallback = opts.fallbackFree !== false
  const emptyReq = { headers: {} }

  const geminiKeys = resolveGeminiKeys(emptyReq, {
    geminiApiKey: opts.geminiApiKey,
    geminiApiKeys: opts.geminiApiKeys,
  })
  const groqKeys = resolveGroqKeys(emptyReq, {
    groqApiKey: opts.groqApiKey,
    groqApiKeys: opts.groqApiKeys,
  })
  const openRouterKeys = resolveOpenRouterKeys(emptyReq, {
    openRouterApiKey: opts.openRouterApiKey,
    openRouterApiKeys: opts.openRouterApiKeys,
  })

  const steps = []
  const pushGemini = () => {
    for (const apiKey of geminiKeys) {
      steps.push(() => chatGemini({ messages, temperature, maxTokens, model, apiKey }))
    }
  }
  const pushGroq = () => {
    for (const apiKey of groqKeys) {
      steps.push(() => chatGroq({ messages, temperature, maxTokens, apiKey }))
    }
  }
  const pushOpenRouter = () => {
    for (const apiKey of openRouterKeys) {
      steps.push(() => chatOpenRouter({ messages, temperature, maxTokens, apiKey }))
    }
  }
  const pushPollinations = () => {
    if (allowFreeFallback) steps.push(() => chatPollinations({ messages, temperature, maxTokens }))
  }

  if (provider === 'gemini') {
    pushGemini()
    if (allowFreeFallback) {
      pushGroq()
      pushOpenRouter()
      pushPollinations()
    }
  } else if (provider === 'groq') {
    pushGroq()
    if (allowFreeFallback) {
      pushGemini()
      pushOpenRouter()
      pushPollinations()
    }
  } else if (provider === 'openrouter') {
    pushOpenRouter()
    if (allowFreeFallback) {
      pushGemini()
      pushGroq()
      pushPollinations()
    }
  } else if (provider === 'pollinations') {
    pushPollinations()
  } else {
    // free / auto
    pushGemini()
    pushGroq()
    pushOpenRouter()
    pushPollinations()
  }

  if (!steps.length) {
    return failure(
      'none',
      400,
      'Nessun motore AI configurato. Aggiungi chiavi Gemini/Groq/OpenRouter in Impostazioni → Motore AI.',
    )
  }

  let last = failure('none', 502, 'Nessun motore AI ha risposto.')
  for (const step of steps) {
    const result = await step()
    if (result.ok) return result
    last = result
    if (!isRotatable(result)) continue
  }
  return last
}
