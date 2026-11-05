import { DECISION_STEPS, STUDY_STEPS } from './studyMethod'
import { JW_ITALIAN_TERM_HINT, normalizeJwItalian } from './jwItalianTerms'
import type { AiMessage, DecisionItem, JwResult, OpenAiModelPref, StudyTopic } from '../types'
import { uid } from './id'
import { useAppStore } from '../store/useAppStore'

export const OPENAI_MODEL_OPTIONS: Array<{ id: OpenAiModelPref; label: string }> = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (veloce, consigliato)' },
  { id: 'gpt-4o', label: 'GPT-4o (più capace)' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'o4-mini', label: 'o4-mini (ragionamento)' },
]

/** Header + campi body per passare la chiave OpenAI al proxy /api/*. */
export function openAiRequestExtras(): {
  headers: Record<string, string>
  apiKey?: string
  model: OpenAiModelPref
} {
  const cfg = useAppStore.getState().settings.openAi
  const apiKey = (cfg?.apiKey || '').trim()
  const model = (cfg?.model || 'gpt-4o-mini') as OpenAiModelPref
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-openai-key'] = apiKey
  return { headers, apiKey: apiKey || undefined, model }
}

export function hasOpenAiKeyConfigured(): boolean {
  return Boolean((useAppStore.getState().settings.openAi?.apiKey || '').trim())
}

const SYSTEM_GROUNDING = `Sei un assistente per lo studio personale dei Testimoni di Geova.
Usi SOLO informazioni e linguaggio tipici di jw.org / JW Library / Traduzione del Nuovo Mondo (italiano).

## Fonti (obbligatorio)
- Basa consigli e collegamenti ESCLUSIVAMENTE sui risultati di ricerca jw.org forniti nel contesto.
- Puoi citare SOLO titoli e URL presenti in quel contesto. Non inventare articoli, video, docid o link.
- Se i risultati non bastano, dillo chiaramente e invita a cercare su jw.org / JW Library. Non colmare i vuoti con invenzioni.
- Non inventare citazioni letterali della Bibbia o delle pubblicazioni. Puoi parafrasare principi in modo generale e rimandare alle fonti elencate.
- Per i riferimenti biblici, usa ESATTAMENTE i nomi dei libri della TNM italiana (come su jw.org), non quelli di altre traduzioni.

## Terminologia (italiano JW — usa solo queste forme)
${JW_ITALIAN_TERM_HINT}
Controllo anti-sbaglio frequente: non scrivere mai «ministeriale»; scrivi «ministero» / «nel ministero» / «di ministero».
Usa anche:
- congregazione, territorio, anziani, servi di ministero
- adunanze di congregazione, Riunione Vita e Ministero cristiano, assemblea di circoscrizione / di zona
- campo, predicazione, ministero, studio biblico, discepolato
- Geova, Gesù Cristo, Regno, verità biblica
NON inventare nomi di riunioni, programmi, organizzazioni o luoghi (es. niente termini inventati tipo “Papa-Si-si’m”, “fratelli-di-perfezione”, chiese o gruppi inesistenti, “Washington New Life”, ecc.).
Se non conosci il nome esatto di un’adunanza o pubblicazione, usa una descrizione generica corretta (“adunanze di congregazione”, “articolo su jw.org”) oppure rimanda ai risultati forniti.

## Specificità sul contenuto dell’utente (obbligatorio)
- Quando chiedono obiettivi, riflessioni, domande o pratiche, ancorali al materiale, alle note o alla trascrizione forniti: cita temi, esempi o consigli concreti del contesto.
- Evita formule vuote («Capire meglio», «Applicare nella vita quotidiana», «Crescere spiritualmente») se non le colleghi a un punto specifico del materiale.
- Se il contesto è scarso, dillo e resta sul titolo/note disponibili invece di inventare contenuti.

## Stile della risposta
- Italiano chiaro, rispettoso, caldo e pratico, come nelle pubblicazioni JW.
- Struttura preferita: Preghiera → Obiettivi → Materiale da jw.org per sezione (Articoli, Libri, Opuscoli, Video, Guida alle ricerche, Indici, ecc. — solo fonti del contesto) → Riflessione → Applicazione.
- Quando elenchi materiale jw.org, raggruppalo per sezione come nel contesto.
- Per le decisioni: priorità, principi, pro/contro, conclusione basata su ciò che dice l’utente e sulle fonti elencate.
- Non sostituisci la Bibbia, gli anziani né la coscienza personale.
- Evita toni burocratici, slang e frasi che non suonano da pubblicazioni JW.`

export async function askAi(params: {
  prompt: string
  history?: AiMessage[]
  context?: string
  allowedUrls?: string[]
}): Promise<string> {
  const { prompt, history = [], context = '', allowedUrls = [] } = params
  try {
    const remote = await askRemoteAi(prompt, history, context)
    if (remote?.trim()) return enforceGrounding(remote.trim(), allowedUrls)
  } catch (e) {
    // Con chiave OpenAI configurata, non nascondere l’errore dietro il coach locale.
    if (hasOpenAiKeyConfigured()) {
      const detail = e instanceof Error ? e.message : 'OpenAI non disponibile'
      return normalizeJwItalian(
        `Non riesco a usare ChatGPT al momento.\n\n${detail}\n\nControlla la chiave in Impostazioni → ChatGPT / OpenAI, oppure riprova tra poco.`,
      )
    }
  }
  return normalizeJwItalian(localCoach(prompt, context))
}

async function askRemoteAi(
  prompt: string,
  history: AiMessage[],
  context: string,
): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_GROUNDING + (context ? `\n\n## Contesto affidabile\n${context}` : '\n\n## Contesto affidabile\nNessun risultato jw.org disponibile: non inventare titoli né link.') },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    {
      role: 'user',
      content:
        prompt +
        '\n\n(Ricorda: usa solo i risultati jw.org del contesto; terminologia JW corretta; niente nomi inventati.)',
    },
  ]

  const extras = openAiRequestExtras()
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: extras.headers,
    body: JSON.stringify({
      messages,
      model: extras.apiKey ? extras.model : 'openai',
      temperature: 0.25,
      // Evita risposte tagliate a metà (sintesi lunghe / analisi decisioni).
      max_tokens: 3500,
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
