import { askAi } from './ai'
import { fetchMediaByLank, searchJw, searchJwDeep } from './jwApi'
import { uid } from './id'
import { extractJwRefs, isMediaLank } from './jwLibrary'
import {
  MINISTRY_CORE_SOURCES,
  ministryCoreBoost,
  ministryCoreSourcesPromptBlock,
  ministrySourceQueries,
} from './ministrySources'
import type { JwResult, MinistryAssistKind, MinistryAssistNote, StudyResource } from '../types'

export { MINISTRY_CORE_SOURCES } from './ministrySources'

/** Etichette corte, chiare in UI. */
export const MINISTRY_KIND_LABELS: Record<MinistryAssistKind, string> = {
  schema: 'Conversazione',
  presentazione: 'Presentazione breve',
  riassunto: 'Riassunto',
  spunto: 'Idee per iniziare',
  scritture: 'Scritture utili',
}

/** Una riga: cosa ottieni e quando usarlo. */
export const MINISTRY_KIND_HELP: Record<MinistryAssistKind, string> = {
  schema:
    'Traccia di predicazione (territorio): saluto, domanda, 2-3 punti, obiezione, invito.',
  presentazione:
    'Testo da dire in 2–4 minuti a una persona interessata (ritorno / studio). Non è un PowerPoint.',
  riassunto: 'In sintesi: cosa dice l’articolo/tema + una domanda e un invito a leggere insieme.',
  spunto: 'Aperture, domande e illustrazioni per iniziare una conversazione di predicazione.',
  scritture: 'Versetti pronti con perché usarli nella predicazione e come collegarli.',
}

/** Ordine mostrato in Ministero (dal più usato). */
export const MINISTRY_KIND_ORDER: MinistryAssistKind[] = [
  'schema',
  'presentazione',
  'riassunto',
  'spunto',
  'scritture',
]

export const MINISTRY_SUGGESTIONS = [
  'Regno di Dio',
  'speranza della risurrezione',
  'perché esiste la sofferenza',
  'chi è Geova',
  'nome di Dio',
  'fine di questo sistema',
  'famiglia',
  'preghiera',
  'cosa succede quando si muore',
  'paradiso terrestre',
  'chi sono i Testimoni di Geova',
  'come si svolge uno studio biblico',
]

/**
 * Vocabolario predicazione pubblica (stile jw.org), non linguaggio interno di congregazione.
 * @see https://www.jw.org — ministero / predicazione / territorio
 */
const PREACHING_VOCAB = `Contesto obbligatorio — PREDICAZIONE / MINISTERO:
- Parli a PERSONE DEL TERRITORIO (pubblico, case, strade, ritorni, studi biblici), NON a fratelli o sorelle.
- Usa vocaboli tipici di jw.org: predicazione, ministero, territorio, conversazione nel ministero, persona interessata, ritorno, studio biblico, pubblicazione, opuscolo, articolo, video, Buona notizia, Regno di Dio, Geova.
- Rivolgiti così: «la persona», «chi ascolta», «lei/lui» — MAI «fratello», «sorella», «carissimo», tono da adunanza.
- Obiettivo: condividere la Buona notizia e, se opportuno, invitare a leggere/guardare insieme un materiale jw.org.`

const READY_RULES = `Regole obbligatorie:
- Scrivi UNA scheda PRONTA DA USARE nella predicazione (italiano chiaro, frasi brevi).
- Formato “Tu dici: …” per le frasi da pronunciare; niente discorsi meta (“ecco uno schema”, “mi dispiace”, “non ho il contenuto”).
- Ancorati alle fonti ufficiali del contesto (Ama le persone / Ragioniamo / Traete beneficio / Applicati / Efficaci nel ministero / video Ministero).
- Usa SOLO i materiali jw.org del contesto; cita titoli reali; non inventare link.
- Niente citazioni bibliche lunghe: solo riferimento (TNM italiana) + 1 frase di senso.
- Massimo ~180-220 parole.
${PREACHING_VOCAB}`

