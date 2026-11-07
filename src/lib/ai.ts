import { JW_ITALIAN_TERM_HINT_SHORT, normalizeJwItalian } from './jwItalianTerms'
import type {
  AiMessage,
  AiProviderPref,
  AiSettings,
  DecisionItem,
  GeminiModelPref,
  JwResult,
  StudyTopic,
} from '../types'
import { uid } from './id'
import { useAppStore } from '../store/useAppStore'

export const GEMINI_MODEL_OPTIONS: Array<{ id: GeminiModelPref; label: string }> = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite (consigliato)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

export const AI_PROVIDER_OPTIONS: Array<{ id: AiProviderPref; label: string }> = [
  { id: 'free', label: 'Automatico (senza chiave, limite condiviso)' },
  { id: 'gemini', label: 'Google Gemini (con chiave free)' },
]

export function supportedGeminiModel(model?: GeminiModelPref): GeminiModelPref {
  return model === 'gemini-2.5-flash' ? model : 'gemini-3.1-flash-lite'
}

function readAiSettings(): AiSettings {
  const s = useAppStore.getState().settings
  const legacy = s.openAi
  const cur = s.ai
  const providerRaw = cur?.provider || legacy?.provider || 'free'
  const provider: AiProviderPref = providerRaw === 'gemini' ? 'gemini' : 'free'
  return {
    provider,
    geminiApiKey: (cur?.geminiApiKey || legacy?.geminiApiKey || '').trim(),
    geminiModel: supportedGeminiModel(cur?.geminiModel || legacy?.geminiModel),
  }
}

/** Output token sempre bassi (piano free / risparmio). */
export const AI_MAX_OUT_TOKENS = 768
const CONTEXT_CHAR_LIMIT = 12_000
const HISTORY_MSG_LIMIT = 2
const HISTORY_CHAR_LIMIT = 500
const PROMPT_CHAR_LIMIT = 1600

function clipText(value: string, max: number): string {
  const s = String(value || '')
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

/** Header + body per il proxy /api/* (solo motori gratuiti). */
export function aiRequestExtras(): {
  headers: Record<string, string>
  provider: AiProviderPref
  model: string
} {
  const cfg = readAiSettings()
  const provider = cfg.provider || 'free'
  const geminiApiKey = (cfg.geminiApiKey || '').trim()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-ai-provider': provider,
  }
  if (geminiApiKey) headers['x-gemini-key'] = geminiApiKey

  return {
    headers,
    provider,
    model: supportedGeminiModel(cfg.geminiModel),
  }
}

/** @deprecated usa aiRequestExtras */
export function openAiRequestExtras() {
  return aiRequestExtras()
}

export function getAiProvider(): AiProviderPref {
  return readAiSettings().provider || 'free'
}

const AI_TIMEOUT = 50_000

/** Usa lo stesso percorso delle funzioni AI dell’app. */
export async function probeAiEngine(): Promise<{ ok: boolean; engine: string; text: string }> {
  const result = await requestAi([{ role: 'user', content: 'Scrivi solo: OK' }], 96)
  return { ok: true, ...result }
}

/** System prompt compatto: meno token in ingresso su ogni chiamata. */
const SYSTEM_GROUNDING = `Assistente studio personale Testimoni di Geova (jw.org / JW Library / TNM italiana).
Regole: cita SOLO titoli/URL del contesto; non inventare articoli, versetti letterali o nomi; se manca materiale dillo e invita a jw.org. Ancora obiettivi/riflessioni al contenuto fornito; evita frasi vuote. Italiano caldo e pratico, breve. Decisioni: priorità, pro/contro, conclusione prudente. Non sostituisci Bibbia né anziani.
${JW_ITALIAN_TERM_HINT_SHORT}
Rispondi in modo conciso (pochi elenchi, niente ripetizioni).`

