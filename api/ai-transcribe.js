/**
 * Trascrizione audio → testo via Gemini (multimodal).
 * Prova più chiavi in rotazione su 429.
 * Body: { audioBase64, mimeType?, language?, geminiApiKeys? }
 */
import { resolveGeminiKeys, resolveProvider } from './llmChat.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash'
const REQUEST_TIMEOUT = 90_000
const MAX_BASE64_CHARS = 6_000_000

async function transcribeOnce({ apiKey, model, mimeType, audioBase64, language, offset }) {
  const prompt = `Transcribe all audible speech faithfully, without translating or summarizing. Language hint: ${language}.
Return JSON as {"segments":[{"start":0,"speaker":"1","text":"..."}]}.
Use seconds relative to this clip, in chronological order. Start a segment at every speaker change and at natural breaks in long turns. Use consistent numeric speaker labels within this clip. Leave segments empty for silence. Never invent speech. Format Bible citations with a colon, e.g. John 3:16.`

  const upstream = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: audioBase64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        thinkingConfig: model.includes('2.5')
          ? { thinkingBudget: 0 }
          : { thinkingLevel: 'minimal' },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  })

  const data = await upstream.json().catch(() => null)
  if (!upstream.ok) {
    const invalidKey = upstream.status === 401 || upstream.status === 403
      || data?.error?.details?.some?.((detail) => detail?.reason === 'API_KEY_INVALID')
    return {
      ok: false,
      status: upstream.status,
      text: invalidKey
        ? 'Gemini ha rifiutato la chiave. Controllala in Impostazioni.'
        : upstream.status === 429
          ? 'Limite Gemini raggiunto. Riprova più tardi.'
          : String(data?.error?.message || 'Trascrizione non riuscita. Riprova o usa un file più corto.').slice(0, 280),
    }
  }

  const parts = data?.candidates?.[0]?.content?.parts
  const text = Array.isArray(parts)
    ? parts
        .filter((p) => !p?.thought && typeof p?.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim()
    : ''
  let segments
  try {
    segments = JSON.parse(text).segments.filter(
      (item) => Number.isFinite(item?.start) && item.start >= 0 && item.start <= 120 && typeof item.text === 'string' && item.text.trim(),
    ).map((item) => ({
      start: item.start,
      speaker: `Relatore ${offset + (Number.isSafeInteger(Number(item.speaker)) && Number(item.speaker) > 0 ? Number(item.speaker) : 1)}`,
      text: item.text.trim(),
    })).sort((a, b) => a.start - b.start)
  } catch {
    return { ok: false, status: 502, text: 'Il motore ha restituito una trascrizione incompleta. Riprova.' }
  }

  return {
    ok: true,
    status: 200,
    engine: 'gemini',
    text: segments.map((segment) => segment.text).join('\n'),
    segments,
    model,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const audioBase64 = String(body.audioBase64 || '').replace(/\s/g, '')
    const mimeType = String(body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm'
    const languages = new Map([['I', 'Italian'], ['E', 'English'], ['S', 'Spanish'], ['F', 'French'], ['D', 'German'], ['P', 'Portuguese']])
    const language = languages.get(body.language) || 'automatic'
    const offset = Math.max(0, Number(body.speakerOffset) || 0)

    if (!audioBase64 || audioBase64.length < 64) {
      res.status(400).send('Audio mancante')
      return
    }
    if (audioBase64.length > MAX_BASE64_CHARS) {
      res.status(413).send('Registrazione troppo lunga. Spezza in parti più brevi o scarica e trascrivi a pezzi.')
      return
    }

    const provider = resolveProvider(req, body)
    const keys = resolveGeminiKeys(req, body)
    if (!keys.length) {
      res
        .status(400)
        .send(
          provider === 'gemini' || provider === 'free'
            ? 'Per trascrivere le registrazioni inserisci la chiave Gemini in Impostazioni → Motore AI.'
            : 'Trascrizione audio richiede Gemini. Configuralo in Impostazioni → Motore AI.',
        )
      return
    }

    const model = String(body.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL
    let last = { ok: false, status: 429, text: 'Limite Gemini raggiunto. Aggiungi altre chiavi in Impostazioni o riprova più tardi.' }
    for (const apiKey of keys) {
      last = await transcribeOnce({
        apiKey,
        model,
        mimeType,
        audioBase64,
        language,
        offset,
      })
      if (last.ok) {
        res.status(200).json(last)
        return
      }
      if (last.status !== 429 && last.status !== 401 && last.status !== 403) {
        break
      }
    }

    res.status(last.status || 502).send(last.text || 'Trascrizione non riuscita')
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(400).send('Richiesta non valida')
      return
    }
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    res
      .status(timedOut ? 504 : 502)
      .send(
        timedOut
          ? 'Trascrizione troppo lenta. Riprova con un audio più breve.'
          : 'Servizio trascrizione non disponibile. Riprova tra poco.',
      )
  }
}
