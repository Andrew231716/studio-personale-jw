/** Trascrizione registrazioni Discorso via /api/ai-transcribe (Gemini). */

import { aiRequestExtras } from './ai'
import { localPolishDiscourse } from './discourseAi'
import { normalizeJwItalian } from './jwItalianTerms'

/** Limite pratico body JSON / Vercel (~4.5 MB). */
const MAX_BYTES = 3_500_000

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      const i = dataUrl.indexOf(',')
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error || new Error('Lettura audio fallita'))
    reader.readAsDataURL(blob)
  })
}

export async function transcribeDiscourseAudio(
  blob: Blob,
  opts?: { language?: string; signal?: AbortSignal },
): Promise<{ text: string; engine: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Serve connessione per trascrivere la registrazione.')
  }
  if (blob.size > MAX_BYTES) {
    throw new Error(
      'Registrazione troppo lunga per la trascrizione automatica. Scaricala e spezzala in parti più brevi, oppure registra pezzi da pochi minuti.',
    )
  }
  const audioBase64 = await blobToBase64(blob)
  const extras = aiRequestExtras()
  const res = await fetch('/api/ai-transcribe', {
    method: 'POST',
    headers: extras.headers,
    signal: opts?.signal || AbortSignal.timeout(95_000),
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/webm',
      language: opts?.language || 'I',
      provider: extras.provider,
      model: 'gemini-2.5-flash',
    }),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).trim()
    throw new Error(detail || `Trascrizione non riuscita (HTTP ${res.status}).`)
  }
  const data = (await res.json()) as { text?: string; engine?: string }
  const text = normalizeJwItalian(localPolishDiscourse(String(data.text || '').trim()))
  if (!text) throw new Error('Nessun testo riconosciuto nell’audio.')
  return { text, engine: data.engine || 'gemini' }
}
