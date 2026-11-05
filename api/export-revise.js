/**
 * Revisione pre-export PDF/EPUB: struttura, sintassi, grammatica, terminologia JW.
 * Non inventa contenuti; corregge solo forma e chiarezza.
 */

import { chatCompletion, resolveGeminiKey, resolveProvider } from './llmChat.js'

const MAX_PIECES = 40
const MAX_CHARS_TOTAL = 14000

function localPolish(raw) {
  let s = String(raw || '')
  s = s.replace(/\b([12])\s*Corinzi\b/gi, '$1 Corinti')
  s = s.replace(/\bCorinzi\b/gi, 'Corinti')
  s = s.replace(/\bApocalisse\b/gi, 'Rivelazione')
  s = s.replace(/\bJehovah\b/g, 'Geova')
  s = s.replace(/\bministeriale\b/gi, 'di ministero')
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\s+([,.;:!?])/g, '$1')
  s = s.replace(/([.!?…])\s*([a-zàèéìòù])/g, (_, p, c) => `${p} ${c.toUpperCase()}`)
  s = s.replace(/(^|\n)([a-zàèéìòù])/g, (_, a, c) => `${a}${c.toUpperCase()}`)
  // Spezza righe “attaccate” tipo parola.Parola
  s = s.replace(/([a-zàèéìòù])([.!?])([A-ZÀÈÉÌÒÙ])/g, '$1$2 $3')
  return s.trim()
}

function localRevisePieces(pieces) {
  return pieces.map((p) => ({
    id: p.id,
    text: localPolish(p.text),
  }))
}

function parseAiPieces(raw, fallback) {
  const text = String(raw || '').trim()
  if (!text) return null
  try {
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
      if (Array.isArray(parsed?.pieces)) {
        return parsed.pieces
          .filter((p) => p && typeof p.id === 'string' && typeof p.text === 'string')
          .map((p) => ({ id: p.id, text: localPolish(p.text) }))
      }
    }
  } catch {
    /* ignore */
  }
  // Se l’AI non ha rispettato il JSON, resta il polish locale
  return fallback
}

async function reviseWithAi(kind, language, pieces, opts = {}) {
  const langHint = language === 'E' ? 'English' : 'italiano'
  const kindHint =
    kind === 'discorso'
      ? 'bozza di discorso pubblico'
      : kind === 'decisione'
        ? 'documento su una decisione personale'
        : kind === 'argomento'
          ? 'appunti di studio personale (Quaderno)'
          : 'riepilogo di studio personale'

  const payload = pieces
    .map((p) => `### ${p.id}\n${p.text}`)
    .join('\n\n')
    .slice(0, MAX_CHARS_TOTAL)

  const prompt = `Sei un revisore editoriale per documenti dei Testimoni di Geova (${langHint}).
Devi correggere una ${kindHint} PRIMA dell’export in PDF/EPUB.

Obiettivi (obbligatori):
1. Ortografia, grammatica, punteggiatura e sintassi.
2. Struttura chiara: paragrafi ordinati, niente ripetizioni inutili di spazi/a capo, niente frasi spezzate a metà.
3. Terminologia jw.org / TNM (es. 1 Corinti, Rivelazione, ministero, congregazione, Geova).
4. Layout testuale: titoli e punti leggibili, elenchi coerenti.

Vincoli stretti:
- NON inventare contenuti, citazioni, versetti o esempi nuovi.
- NON cambiare il senso delle frasi.
- Conserva i riferimenti biblici (es. Proverbi 14:12).
- Se un pezzo è già corretto, restituiscilo uguale.
- Rispondi SOLO con JSON valido, senza markdown, in questa forma esatta:
{"pieces":[{"id":"...","text":"..."}]}

Pezzi da revisionare:
${payload}`

  const result = await chatCompletion({
    messages: [
      {
        role: 'system',
        content:
          'Revisore editoriale JW. Correggi solo forma e chiarezza. Rispondi solo JSON.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.15,
    max_tokens: 1200,
    model: opts?.model,
    provider: opts?.provider || 'free',
    geminiApiKey: opts?.geminiApiKey,
  })

  if (!result.ok) throw new Error(result.text || `AI HTTP ${result.status}`)
  return result.text
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const kind = String(body.kind || 'riepilogo')
    const language = String(body.language || 'I')
    const incoming = Array.isArray(body.pieces) ? body.pieces : []
    const pieces = incoming
      .filter((p) => p && typeof p.id === 'string' && String(p.text || '').trim())
      .slice(0, MAX_PIECES)
      .map((p) => ({ id: String(p.id), text: String(p.text).trim() }))

    if (!pieces.length) {
      res.status(400).json({ error: 'Nessun testo da revisionare', pieces: [], engine: 'local' })
      return
    }

    const local = localRevisePieces(pieces)
    let engine = 'local'
    let revised = local
    const provider = resolveProvider(req, body)
    const geminiApiKey = resolveGeminiKey(req, body)
    const model = String(body.model || '').trim() || undefined

    try {
      const aiRaw = await reviseWithAi(kind, language, local, {
        provider,
        geminiApiKey,
        model,
      })
      const parsed = parseAiPieces(aiRaw, null)
      if (parsed && parsed.length) {
        const byId = new Map(parsed.map((p) => [p.id, p.text]))
        revised = local.map((p) => ({
          id: p.id,
          text: byId.has(p.id) ? localPolish(byId.get(p.id)) : p.text,
        }))
        engine = 'ai'
      }
    } catch {
      engine = 'local'
      revised = local
    }

    res.status(200).json({
      engine,
      pieces: revised,
      revisedAt: new Date().toISOString(),
    })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