function resultsToResources(results: JwResult[]): StudyResource[] {
  return results.slice(0, 10).map((r) => ({
    id: uid('res'),
    title: r.title,
    url: r.url,
    kind: r.kind,
    notes: [r.context, r.snippet].filter(Boolean).join(' — '),
    lank: r.lank,
    docid: r.docid,
    wolUrl: r.wolUrl,
  }))
}

function promptForKind(kind: MinistryAssistKind, topic: string): string {
  switch (kind) {
    case 'riassunto':
      return `${READY_RULES}

Prepara un RIASSUNTO per la predicazione sul tema/articolo “${topic}”.

Usa esattamente queste intestazioni:
## In una frase
## Punti da ricordare
(3-5 bullet)
## Scrittura chiave
## Domanda alla persona
## Invito
(cita un titolo jw.org del contesto da leggere/guardare insieme)`
    case 'schema':
      return `${READY_RULES}

Prepara una CONVERSAZIONE DI PREDICAZIONE sul tema “${topic}” (circa 2 minuti, territorio / persona del pubblico).

Usa esattamente queste intestazioni:
## Saluto
Tu dici: …
## Domanda di interesse
Tu dici: …
## Due punti (con scrittura)
1. … (Scrittura)
2. … (Scrittura)
## Se la persona obietta
Persona: …
Tu dici: …
## Chiusura / invito
Tu dici: … + invito a un materiale jw.org del contesto`
    case 'presentazione':
      return `${READY_RULES}

Prepara una PRESENTAZIONE BREVE di predicazione da dire a voce (2–4 minuti) a una persona interessata sul tema “${topic}”.
È un testo da seguire, non slide.

Usa esattamente queste intestazioni:
## Titolo
## Obiettivo (1 frase)
## Apertura
Tu dici: … (gancio + scrittura)
## Corpo
1. … — Scrittura: …
2. … — Scrittura: …
3. … — Scrittura: …
## Illustrazione semplice
## Domanda
Tu dici: …
## Invito
Tu dici: … (titolo jw.org reale del contesto)`
    case 'spunto':
      return `${READY_RULES}

Prepara IDEE PRONTE per iniziare una conversazione di predicazione su “${topic}”.

Usa esattamente queste intestazioni:
## Aperture (scegline una)
1. Tu dici: …
2. Tu dici: …
3. Tu dici: …
4. Tu dici: …
## Domande
1-4
## Illustrazioni rapide
1-3
## Scritture utili
(3, con 1 frase ciascuna + titolo jw.org collegato se c’è)`
    case 'scritture':
      return `${READY_RULES}

Prepara SCRITTURE UTILI per la predicazione sul tema “${topic}”.

Per 4-5 scritture, usa questo formato ripetuto:
### [Riferimento TNM]
Perché (nella predicazione): …
Tu puoi dire alla persona: …
Collegamento: [titolo jw.org del contesto, se c’è]`
  }
}

function sourceBlockFromResults(results: JwResult[]): string {
  return results
    .slice(0, 12)
    .map((r) => {
      const snip = r.snippet ? ` — ${r.snippet.slice(0, 160)}` : ''
      return `- ${r.title}${r.context ? ` (${r.context})` : ''}${snip}\n  URL: ${r.url}`
    })
    .join('\n')
}

function resultKey(r: JwResult): string {
  return `${r.docid || ''}|${r.lank || ''}|${r.url}`
}

