import { DECISION_STEPS, STUDY_STEPS } from './studyMethod'
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
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite (consigliato, meno saturo)' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

export const AI_PROVIDER_OPTIONS: Array<{ id: AiProviderPref; label: string }> = [
  { id: 'free', label: 'Gratuito (consigliato)' },
  { id: 'gemini', label: 'Google Gemini (con chiave free)' },
]

function readAiSettings(): AiSettings {
  const s = useAppStore.getState().settings
  const legacy = s.openAi
  const cur = s.ai
  const providerRaw = cur?.provider || legacy?.provider || 'free'
  const provider: AiProviderPref = providerRaw === 'gemini' ? 'gemini' : 'free'
  return {
    provider,
    geminiApiKey: (cur?.geminiApiKey || legacy?.geminiApiKey || '').trim(),
    geminiModel: cur?.geminiModel || legacy?.geminiModel || 'gemini-2.0-flash-lite',
  }
}

/** Output token sempre bassi (piano free / risparmio). */
export const AI_MAX_OUT_TOKENS = 512
const CONTEXT_CHAR_LIMIT = 2800
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
  geminiApiKey?: string
  model: string
} {
  const cfg = readAiSettings()
  const provider = cfg.provider || 'free'
  const geminiApiKey = (cfg.geminiApiKey || '').trim()
  const geminiModel = (cfg.geminiModel || 'gemini-2.0-flash-lite') as GeminiModelPref

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-ai-provider': provider,
  }
  // Chiave anche in header; il body la ripete (più affidabile su alcuni proxy).
  if (geminiApiKey) headers['x-gemini-key'] = geminiApiKey

  return {
    headers,
    provider,
    geminiApiKey: geminiApiKey || undefined,
    model: geminiModel,
  }
}

/** @deprecated usa aiRequestExtras */
export function openAiRequestExtras() {
  return aiRequestExtras()
}

export function getAiProvider(): AiProviderPref {
  return readAiSettings().provider || 'free'
}

export function hasGeminiKeyConfigured(): boolean {
  return Boolean(readAiSettings().geminiApiKey)
}

export function formatGeminiUserError(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Gemini non disponibile'
  const lower = detail.toLowerCase()
  if (/api key not valid|invalid.*api.?key|permission.?denied|403/.test(lower)) {
    return [
      'La chiave Gemini non è valida o non ha accesso al modello.',
      '',
      'Crea una nuova chiave free su https://aistudio.google.com/apikey e aggiornala in Impostazioni → Motore AI.',
      '',
      `Dettaglio: ${detail}`,
    ].join('\n')
  }
  if (
    /high demand|spikes in demand|try again later|unavailable|overloaded|quota|rate.?limit|429|resource.?exhausted|503/.test(
      lower,
    )
  ) {
    return [
      'Gemini in questo momento è saturo (alta domanda sul modello). Di solito passa in pochi minuti.',
      '',
      'Riprova tra poco. Se serve subito, in Impostazioni → Motore AI imposta il provider su «Gratuito» (senza forzare solo Gemini).',
      '',
      `Dettaglio: ${detail}`,
    ].join('\n')
  }
  if (/manca la chiave/.test(lower)) {
    return [
      'Hai scelto Gemini ma manca la chiave API.',
      '',
      'Inseriscila in Impostazioni → Motore AI, oppure imposta il provider su «Gratuito».',
    ].join('\n')
  }
  return [
    'Non riesco a usare Gemini al momento.',
    '',
    detail,
    '',
    'Controlla la chiave in Impostazioni → Motore AI, oppure riprova tra poco.',
  ].join('\n')
}

