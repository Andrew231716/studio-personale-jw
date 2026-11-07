import { readApiJson } from './apiJson'
import type { ContentKind, JwDeepSearchResult, JwResult } from '../types'
import { bibleOpenUrl, parseScriptureLabel } from './bibleRefs'
import {
  extractJwRefs,
  buildJwLibraryShareLink,
  isMediaLank,
  publicationSymbol,
} from './jwLibrary'
import { classifySection, groupResultsBySection, sectionToKind } from './jwSections'
import {
  buildThematicQueries,
  looksLikeScriptureQuery,
  scoreThemeMatch,
} from './jwThemeSearch'
import { formatTranscriptWithTimestamps, parseVtt, type VttCue } from './vtt'

let cachedToken = ''
let tokenFetchedAt = 0
let tokenRequest: Promise<string> | undefined

async function getToken(): Promise<string> {
  const fresh = Date.now() - tokenFetchedAt < 50 * 60 * 1000
  if (cachedToken && fresh) return cachedToken
  tokenRequest ??= fetch('/api/jw-token', { signal: AbortSignal.timeout(8_000) })
    .then(async (res) => {
      if (!res.ok) throw new Error('Impossibile ottenere il token di ricerca jw.org')
      cachedToken = (await res.text()).trim()
      tokenFetchedAt = Date.now()
      return cachedToken
    })
    .finally(() => { tokenRequest = undefined })
  return tokenRequest
}

function mapKindLegacy(subtype?: string, layoutHints: string[] = []): ContentKind {
  const section = classifySection({ subtype, layoutHints })
  return sectionToKind(section, subtype)
}

function flattenResults(payload: Record<string, unknown>): JwResult[] {
  const out: JwResult[] = []
  const layout = Array.isArray(payload.layout) ? (payload.layout as string[]) : []
  const top = Array.isArray(payload.results) ? payload.results : []

  for (const entry of top as Array<Record<string, unknown>>) {
    const groupLayout = Array.isArray(entry.layout) ? (entry.layout as string[]) : layout
    const groupLabel = entry.label ? stripHtml(String(entry.label)) : undefined
    const items =
      entry.type === 'group' && Array.isArray(entry.results)
        ? (entry.results as Array<Record<string, unknown>>)
        : entry.type === 'item'
          ? [entry]
          : []

    for (const item of items) {
      if (item.type && item.type !== 'item') continue
      const links = (item.links || {}) as Record<string, string>
      const jwUrl = links['jw.org'] || ''
      const wolUrl = links.wol || ''
      const image = (item.image as { url?: string } | undefined)?.url
      const rawLank = item.lank ? String(item.lank) : undefined
      const refs = extractJwRefs(jwUrl)
      const wolRefs = extractJwRefs(wolUrl)
      const lank = [rawLank, refs.lank, wolRefs.lank].find(isMediaLank)
      let docid = refs.docid || wolRefs.docid
      if (!docid && rawLank) {
        const nested = rawLank.match(/^pa-(\d{6,})$/i)
        if (nested) docid = nested[1]
      }
      const pub =
        refs.pub ||
        wolRefs.pub ||
        publicationSymbol(rawLank) ||
        publicationSymbol(refs.lank) ||
        publicationSymbol(wolRefs.lank)
      // Preferisci sempre un open link jw.org (apribile anche in JW Library)
      const url =
        jwUrl ||
        (docid
          ? `https://www.jw.org/open?docid=${encodeURIComponent(docid)}&prefer=lang&wtlocale=I`
          : '') ||
        (lank
          ? `https://www.jw.org/open?item=${encodeURIComponent(lank)}&prefer=lang&wtlocale=I`
          : '') ||
        (pub
          ? `https://www.jw.org/open?pub=${encodeURIComponent(pub)}&prefer=lang&wtlocale=I`
          : '') ||
        wolUrl
      if (!url) continue
      const subtype = item.subtype ? String(item.subtype) : undefined
      const context = item.context ? stripHtml(String(item.context)) : undefined
      const section = classifySection({
        subtype,
        context,
        groupLabel,
        layoutHints: groupLayout,
      })
      const insight = item.insight as { rank?: number } | undefined
      out.push({
        id: String(lank || docid || pub || item.title || uidFallback()),
        title: stripHtml(String(item.title || 'Senza titolo')),
        snippet: stripHtml(String(item.snippet || '')),
        kind: sectionToKind(section, subtype) || mapKindLegacy(subtype, groupLayout),
        section,
        url,
        wolUrl: wolUrl || undefined,
        lank,
        docid,
        image,
        duration: item.duration ? String(item.duration) : undefined,
        context,
        subtype,
        rank: typeof insight?.rank === 'number' ? insight.rank : undefined,
      })
    }
  }
  return out
}

