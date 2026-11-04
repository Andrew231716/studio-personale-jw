import { askAi } from './ai'
import { fetchMediaByLank, searchJw, searchJwDeep } from './jwApi'
import { uid } from './id'
import { extractJwRefs, isMediaLank } from './jwLibrary'
import type { JwResult, MinistryAssistKind, MinistryAssistNote, StudyResource } from '../types'

export const MINISTRY_KIND_LABELS: Record<MinistryAssistKind, string> = {
  riassunto: 'Riassunto articolo',
  schema: 'Schema / conversazione',
  spunto: 'Spunti per conversare',
  scritture: 'Scritture e spiegazioni',
  presentazione: 'Schema presentazione',
}

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
      return `Aiutami a fare un riassunto chiaro e fedele per il ministero sul tema/articolo “${topic}”, basandoti SOLO sugli articoli/video jw.org del contesto.
Struttura:
- Idea centrale (1-2 frasi)
- 3-5 punti principali
- Una scrittura chiave (nome libro TNM italiana)
- Una domanda gentile da fare alla persona
- Un invito semplice a leggere insieme un articolo tra quelli elencati (cita solo titoli presenti)`
    case 'schema':
      return `Crea uno schema / mini struttura per una conversazione di ministero sul tema “${topic}”.
Formato breve, pratico da usare sul campo:
1. Introduzione cordiale (1 frase)
2. Domanda di interesse
3. 2-3 punti con scritture (TNM italiana)
4. Possibile obiezione + risposta breve basata sui materiali jw.org
5. Conclusione / prossimo passo
Usa solo i risultati jw.org del contesto; non inventare link.`
    case 'presentazione':
      return `Crea uno schema per una breve presentazione / conversazione strutturata sul tema “${topic}” (2-4 minuti), basato SOLO sui materiali jw.org del contesto.
Formato:
1. Titolo della presentazione
2. Obiettivo (1 frase)
3. Apertura (gancio + scrittura)
4. Corpo: 3 punti numerati, ciascuno con scrittura e 1-2 frasi di spiegazione
5. Illustrazione semplice (senza inventare citazioni lunghe)
6. Domanda di interesse / applicazione
7. Invito a leggere/guardare insieme un materiale jw.org citato nel contesto
Tono rispettoso e caldo.`
    case 'spunto':
      return `Dammi spunti pratici per conversare con le persone sul tema “${topic}”.
Elenca:
- 4 aperture di conversazione naturali
- 4 domande che fanno riflettere
- 3 illustrazioni semplici (senza inventare citazioni)
- 3 scritture utili (TNM italiana) collegate ai materiali jw.org elencati
Tono rispettoso, caldo, tipico del ministero dei Testimoni di Geova.`
    case 'scritture':
      return `Per il tema “${topic}”, proponi scritture e brevi spiegazioni utili nel ministero.
Per ogni scrittura (3-6):
- Riferimento in forma TNM italiana (es. 2 Corinti, Rivelazione)
- Perché è utile in conversazione (1-2 frasi)
- Come collegarla a un articolo/video presente nel contesto (solo titoli reali)
Non inventare citazioni letterali lunghe.`
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

export async function searchMinistryArticles(params: {
  query: string
  language?: string
}): Promise<JwResult[]> {
  const language = params.language || 'I'
  const query = params.query.trim()
  if (!query) return []
  const deep = await searchJwDeep(`${query} ministero predicazione`, {
    language,
    filters: ['publications', 'videos', 'indexes'],
    maxQueries: 4,
    perSection: 8,
  })
  return deep.flat
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
  const t = (raw || '').trim()
  if (!t || looksLikeUrl(t)) return fallback
  if (/^(finder|open|share)$/i.test(t)) return fallback
  return t.slice(0, 140)
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

  let results: JwResult[] = []
  if (params.focus?.url) {
    const isVideo =
      params.focus.kind === 'video' ||
      Boolean(params.focus.lank && isMediaLank(params.focus.lank))
    const searchQ = focusTitle || topic
    const extra = await searchJw(searchQ, {
      language,
      filter: isVideo ? 'videos' : 'publications',
    }).catch(() => [] as JwResult[])
    results = [
      {
        id: params.focus.docid || params.focus.lank || uid('focus'),
        title: focusTitle || 'Materiale jw.org',
        snippet: params.focus.snippet || '',
        kind: params.focus.kind || (isVideo ? 'video' : 'article'),
        section: params.focus.section || (isVideo ? 'video' : 'articoli'),
        url: params.focus.url,
        lank: params.focus.lank,
        docid: params.focus.docid,
        context: params.focus.context,
      },
      ...extra,
    ]
  } else {
    const deep = await searchJwDeep(`${topic} ministero predicazione`, {
      language,
      filters: ['publications', 'videos', 'indexes'],
      maxQueries: 4,
      perSection: 5,
    })
    results = deep.flat
  }

  const resources = resultsToResources(results)
  const sourceBlock = sourceBlockFromResults(results)
  const labelTopic = focusTitle || topic

  let content = ''
  try {
    content = await askAi({
      prompt: promptForKind(params.kind, labelTopic),
      context: `Tema ministero: ${labelTopic}\nTipo: ${MINISTRY_KIND_LABELS[params.kind]}\n${
        params.focus
          ? `Materiale principale: ${focusTitle || params.focus.title}\nURL: ${params.focus.url}\n${
              params.focus.snippet
                ? `Anteprima/descrizione: ${params.focus.snippet.slice(0, 500)}\n`
                : ''
            }`
          : ''
      }\nFonti jw.org:\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org.'}`,
      allowedUrls: resources.map((r) => r.url),
    })
  } catch {
    content = [
      `Tema: ${labelTopic}`,
      '',
      'Cerca su jw.org articoli aggiornati su questo argomento.',
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