export async function askAi(params: {
  prompt: string
  history?: AiMessage[]
  context?: string
  allowedUrls?: string[]
  signal?: AbortSignal
}): Promise<string> {
  const { prompt, history = [], context = '', allowedUrls = [], signal } = params
  const clippedContext = clipText(context, CONTEXT_CHAR_LIMIT)
  const messages = [
    {
      role: 'system',
      content:
        SYSTEM_GROUNDING +
        (clippedContext
          ? `\n\n## Contesto affidabile\n${clippedContext}`
          : '\n\n## Contesto affidabile\nNessun risultato jw.org disponibile: non inventare titoli né link.'),
    },
    ...history.slice(-HISTORY_MSG_LIMIT).map((m) => ({
      role: m.role,
      content: clipText(m.content, HISTORY_CHAR_LIMIT),
    })),
    {
      role: 'user',
      content:
        clipText(prompt, PROMPT_CHAR_LIMIT) +
        '\n\n(Solo fonti del contesto; terminologia JW; risposta breve.)',
    },
  ]

  const result = await requestAi(messages, AI_MAX_OUT_TOKENS, signal)
  return enforceGrounding(result.text, allowedUrls)
}

async function requestAi(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  signal?: AbortSignal,
): Promise<{ engine: string; text: string }> {
  const extras = aiRequestExtras()
  const timeout = AbortSignal.timeout(AI_TIMEOUT)
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: extras.headers,
      body: JSON.stringify({
        messages,
        provider: extras.provider,
        model: extras.model,
        temperature: 0.25,
        max_tokens: maxTokens,
      }),
    })
    if (!res.ok) {
      const detail = res.headers.get('content-type')?.includes('text/plain')
        ? (await res.text()).trim()
        : ''
      throw new Error(detail || `Servizio AI non disponibile (HTTP ${res.status}). Riprova tra poco.`)
    }
    const data = await res.json().catch(() => null) as {
      engine?: string
      choices?: Array<{ message?: { content?: string } }>
    } | null
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Il servizio AI non ha restituito una risposta utilizzabile. Riprova tra poco.')
    }
    return { engine: data?.engine || extras.provider, text: text.trim() }
  } catch (error) {
    if (timeout.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
      throw new Error('Il motore AI ha impiegato troppo tempo. Riprova tra poco.')
    }
    if (error instanceof TypeError) {
      throw new Error('Connessione al servizio AI non riuscita. Controlla la connessione e riprova.')
    }
    throw error
  }
}

/** Rimuove link jw.org/wol non presenti nei risultati e aggiunge un monito se serve. */
export function enforceGrounding(answer: string, allowedUrls: string[] = []): string {
  const allowed = new Set(
    allowedUrls
      .map((u) => normalizeUrl(u))
      .filter(Boolean),
  )

  let cleaned = answer
  const linkRe = /https?:\/\/[^\s)\]>'"]+/gi
  const found = answer.match(linkRe) || []
  for (const raw of found) {
    const url = normalizeUrl(raw.replace(/[.,;:!?)]+$/, ''))
    if (!url) continue
    const isJw =
      url.includes('jw.org') || url.includes('jw-cdn.org') || url.includes('wol.jw.org')
    if (!isJw) continue
    if (allowed.size > 0 && !allowed.has(url) && ![...allowed].some((a) => url.startsWith(a) || a.startsWith(url))) {
      cleaned = cleaned.split(raw).join('(vedi i collegamenti trovati a destra / sotto)')
    }
  }

  // Segnali tipici di allucinazione lessicale: termini inventati con apostrofi/trattini strani
  const suspicious =
    /\bPapa[\s-]*Si[\s-]*si['’]?m\b|\bfratelli[\s-]*di[\s-]*perfezione\b|\bWashington New Life\b|\bdenominazione\b|\bburocratic/i
  if (suspicious.test(cleaned)) {
    cleaned +=
      '\n\n—\nNota: alcune formulazioni non tipiche di jw.org sono state evitate o vanno verificate. Affidati ai titoli ufficiali nei collegamenti e, se serve, chiedi conferma agli anziani.'
  }

  if (allowed.size > 0 && !/jw\.org|JW Library|collegament/i.test(cleaned)) {
    cleaned +=
      '\n\nUsa i collegamenti jw.org mostrati nell’app per approfondire (solo quelli trovati dalla ricerca).'
  }

  return normalizeJwItalian(cleaned)
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString().replace(/\/$/, '')
  } catch {
    return url.trim()
  }
}