function uidFallback() {
  return `jw_${Math.random().toString(36).slice(2, 9)}`
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

export type JwSearchFilter =
  | 'all'
  | 'publications'
  | 'videos'
  | 'audio'
  | 'bible'
  | 'indexes'

export async function searchJw(
  query: string,
  opts: { language?: string; filter?: JwSearchFilter | string } = {},
): Promise<JwResult[]> {
  const q = query.trim()
  if (!q) return []
  const language = opts.language || 'I'
  const filter = opts.filter || 'all'
  const token = await getToken()
  const url = `/api/jw-search?language=${encodeURIComponent(language)}&filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`Ricerca jw.org non riuscita (${res.status})`)
  const data = (await res.json()) as Record<string, unknown>
  return flattenResults(data)
}

/**
 * Ricerca approfondita: più query tematiche + filtri del sito (anche Bibbia),
 * punteggio stretto sul tema dell’utente e risultati divisi per sezione.
 */
export async function searchJwDeep(
  userText: string,
  opts: {
    language?: string
    /** Filtri API da interrogare in parallelo */
    filters?: JwSearchFilter[]
    maxQueries?: number
    perSection?: number
    minThemeScore?: number
  } = {},
): Promise<JwDeepSearchResult> {
  const language = opts.language || 'I'
  const scriptureQuery = looksLikeScriptureQuery(userText)
  const filters = opts.filters || [
    'publications',
    'videos',
    'indexes',
    'audio',
    'bible',
  ]
  const { queries, themeTokens, userTokens } = buildThematicQueries(
    userText,
    opts.maxQueries ?? (scriptureQuery ? 3 : 4),
  )
  if (!queries.length) {
    return { sections: [], flat: [], queriesUsed: [], themeTokens: [] }
  }

  // Per riferimenti tipo «Proverbi 3:5» privilegia la query originale sulla Bibbia
  const searchQueries = scriptureQuery
    ? [userText.trim(), ...queries.filter((q) => q.toLowerCase() !== userText.trim().toLowerCase())]
    : queries

  const jobs = searchQueries.flatMap((q) =>
    filters.map(async (filter) => {
      try {
        // Su query non scritturali, evita di moltiplicare ricerche bible su ogni variante
        if (filter === 'bible' && !scriptureQuery && q !== searchQueries[0]) {
          return [] as JwResult[]
        }
        const rows = await searchJw(q, { language, filter })
        return rows.map((r) => ({
          ...r,
          themeScore: scoreThemeMatch(r, themeTokens, q, userTokens),
          matchedQueries: [q],
        }))
      } catch {
        return [] as JwResult[]
      }
    }),
  )

  const batches = await Promise.all(jobs)
  const byKey = new Map<string, JwResult>()

  for (const row of batches.flat()) {
    const key = `${row.docid || ''}|${row.lank || ''}|${row.url}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, row)
      continue
    }
    const mergedQueries = Array.from(
      new Set([...(prev.matchedQueries || []), ...(row.matchedQueries || [])]),
    )
    byKey.set(key, {
      ...prev,
      themeScore: Math.max(prev.themeScore || 0, row.themeScore || 0),
      rank: Math.min(prev.rank ?? 999, row.rank ?? 999),
      matchedQueries: mergedQueries,
      snippet: (row.snippet?.length || 0) > (prev.snippet?.length || 0) ? row.snippet : prev.snippet,
    })
  }

  // Versetto diretto se la query è un riferimento biblico riconoscibile
  const parsed = parseScriptureLabel(userText.trim())
  if (parsed.bible) {
    const label = userText.trim() || parsed.bookName || parsed.bible
    const direct: JwResult = {
      id: `bible-${parsed.bible}`,
      title: label,
      snippet: 'Riferimento biblico riconosciuto — aprilo in JW Library o su jw.org',
      kind: 'bible',
      section: 'bibbia',
      url: bibleOpenUrl(parsed.bible, language),
      themeScore: 100,
      matchedQueries: [userText.trim()],
      rank: 1,
    }
    byKey.set(`||${direct.url}`, direct)
  }

  const minScore = opts.minThemeScore ?? (scriptureQuery ? 2.5 : 4.5)
  let flat = Array.from(byKey.values())
    .filter((r) => {
      const score = r.themeScore || 0
      if (score >= minScore) return true
      if (r.rank !== undefined && r.rank <= 2 && score >= 2) return true
      if (r.section === 'bibbia' && score >= 2) return true
      return false
    })
    .sort(
      (a, b) =>
        (b.themeScore || 0) - (a.themeScore || 0) || (a.rank || 99) - (b.rank || 99),
    )

  // Fallback cauto: pochi risultati ma comunque attinenti (score >= 2), non i primi 40 a caso
  if (flat.length < 4) {
    flat = Array.from(byKey.values())
      .filter((r) => (r.themeScore || 0) >= 2)
      .sort(
        (a, b) =>
          (b.themeScore || 0) - (a.themeScore || 0) || (a.rank || 99) - (b.rank || 99),
      )
      .slice(0, 18)
  }

  const perSection = opts.perSection ?? (scriptureQuery ? 10 : 6)
  const sections = groupResultsBySection(flat).map((s) => ({
    ...s,
    items: s.items.slice(0, perSection),
  }))
  const cappedFlat = sections.flatMap((s) => s.items)

  return {
    sections,
    flat: cappedFlat,
    queriesUsed: searchQueries,
    themeTokens,
  }
}