function mergeRankedMinistryResults(batches: JwResult[][]): JwResult[] {
  const map = new Map<string, JwResult>()
  for (const batch of batches) {
    for (const r of batch) {
      const key = resultKey(r)
      const prev = map.get(key)
      if (!prev || ministryCoreBoost(r) > ministryCoreBoost(prev)) {
        map.set(key, r)
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => ministryCoreBoost(b) - ministryCoreBoost(a))
}

/** Ricerca tema + fonti ufficiali (Ragioniamo, LMD, Guida, video, …). */
async function gatherMinistryResults(params: {
  topic: string
  language: string
  focus?: Pick<JwResult, 'title' | 'url' | 'snippet' | 'context' | 'lank' | 'docid' | 'kind' | 'section'>
}): Promise<JwResult[]> {
  const { topic, language, focus } = params
  const batches: JwResult[][] = []

  if (focus?.url) {
    batches.push([
      {
        id: focus.docid || focus.lank || uid('focus'),
        title: focus.title,
        snippet: focus.snippet || '',
        kind: focus.kind || 'article',
        section: focus.section || (focus.kind === 'video' ? 'video' : 'articoli'),
        url: focus.url,
        lank: focus.lank,
        docid: focus.docid,
        context: focus.context,
      },
    ])
  }

  const deep = await searchJwDeep(`${topic} ministero predicazione`, {
    language,
    filters: ['publications', 'videos', 'indexes'],
    maxQueries: 4,
    perSection: 6,
  }).catch(() => null)
  if (deep?.flat.length) batches.push(deep.flat)

  const targeted = ministrySourceQueries(topic).slice(0, 5)
  const targetedHits = await Promise.all(
    targeted.map((q) =>
      searchJw(q, { language, filter: 'publications' }).catch(() => [] as JwResult[]),
    ),
  )
  batches.push(...targetedHits)

  const videoHits = await searchJw(`${topic} ministero`, {
    language,
    filter: 'videos',
  }).catch(() => [] as JwResult[])
  if (videoHits.length) batches.push(videoHits)

  return mergeRankedMinistryResults(batches).slice(0, 16)
}

export async function searchMinistryArticles(params: {
  query: string
  language?: string
}): Promise<JwResult[]> {
  const language = params.language || 'I'
  const query = params.query.trim()
  if (!query) return []
  return gatherMinistryResults({ topic: query, language })
}

const GENERIC_SLUGS = new Set([
  'finder',
  'open',
  'share',
  'index',
  'home',
  'it',
  'en',
  'es',
  'fr',
  'de',
  'biblioteca',
  'biblioteca-digitale',
  'library',
  'articoli',
  'articles',
  'video',
  'videos',
  'media',
])

function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || /jw\.org/i.test(s) || /^www\./i.test(s)
}

function humanizeUrlSlug(raw: string): string {
  try {
    const u = new URL(raw, 'https://www.jw.org')
    const parts = u.pathname.split('/').filter(Boolean)
    for (let i = parts.length - 1; i >= 0; i--) {
      const cleaned = decodeURIComponent(parts[i])
        .replace(/\.(html?|xhtml)$/i, '')
        .replace(/[-_+]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (cleaned.length < 4) continue
      if (GENERIC_SLUGS.has(cleaned.toLowerCase())) continue
      if (/^\d+$/.test(cleaned)) continue
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
  } catch {
    /* ignore */
  }
  return ''
}

function sameDocOrUrl(a: JwResult, url: string, docid?: string): boolean {
  if (docid && a.docid && a.docid === docid) return true
  const norm = (s: string) => s.replace(/\/+$/, '').toLowerCase()
  try {
    return norm(a.url) === norm(url) || (a.wolUrl ? norm(a.wolUrl) === norm(url) : false)
  } catch {
    return false
  }
}

/** Titolo sicuro per schede: mai URL grezzi o «Finder». */
export function ministryDisplayTitle(raw?: string | null, fallback = 'Materiale jw.org'): string {
  let t = (raw || '').trim()
  if (!t || looksLikeUrl(t)) return fallback
  if (/^(finder|open|share)$/i.test(t)) return fallback
  // Titoli vecchi: «Schema / conversazione: …» → etichetta attuale
  t = t
    .replace(/^Schema\s*\/\s*conversazione\s*:\s*/i, 'Conversazione: ')
    .replace(/^Schema presentazione\s*:\s*/i, 'Presentazione breve: ')
    .replace(/^Riassunto articolo\s*:\s*/i, 'Riassunto: ')
    .replace(/^Spunti per conversare\s*:\s*/i, 'Idee per iniziare: ')
    .replace(/^Scritture e spiegazioni\s*:\s*/i, 'Scritture utili: ')
  return t.slice(0, 140)
}

/** Riduce indirizzi da congregazione in schede di predicazione. */
function polishPreachingVoice(text: string): string {
  return text
    .replace(/\bCaro(?:\s+fratello|\s+sorella)\b/gi, 'Buongiorno')
    .replace(/\b(?:Fratello|Sorella)\s+[A-ZÀ-Ü][\wÀ-ÿ'-]*/g, 'la persona')
    .replace(/\bai fratelli e (?:alle )?sorelle\b/gi, 'alle persone del territorio')
    .replace(/\bfratelli e sorelle\b/gi, 'persone del territorio')
    .replace(/\b(?:il |un |questo )?fratello\b/gi, 'la persona')
    .replace(/\b(?:la |una |questa )?sorella\b/gi, 'la persona')
}

async function resolveViaPageApi(
  input: string,
  language: string,
  docid?: string,
): Promise<JwResult | null> {
  const params = new URLSearchParams({ language })
  if (docid) params.set('docid', docid)
  else params.set('url', input)
  try {
    const { readApiJson } = await import('./apiJson')
    const res = await fetch(`/api/jw-resolve?${params.toString()}`)
    const data = await readApiJson<{
      title?: string
      snippet?: string
      url?: string
      docid?: string
      kind?: string
      error?: string
    }>(res, 'Impossibile risolvere il link jw.org')
    const title = ministryDisplayTitle(data.title)
    if (!title || title === 'Materiale jw.org') return null
    const isVideo = data.kind === 'video'
    return {
      id: data.docid || docid || uid('link'),
      title,
      snippet: data.snippet || '',
      kind: isVideo ? 'video' : 'article',
      section: isVideo ? 'video' : 'articoli',
      url:
        data.url ||
        (docid
          ? `https://www.jw.org/finder?wtlocale=${encodeURIComponent(language)}&docid=${encodeURIComponent(docid)}&srcid=share`
          : input),
      docid: data.docid || docid,
    }
  } catch {
    return null
  }
}

/**
 * Risolve un link jw.org / codice lank in un materiale usabile per creare
 * schema, riassunto o spunti nel Ministero.
 */
export async function resolveMinistryLink(
  raw: string,
  language = 'I',
): Promise<JwResult> {
  const input = raw.trim()
  if (!input) throw new Error('Incolla un link jw.org (video o articolo) oppure un codice lank.')

  const refs = extractJwRefs(input)
  const lankCandidate = refs.lank || (isMediaLank(input) ? input.trim() : '')

  if (lankCandidate && isMediaLank(lankCandidate)) {
    const media = await fetchMediaByLank(lankCandidate, language)
    return {
      id: media.lank || lankCandidate,
      title: media.title || 'Video JW',
      snippet: media.description || '',
      kind: 'video',
      section: 'video',
      url: media.url,
      lank: media.lank || lankCandidate,
      duration: media.duration,
      image: media.image,
    }
  }

  const looksUrl = looksLikeUrl(input)
  if (!looksUrl && !refs.docid && !refs.pub) {
    throw new Error(
      'Serve un link jw.org di un video o di un articolo, oppure un codice video (es. pub-…_VIDEO).',
    )
  }

  const url = /^https?:\/\//i.test(input)
    ? input
    : refs.docid
      ? `https://www.jw.org/finder?wtlocale=${encodeURIComponent(language)}&docid=${encodeURIComponent(refs.docid)}&srcid=share`
      : refs.pub
        ? `https://www.jw.org/open?pub=${encodeURIComponent(refs.pub)}&prefer=lang&wtlocale=${encodeURIComponent(language)}`
        : `https://${input.replace(/^\/+/, '')}`

  // 1) Pagina reale (finder?docid=… → titolo articolo)
  const fromPage = await resolveViaPageApi(url, language, refs.docid)
  if (fromPage) return fromPage

  // 2) Ricerca jw.org con slug utile (non «Finder»)
  const titleHint = humanizeUrlSlug(url)
  const queries = [titleHint, refs.docid, refs.pub].filter(Boolean) as string[]
  let hits: JwResult[] = []
  for (const q of queries.slice(0, 2)) {
    if (/^(finder|open)$/i.test(q)) continue
    const found = await searchJw(q, { language, filter: 'publications' }).catch(
      () => [] as JwResult[],
    )
    if (found.length) {
      hits = found
      break
    }
  }

  const match =
    hits.find((h) => sameDocOrUrl(h, url, refs.docid)) ||
    hits.find((h) =>
      titleHint.length >= 6
        ? h.title.toLowerCase().includes(titleHint.toLowerCase().slice(0, 24))
        : false,
    ) ||
    (refs.docid ? hits.find((h) => h.docid === refs.docid) : undefined) ||
    hits[0]

  if (match) {
    return {
      ...match,
      title: ministryDisplayTitle(match.title, titleHint || 'Articolo jw.org'),
      url: match.url || url,
      docid: match.docid || refs.docid,
      wolUrl: match.wolUrl || (/wol\.jw\.org/i.test(url) ? url : match.wolUrl),
    }
  }

  const fallbackTitle =
    titleHint || (refs.docid ? `Articolo jw.org (${refs.docid})` : 'Articolo jw.org')
  return {
    id: refs.docid || refs.pub || uid('link'),
    title: fallbackTitle,
    snippet: '',
    kind: 'article',
    section: 'articoli',
    url,
    docid: refs.docid,
    wolUrl: /wol\.jw\.org/i.test(url) ? url : undefined,
  }
}

export async function buildMinistryAssist(params: {
  kind: MinistryAssistKind
  topic: string
  language?: string
  /** Se presente, centra il riassunto/schema su questo materiale */
  focus?: Pick<JwResult, 'title' | 'url' | 'snippet' | 'context' | 'lank' | 'docid' | 'kind' | 'section'>
}): Promise<MinistryAssistNote> {
  const language = params.language || 'I'
  const focusTitle = ministryDisplayTitle(params.focus?.title, '')
  const topicRaw = params.topic.trim()
  const topic = ministryDisplayTitle(
    looksLikeUrl(topicRaw) ? '' : topicRaw,
    focusTitle || 'Tema ministero',
  )

  const results = await gatherMinistryResults({
    topic: focusTitle || topic,
    language,
    focus: params.focus
      ? {
          ...params.focus,
          title: focusTitle || params.focus.title,
        }
      : undefined,
  })

  const resources = resultsToResources(results)
  const sourceBlock = sourceBlockFromResults(results)
  const labelTopic = focusTitle || topic

  let content = ''
  try {
    content = polishPreachingVoice(
      await askAi({
        prompt: promptForKind(params.kind, labelTopic),
        context: `Sezione: Ministero / predicazione (persone del territorio, non fratelli/sorelle).\nTema: ${labelTopic}\nTipo scheda: ${MINISTRY_KIND_LABELS[params.kind]}\n${
          params.focus
            ? `Materiale principale: ${focusTitle || params.focus.title}\nURL: ${params.focus.url}\n${
                params.focus.snippet
                  ? `Anteprima/descrizione: ${params.focus.snippet.slice(0, 500)}\n`
                  : ''
              }`
            : ''
        }\n${ministryCoreSourcesPromptBlock()}\n\nRisultati jw.org (privilegia quelli delle fonti ufficiali sopra):\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org le pubblicazioni elencate.'}\n${PREACHING_VOCAB}`,
        allowedUrls: resources.map((r) => r.url),
      }),
    )
  } catch {
    content = [
      `Tema: ${labelTopic}`,
      '',
      'Consulta su jw.org / JW Library:',
      ...MINISTRY_CORE_SOURCES.map((s) => `- ${s.title}`),
      '',
      'Prepara: 1 scrittura, 1 punto principale, 1 domanda gentile, 1 invito a leggere insieme.',
    ].join('\n')
  }

  return {
    id: uid('min'),
    title: `${MINISTRY_KIND_LABELS[params.kind]}: ${labelTopic}`.slice(0, 120),
    kind: params.kind,
    topic: labelTopic,
    content,
    resources,
    sourceTitle: focusTitle || undefined,
    sourceUrl: params.focus?.url,
    createdAt: new Date().toISOString(),
  }
}
