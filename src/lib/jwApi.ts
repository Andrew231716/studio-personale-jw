import type { ContentKind, JwResult } from '../types'
import { extractJwRefs, buildJwLibraryShareLink } from './jwLibrary'

let cachedToken = ''
let tokenFetchedAt = 0

async function getToken(): Promise<string> {
  const fresh = Date.now() - tokenFetchedAt < 50 * 60 * 1000
  if (cachedToken && fresh) return cachedToken
  const res = await fetch('/api/jw-token')
  if (!res.ok) throw new Error('Impossibile ottenere il token di ricerca jw.org')
  cachedToken = (await res.text()).trim()
  tokenFetchedAt = Date.now()
  return cachedToken
}

function mapKind(subtype?: string, layoutHints: string[] = []): ContentKind {
  const s = (subtype || '').toLowerCase()
  if (s.includes('video') || layoutHints.includes('videos')) return 'video'
  if (s.includes('audio') || layoutHints.includes('audio')) return 'audio'
  if (s.includes('index')) return 'index'
  if (s.includes('article') || s.includes('publication')) return 'article'
  return 'other'
}

function flattenResults(payload: Record<string, unknown>): JwResult[] {
  const out: JwResult[] = []
  const layout = Array.isArray(payload.layout) ? (payload.layout as string[]) : []
  const top = Array.isArray(payload.results) ? payload.results : []

  for (const entry of top as Array<Record<string, unknown>>) {
    const groupLayout = Array.isArray(entry.layout) ? (entry.layout as string[]) : layout
    const items =
      entry.type === 'group' && Array.isArray(entry.results)
        ? (entry.results as Array<Record<string, unknown>>)
        : entry.type === 'item'
          ? [entry]
          : []

    for (const item of items) {
      if (item.type && item.type !== 'item') continue
      const links = (item.links || {}) as Record<string, string>
      const url = links['jw.org'] || links.wol || ''
      if (!url) continue
      const image = (item.image as { url?: string } | undefined)?.url
      const lankFromItem = item.lank ? String(item.lank) : undefined
      const refs = extractJwRefs(url)
      const wolRefs = extractJwRefs(links.wol)
      const lank = lankFromItem || refs.lank || wolRefs.lank
      const docid = refs.docid || wolRefs.docid
      out.push({
        id: String(lank || docid || item.title || uidFallback()),
        title: stripHtml(String(item.title || 'Senza titolo')),
        snippet: stripHtml(String(item.snippet || '')),
        kind: mapKind(String(item.subtype || ''), groupLayout),
        url,
        wolUrl: links.wol,
        lank,
        docid,
        image,
        duration: item.duration ? String(item.duration) : undefined,
        context: item.context ? String(item.context) : undefined,
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

export async function searchJw(
  query: string,
  opts: { language?: string; filter?: string } = {},
): Promise<JwResult[]> {
  const q = query.trim()
  if (!q) return []
  const language = opts.language || 'I'
  const filter = opts.filter || 'all'
  const token = await getToken()
  const url = `/api/jw-search?language=${encodeURIComponent(language)}&filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Ricerca jw.org non riuscita (${res.status})`)
  const data = (await res.json()) as Record<string, unknown>
  return flattenResults(data)
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
}

export async function fetchLatestVideos(language = 'I'): Promise<LatestMediaItem[]> {
  const res = await fetch(
    `/api/jw-media?language=${encodeURIComponent(language)}&category=LatestVideos`,
  )
  if (!res.ok) throw new Error('Impossibile caricare i video recenti da jw.org')
  const data = await res.json()
  const media = data?.category?.media || []
  return media.slice(0, 12).map((m: Record<string, unknown>) => {
    const images = (m.images || {}) as Record<string, Record<string, string>>
    const image =
      images?.pnr?.lg || images?.pnr?.md || images?.lsr?.lg || images?.sqr?.lg || undefined
    const naturalKey = String(m.languageAgnosticNaturalKey || m.naturalKey || '')
    const share =
      buildJwLibraryShareLink({ lank: naturalKey, wtlocale: language }, language) ||
      `https://www.jw.org/finder?srcid=jwlshare&wtlocale=${language}&lank=${encodeURIComponent(naturalKey)}`
    return {
      guid: String(m.guid),
      title: String(m.title || ''),
      description: String(m.description || ''),
      published: String(m.firstPublished || ''),
      duration: String(m.durationFormattedMinSec || m.durationFormattedHHMM || ''),
      image,
      url: share,
      lank: naturalKey || undefined,
      libraryUrl: naturalKey
        ? `jwlibrary:///finder?wtlocale=${encodeURIComponent(language)}&lank=${encodeURIComponent(naturalKey)}`
        : undefined,
    }
  })
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
]