export interface LatestMediaItem {
  guid: string
  title: string
  description: string
  published: string
  duration: string
  image?: string
  url: string
  lank?: string
  libraryUrl?: string
  subtitleUrl?: string
  hasSubtitles?: boolean
}

export interface JwMediaDetails {
  title: string
  description: string
  lank: string
  duration: string
  image?: string
  url: string
  libraryUrl?: string
  subtitleUrl?: string
  progressiveUrl?: string
}

function pickSubtitleUrl(files: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!Array.isArray(files)) return undefined
  for (const f of files) {
    const sub = f.subtitles as { url?: string } | undefined
    if (sub?.url) return String(sub.url)
  }
  return undefined
}

function pickProgressiveUrl(files: Array<Record<string, unknown>> | undefined): string | undefined {
  if (!Array.isArray(files)) return undefined
  const preferred = ['720p', '480p', '360p', '240p']
  for (const label of preferred) {
    const hit = files.find((f) => String(f.label || '') === label && f.progressiveDownloadURL)
    if (hit?.progressiveDownloadURL) return String(hit.progressiveDownloadURL)
  }
  const any = files.find((f) => f.progressiveDownloadURL)
  return any?.progressiveDownloadURL ? String(any.progressiveDownloadURL) : undefined
}

function mapMediaItem(m: Record<string, unknown>, language: string): JwMediaDetails {
  const images = (m.images || {}) as Record<string, Record<string, string>>
  const image =
    images?.pnr?.lg || images?.pnr?.md || images?.lsr?.lg || images?.sqr?.lg || undefined
  const naturalKey = String(m.languageAgnosticNaturalKey || m.naturalKey || '')
  const files = m.files as Array<Record<string, unknown>> | undefined
  const share =
    buildJwLibraryShareLink({ lank: naturalKey, wtlocale: language }, language) ||
    `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${language}&lank=${encodeURIComponent(naturalKey)}`
  return {
    title: String(m.title || ''),
    description: String(m.description || ''),
    lank: naturalKey,
    duration: String(m.durationFormattedMinSec || m.durationFormattedHHMM || ''),
    image,
    url: share,
    libraryUrl: naturalKey
      ? `jwlibrary:///finder?wtlocale=${encodeURIComponent(language)}&lank=${encodeURIComponent(naturalKey)}`
      : undefined,
    subtitleUrl: pickSubtitleUrl(files),
    progressiveUrl: pickProgressiveUrl(files),
  }
}

function mapLatestMediaItem(m: Record<string, unknown>, language: string): LatestMediaItem {
  const details = mapMediaItem(m, language)
  return {
    guid: String(m.guid || details.lank),
    title: details.title,
    description: details.description,
    published: String(m.firstPublished || ''),
    duration: details.duration,
    image: details.image,
    url: details.url,
    lank: details.lank || undefined,
    libraryUrl: details.libraryUrl,
    subtitleUrl: details.subtitleUrl,
    hasSubtitles: Boolean(details.subtitleUrl),
  }
}