export function buildStudyContext(topic?: StudyTopic | null, results: JwResult[] = []): string {
  const parts: string[] = []
  if (topic) {
    parts.push(`Argomento: ${topic.title}`)
    if (topic.interest) parts.push(`Interesse: ${topic.interest}`)
    if (topic.objectives.length) parts.push(`Obiettivi: ${topic.objectives.join('; ')}`)
    if (topic.transcript) {
      const meta = topic.transcriptMeta
        ? ` (video: ${topic.transcriptMeta.videoTitle}${topic.transcriptMeta.lank ? `, lank ${topic.transcriptMeta.lank}` : ''})`
        : ''
      parts.push(`Trascrizione video JW${meta}:\n${topic.transcript.slice(0, 4000)}`)
    }
    if (topic.reflections.some((r) => r.response)) {
      parts.push(
        'Riflessioni:\n' +
          topic.reflections
            .filter((r) => r.response)
            .map((r) => `- ${r.prompt}: ${r.response}`)
            .join('\n'),
      )
    }
  }
  if (results.length) {
    parts.push(
      'Risultati jw.org (uniche fonti citabili):\n' +
        results
          .slice(0, 12)
          .map((r) => {
            const snip = r.snippet ? ` — ${r.snippet.slice(0, 180)}` : ''
            const sec = r.section ? `[${r.section}] ` : ''
            const ctx = r.context ? ` (${r.context})` : ''
            return `- ${sec}${r.title}${ctx}${snip}\n  URL: ${r.url}`
          })
          .join('\n'),
    )
  }
  return parts.join('\n\n')
}

export function buildDecisionContext(
  decision?: DecisionItem | null,
  results: JwResult[] = [],
  linkedTopics: Array<{ title: string; interest?: string; status?: string }> = [],
): string {
  if (!decision && !results.length && !linkedTopics.length) return ''
  const parts: string[] = []
  if (decision) {
    parts.push(`Decisione: ${decision.title} (${decision.scale})`)
    parts.push(`Contesto: ${decision.context}`)
    if (decision.chosenDecision?.trim()) {
      parts.push(`Decisione presa: ${decision.chosenDecision.trim()}`)
    }
    if (decision.honestMotivations?.trim()) {
      parts.push(`Motivazioni oneste:\n${decision.honestMotivations.trim()}`)
    }
    if (decision.priorities.length) {
      parts.push(
        'Priorità:\n' +
          decision.priorities.map((p) => `- ${p.label} peso ${p.weight}: ${p.note}`).join('\n'),
      )
    }
    if (decision.pros.length) parts.push('Pro: ' + decision.pros.filter(Boolean).join('; '))
    if (decision.cons.length) parts.push('Contro: ' + decision.cons.filter(Boolean).join('; '))
    if (decision.conclusion?.trim()) {
      parts.push(`Conclusione dai dati:\n${decision.conclusion.trim()}`)
    }
    if (decision.aiElaboration?.trim()) {
      parts.push(`Elaborazione AI:\n${decision.aiElaboration.trim()}`)
    }
    if (decision.lucidityAnalysis?.trim()) {
      parts.push(`Analisi di lucidità:\n${decision.lucidityAnalysis.trim()}`)
    }
    if (decision.prayerNotes?.trim()) {
      parts.push(`Appunti di preghiera:\n${decision.prayerNotes.trim()}`)
    }
    if (decision.relatedResources?.length) {
      parts.push(
        'Materiali jw.org già collegati alla decisione:\n' +
          decision.relatedResources
            .slice(0, 12)
            .map((r) => `- ${r.title}${r.bible ? ` [${r.bible}]` : ''}\n  URL: ${r.url}`)
            .join('\n'),
      )
    }
  }
  if (linkedTopics.length) {
    parts.push(
      'Argomenti di studio collegati (base per decidere):\n' +
        linkedTopics
          .map((t) => `- ${t.title}${t.status ? ` (${t.status})` : ''}${t.interest ? `: ${t.interest.slice(0, 160)}` : ''}`)
          .join('\n'),
    )
  }
  if (results.length) {
    parts.push(
      'Materiale jw.org collegato (uniche fonti citabili):\n' +
        results
          .slice(0, 8)
          .map((r) => `- ${r.title}\n  URL: ${r.url}`)
          .join('\n'),
    )
  }
  return parts.join('\n\n')
}

export function createMessage(role: AiMessage['role'], content: string): AiMessage {
  return { id: uid('msg'), role, content, createdAt: new Date().toISOString() }
}
