/**
 * Trascrizione audio → testo via Gemini (multimodal).
 * Body: { audioBase64, mimeType?, language? }
 */
import { resolveGeminiKey, resolveProvider } from './llmChat.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.5-flash'
const REQUEST_TIMEOUT = 90_000
const MAX_BASE64_CHARS = 6_000_000 // ~4.5 MB audio grezzo

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const audioBase64 = String(body.audioBase64 || '').replace(/\s/g, '')
    const mimeType = String(body.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm'
    const language = String(body.language || 'I').toUpperCase() === 'E' ? 'English' : 'Italian'

    if (!audioBase64 || audioBase64.length < 64) {
      res.status(400).send('Audio mancante')
      return
    }
    if (audioBase64.length > MAX_BASE64_CHARS) {
      res.status(413).send('Registrazione troppo lunga. Spezza in parti più brevi o scarica e trascrivi a pezzi.')
      return
    }

    const provider = resolveProvider(req, body)
    const apiKey = resolveGeminiKey(req, body)
    if (!apiKey) {
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
    const prompt =
      language === 'English'
        ? 'Transcribe this spoken audio faithfully. Return ONLY the transcript text, no titles or markdown. Keep scripture references as spoken.'
        : 'Trascrivi fedelmente questo audio parlato in italiano. Restituisci SOLO il testo trascritto, senza titoli né markdown. Conserva i riferimenti biblici come detti.'

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
          maxOutputTokens: 2048,
          thinkingConfig: model.includes('2.5')
            ? { thinkingBudget: 0 }
            : { thinkingLevel: 'minimal' },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    })

    const data = await upstream.json().catch(() => null)
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) {
        res.status(upstream.status).send('Gemini ha rifiutato la chiave. Controllala in Impostazioni.')
        return
      }
      if (upstream.status === 429) {
        res.status(429).send('Limite Gemini raggiunto. Riprova più tardi.')
        return
      }
      const msg =
        data?.error?.message ||
        'Trascrizione non riuscita. Riprova o usa un file più corto.'
      res.status(502).send(String(msg).slice(0, 280))
      return
    }

    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts)
      ? parts
          .filter((p) => !p?.thought && typeof p?.text === 'string')
          .map((p) => p.text)
          .join('')
          .trim()
      : ''
    if (!text) {
      res.status(502).send('Nessun testo riconosciuto nell’audio.')
      return
    }

    res.status(200).json({ engine: 'gemini', text, model })
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