export async function fetchLatestVideos(language = 'I'): Promise<LatestMediaItem[]> {
  const res = await fetch(
    `/api/jw-media?language=${encodeURIComponent(language)}&category=LatestVideos`,
  )
  const data = await readApiJson<{ category?: { media?: Record<string, unknown>[] } }>(
    res,
    'Impossibile caricare i video recenti da jw.org',
  )
  const media = data?.category?.media || []
  return media.slice(0, 12).map((m: Record<string, unknown>) => mapLatestMediaItem(m, language))
}

/** Categorie video ministero su jw.org (Adunanze e ministero). */
export const MINISTRY_VIDEO_CATEGORIES = [
  { key: 'VODMinistryTools', label: 'Strumenti per il ministero' },
  { key: 'VODSampleConversations', label: 'Conversazioni modello' },
  { key: 'VODMinistryTeachings', label: 'Insegnamenti fondamentali' },
  { key: 'VODMinistryImproveSkills', label: 'Affiniamo le capacità' },
  { key: 'VODMinistryMethods', label: 'Metodi di predicazione' },
  { key: 'VODMinistryExpandMinistry', label: 'Espandere il ministero' },
] as const

export async function fetchMediaCategory(
  category: string,
  language = 'I',
  limit = 40,
): Promise<LatestMediaItem[]> {
  const res = await fetch(
    `/api/jw-media?language=${encodeURIComponent(language)}&category=${encodeURIComponent(category)}&detailed=1`,
  )
  const data = await readApiJson<{ category?: { media?: Record<string, unknown>[] } }>(
    res,
    `Impossibile caricare la categoria video (${category})`,
  )
  const media = data?.category?.media || []
  return media
    .slice(0, limit)
    .map((m: Record<string, unknown>) => mapLatestMediaItem(m, language))
}

/** Dettagli media JW (inclusi sottotitoli) tramite lank. */
export async function fetchMediaByLank(
  lank: string,
  language = 'I',
): Promise<JwMediaDetails> {
  const key = lank.trim()
  if (!key) throw new Error('Manca il codice video (lank)')
  const res = await fetch(
    `/api/jw-media?language=${encodeURIComponent(language)}&lank=${encodeURIComponent(key)}`,
  )
  if (!res.ok) throw new Error(`Video non trovato (${res.status})`)
  const data = await res.json()
  const media = (data?.media || [])[0] as Record<string, unknown> | undefined
  if (!media) throw new Error('Nessun media per questo codice video')
  return mapMediaItem(media, language)
}

export async function fetchVideoTranscript(
  lankOrUrl: string,
  language = 'I',
): Promise<{
  media: JwMediaDetails
  vtt: string
  transcript: string
  cues: VttCue[]
  timedText: string
}> {
  let lank = lankOrUrl.trim()
  const refs = extractJwRefs(lank)
  if (refs.lank) lank = refs.lank
  if (!isMediaLank(lank)) {
    throw new Error('Incolla un link jw.org del video oppure il codice lank (es. pub-…_VIDEO)')
  }

  const media = await fetchMediaByLank(lank, language)
  if (!media.subtitleUrl) {
    throw new Error(
      'Questo video non ha sottotitoli disponibili su jw.org. Scegline un altro (molti cantici non li hanno).',
    )
  }
  const vttRes = await fetch(media.subtitleUrl)
  if (!vttRes.ok) throw new Error('Impossibile scaricare i sottotitoli del video')
  const vtt = await vttRes.text()
  const { cues, text } = parseVtt(vtt)
  if (!text) throw new Error('Sottotitoli vuoti o non leggibili')
  return {
    media,
    vtt,
    transcript: text,
    cues,
    timedText: formatTranscriptWithTimestamps(cues),
  }
}

export const SUGGESTED_TOPICS = [
  'preghiera',
  'fede',
  'amore',
  'pazienza',
  'decisioni',
  'amicizia con Geova',
  'studio della Bibbia',
  'ministero',
  'famiglia',
  'perdono',
  'ansia',
  'speranza',
  'congregazione e territorio',
  'adunanze',
]