/** Prova minima Gemini/motore free (pochi token) — utile da Impostazioni. */
export async function probeAiEngine(): Promise<{ ok: boolean; engine: string; text: string }> {
  const extras = aiRequestExtras()
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: extras.headers,
    body: JSON.stringify({
      provider: extras.provider,
      model: extras.model,
      geminiApiKey: extras.geminiApiKey,
      temperature: 0,
      max_tokens: 24,
      messages: [
        {
          role: 'system',
          content: 'Rispondi solo con una parola.',
        },
        { role: 'user', content: 'Scrivi solo: OK' },
      ],
    }),
  })
  const raw = await res.text()
  if (!res.ok) {
    return { ok: false, engine: extras.provider, text: raw.trim() || `HTTP ${res.status}` }
  }
  try {
    const json = JSON.parse(raw) as {
      engine?: string
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = json.choices?.[0]?.message?.content?.trim() || raw
    return { ok: Boolean(text), engine: json.engine || extras.provider, text }
  } catch {
    return { ok: Boolean(raw.trim()), engine: extras.provider, text: raw.trim() }
  }
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
  requireRemote?: boolean
}): Promise<string> {
  const { prompt, history = [], context = '', allowedUrls = [] } = params
  const wantGemini =
    hasGeminiKeyConfigured() || readAiSettings().provider === 'gemini'
  try {
    const remote = await askRemoteAi(prompt, history, context, params.signal)
    if (remote?.trim()) return enforceGrounding(remote.trim(), allowedUrls)
    if (params.requireRemote) throw new Error('Risposta AI vuota')
  } catch (e) {
    if (params.requireRemote) throw e
    // Con Gemini configurato non nascondere il guasto dietro il coach locale.
    if (wantGemini) {
      return normalizeJwItalian(formatGeminiUserError(e))
    }
  }
  return normalizeJwItalian(localCoach(prompt, context))
}

async function askRemoteAi(
  prompt: string,
  history: AiMessage[],
  context: string,
  signal?: AbortSignal,
): Promise<string> {
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

  const extras = aiRequestExtras()
  const res = await fetch('/api/ai', {
    method: 'POST',
    signal,
    headers: extras.headers,
    body: JSON.stringify({
      messages,
      provider: extras.provider,
      model: extras.model,
      // Chiave anche nel body: alcuni ambienti non inoltrano header custom.
      geminiApiKey: extras.geminiApiKey,
      temperature: 0.25,
      max_tokens: AI_MAX_OUT_TOKENS,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText.trim() || `AI HTTP ${res.status}`)
  }
  const text = await res.text()
  try {
    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>
      engine?: string
    }
    const content = json.choices?.[0]?.message?.content
    if (content) return content
  } catch {
    // plain text
  }
  return text
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

function localCoach(prompt: string, context: string): string {
  const lower = prompt.toLowerCase()
  const steps =
    lower.includes('decision') || lower.includes('scelta') || lower.includes('decid')
      ? DECISION_STEPS
      : STUDY_STEPS

  const stepBlock = steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.detail}`).join('\n')

  let focus = 'studio personale'
  if (lower.includes('pregh')) focus = 'preghiera e dipendenza da Geova'
  if (lower.includes('ans') || lower.includes('preoccup')) focus = 'pace interiore e fiducia'
  if (lower.includes('famigl')) focus = 'famiglia e priorità'
  if (lower.includes('minister') || lower.includes('predica') || lower.includes('campo'))
    focus = 'ministero e amore per le persone'
  if (lower.includes('congreg') || lower.includes('territor') || lower.includes('adunanz'))
    focus = 'congregazione, territorio e adunanze'

  const sourceHint = context.includes('jw.org')
    ? 'Consulta i risultati jw.org elencati nel contesto (solo quei titoli) e aprili in JW Library o sul sito.'
    : 'Cerca su jw.org / JW Library titoli aggiornati sul tema, poi torna qui con i titoli trovati.'

  return [
    `Ecco un aiuto strutturato (modalità locale) sul tema “${focus}”.`,
    '',
    context ? `Contesto:\n${context}\n` : '',
    'Percorso consigliato, nello spirito dei consigli tipici di jw.org:',
    stepBlock,
    '',
    'Per elaborare la tua risposta:',
    '1. Scrivi in 2-3 frasi cosa senti davvero.',
    '2. Collega ogni frase a un principio o a un articolo/video reale trovato su jw.org.',
    '3. Scegli una sola azione pratica da provare entro 48 ore (es. parlare con gli anziani, partecipare alle adunanze, studiare un articolo).',
    '4. Chiudi con una preghiera breve e specifica.',
    '',
    sourceHint,
    '',
    `La tua richiesta: “${prompt.trim()}”`,
  ]
    .filter(Boolean)
    .join('\n')
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
