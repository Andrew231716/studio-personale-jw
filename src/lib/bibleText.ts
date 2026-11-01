import { OFFLINE_PACK_BOOKS, resolveBookToken } from './bibleAbbreviations'
import {
  BIBLE_BOOKS,
  bibleCode,
  bibleOpenUrl,
  findBookByName,
  parseScriptureLabel,
} from './bibleRefs'

export interface ParsedScriptureRef {
  label: string
  bookNum: number
  bookName: string
  chapter: number
  verse: number
  verseEnd?: number
  bible: string
  /** Indice nel testo dove inizia il riferimento. */
  index: number
  matched: string
}

export interface ScriptureVerseResult {
  label: string
  bible: string
  text: string
  url: string
  bookName: string
  bookNum: number
  chapter: number
  verse: number
  verseEnd?: number
  /** Versetto precedente (se disponibile). */
  before?: string
  /** Versetto successivo (se disponibile). */
  after?: string
  cached?: boolean
}

const CACHE_KEY = 'jw-studio-bible-verse-cache-v2'
const CHAPTER_CACHE_KEY = 'jw-studio-bible-chapter-cache-v1'
const MAX_VERSE_CACHE = 200
const MAX_CHAPTER_CACHE = 80

type VerseCache = Record<string, { text: string; label: string; savedAt: string; before?: string; after?: string }>
type ChapterCache = Record<string, { html: string; savedAt: string }>

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

function loadVerseCache(): VerseCache {
  return loadJson(CACHE_KEY, {})
}

function saveVerseCache(map: VerseCache) {
  const entries = Object.entries(map).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt))
  saveJson(CACHE_KEY, Object.fromEntries(entries.slice(0, MAX_VERSE_CACHE)))
}

function loadChapterCache(): ChapterCache {
  return loadJson(CHAPTER_CACHE_KEY, {})
}

function saveChapterCache(map: ChapterCache) {
  const entries = Object.entries(map).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt))
  saveJson(CHAPTER_CACHE_KEY, Object.fromEntries(entries.slice(0, MAX_CHAPTER_CACHE)))
}

/** Libri ordinati dal nome più lungo. */
const BOOKS_BY_LEN = [...BIBLE_BOOKS].sort((a, b) => {
  const an = a.short ? Math.max(a.name.length, a.short.length) : a.name.length
  const bn = b.short ? Math.max(b.name.length, b.short.length) : b.name.length
  return bn - an
})

function chapterKey(language: string, book: number, chapter: number) {
  return `${language}:${book}:${chapter}`
}

/**
 * Trova riferimenti: nomi completi, short e abbreviazioni (Pr 14:12, 1Co 13:4-7, Mt 24:14).
 */
export function findScriptureRefsInText(text: string): ParsedScriptureRef[] {
  if (!text) return []
  const out: ParsedScriptureRef[] = []
  const seen = new Set<string>()

  // 1) Nomi lunghi / short
  for (const book of BOOKS_BY_LEN) {
    const names = [book.name, book.short].filter(Boolean) as string[]
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const re = new RegExp(
        `(^|[^\\wÀ-ÿ])(${escaped})\\.?\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?`,
        'gi',
      )
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        pushRef(out, seen, {
          book,
          chapter: Number(m[3]),
          verse: Number(m[4]),
          verseEnd: m[5] ? Number(m[5]) : undefined,
          index: m.index + m[1].length,
          matched: m[0].slice(m[1].length).trim(),
        })
      }
    }
  }

  // 2) Abbreviazioni compatte: Pr 14:12, 1Co 13:4, Mt24:14
  const abbrRe =
    /(^|[^\wÀ-ÿ])((?:\d\s*)?[A-Za-zÀ-ÿ]{1,8})\.?\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/gi
  let m: RegExpExecArray | null
  while ((m = abbrRe.exec(text))) {
    const book = resolveBookToken(m[2])
    if (!book) continue
    // Evita doppi match già presi come nome lungo
    pushRef(out, seen, {
      book,
      chapter: Number(m[3]),
      verse: Number(m[4]),
      verseEnd: m[5] ? Number(m[5]) : undefined,
      index: m.index + m[1].length,
      matched: m[0].slice(m[1].length).trim(),
    })
  }

  return out.sort((a, b) => a.index - b.index)
}

function pushRef(
  out: ParsedScriptureRef[],
  seen: Set<string>,
  p: {
    book: (typeof BIBLE_BOOKS)[number]
    chapter: number
    verse: number
    verseEnd?: number
    index: number
    matched: string
  },
) {
  if (!p.chapter || !p.verse) return
  const key = `${p.book.num}:${p.chapter}:${p.verse}:${p.verseEnd || p.verse}`
  if (seen.has(key)) return
  seen.add(key)
  const label = p.verseEnd
    ? `${p.book.name} ${p.chapter}:${p.verse}-${p.verseEnd}`
    : `${p.book.name} ${p.chapter}:${p.verse}`
  out.push({
    label,
    bookNum: p.book.num,
    bookName: p.book.name,
    chapter: p.chapter,
    verse: p.verse,
    verseEnd: p.verseEnd,
    bible: bibleCode(p.book.num, p.chapter, p.verse),
    index: p.index,
    matched: p.matched,
  })
}

/** Ultimo riferimento completo vicino alla fine del testo. */
export function latestScriptureNearEnd(text: string, lookBack = 100): ParsedScriptureRef | null {
  const sliceStart = Math.max(0, text.length - lookBack)
  const tail = text.slice(sliceStart)
  const refs = findScriptureRefsInText(tail)
  if (!refs.length) return null
  const last = refs[refs.length - 1]
  return { ...last, index: sliceStart + last.index }
}

/** Capitolo appena digitato (senza versetto ancora): «Proverbi 14» o «Pr 14». */
export function latestChapterHint(text: string, lookBack = 40): { bookNum: number; bookName: string; chapter: number } | null {
  const sliceStart = Math.max(0, text.length - lookBack)
  const tail = text.slice(sliceStart)
  for (const book of BOOKS_BY_LEN) {
    const names = [book.name, book.short].filter(Boolean) as string[]
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const re = new RegExp(`(?:^|[^\\wÀ-ÿ])(${escaped})\\.?\\s+(\\d{1,3})(?!\\s*:)`, 'gi')
      let m: RegExpExecArray | null
      let last: RegExpExecArray | null = null
      while ((m = re.exec(tail))) last = m
      if (last) {
        return { bookNum: book.num, bookName: book.name, chapter: Number(last[2]) }
      }
    }
  }
  const abbr = /(?:^|[^\wÀ-ÿ])((?:\d\s*)?[A-Za-zÀ-ÿ]{1,8})\.?\s+(\d{1,3})(?!\s*:)/gi
  let m: RegExpExecArray | null
  let last: RegExpExecArray | null = null
  while ((m = abbr.exec(tail))) last = m
  if (last) {
    const book = resolveBookToken(last[1])
    if (book) return { bookNum: book.num, bookName: book.name, chapter: Number(last[2]) }
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[+*†‡]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractVerseFromChapterHtml(
  html: string,
  book: number,
  chapter: number,
  verse: number,
  verseEnd?: number,
): string {
  const end = verseEnd && verseEnd >= verse ? verseEnd : verse
  const parts: string[] = []
  for (let v = verse; v <= end; v++) {
    const line = extractSingleVerse(html, book, chapter, v)
    if (line) parts.push(end > verse ? `${v} ${line}` : line)
  }
  return parts.join('\n').trim()
}

function extractSingleVerse(html: string, book: number, chapter: number, verse: number): string {
  const re = new RegExp(
    `<span[^>]*id="v${book}-${chapter}-${verse}(?:-\\d+)?"[^>]*>([\\s\\S]*?)</span>`,
    'gi',
  )
  const chunks: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) chunks.push(stripHtml(m[1]))
  return chunks.join(' ').replace(/^\d+\s*/, '').trim()
}

async function fetchChapterHtml(
  bookNum: number,
  chapter: number,
  language: string,
): Promise<string> {
  const key = chapterKey(language, bookNum, chapter)
  const cached = loadChapterCache()
  if (cached[key]?.html) return cached[key].html

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Offline: capitolo non in cache')
  }

  const url = `/api/jw-bible?language=${encodeURIComponent(language)}&book=${bookNum}&chapter=${chapter}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bibbia non disponibile (${res.status})`)
  const data = (await res.json()) as { content?: string; error?: string }
  if (!data.content) throw new Error(data.error || 'Capitolo non trovato')

  cached[key] = { html: data.content, savedAt: new Date().toISOString() }
  saveChapterCache(cached)
  return data.content
}

/** Precarica un capitolo in cache (utile mentre digiti «Proverbi 14»). */
export async function preloadChapter(params: {
  bookNum: number
  chapter: number
  language?: string
}): Promise<void> {
  await fetchChapterHtml(params.bookNum, params.chapter, params.language || 'I')
}

export async function fetchScriptureVerse(params: {
  bookNum: number
  bookName: string
  chapter: number
  verse: number
  verseEnd?: number
  language?: string
  withContext?: boolean
}): Promise<ScriptureVerseResult> {
  const language = params.language || 'I'
  const withContext = params.withContext !== false
  const label =
    params.verseEnd && params.verseEnd > params.verse
      ? `${params.bookName} ${params.chapter}:${params.verse}-${params.verseEnd}`
      : `${params.bookName} ${params.chapter}:${params.verse}`
  const bible = bibleCode(params.bookNum, params.chapter, params.verse)
  const cacheId = `${language}:${bible}:${params.verseEnd || params.verse}:${withContext ? 'ctx' : 'plain'}`
  const cache = loadVerseCache()
  if (cache[cacheId]?.text) {
    return {
      label: cache[cacheId].label || label,
      bible,
      text: cache[cacheId].text,
      url: bibleOpenUrl(bible, language),
      bookName: params.bookName,
      bookNum: params.bookNum,
      chapter: params.chapter,
      verse: params.verse,
      verseEnd: params.verseEnd,
      before: withContext ? cache[cacheId].before : undefined,
      after: withContext ? cache[cacheId].after : undefined,
      cached: true,
    }
  }

  const html = await fetchChapterHtml(params.bookNum, params.chapter, language)
  const text = extractVerseFromChapterHtml(
    html,
    params.bookNum,
    params.chapter,
    params.verse,
    params.verseEnd,
  )
  if (!text) throw new Error('Versetto non trovato nel capitolo')

  let before: string | undefined
  let after: string | undefined
  if (withContext) {
    const b = extractSingleVerse(html, params.bookNum, params.chapter, params.verse - 1)
    const a = extractSingleVerse(
      html,
      params.bookNum,
      params.chapter,
      (params.verseEnd || params.verse) + 1,
    )
    if (b) before = b
    if (a) after = a
  }

  cache[cacheId] = {
    text,
    label,
    before,
    after,
    savedAt: new Date().toISOString(),
  }
  saveVerseCache(cache)

  return {
    label,
    bible,
    text,
    url: bibleOpenUrl(bible, language),
    bookName: params.bookName,
    bookNum: params.bookNum,
    chapter: params.chapter,
    verse: params.verse,
    verseEnd: params.verseEnd,
    before,
    after,
  }
}

export async function fetchFromLabel(
  label: string,
  language = 'I',
): Promise<ScriptureVerseResult | null> {
  const parsed = parseScriptureLabel(label)
  if (!parsed.bible || !parsed.bookName) return null
  const book = findBookByName(parsed.bookName)
  if (!book) return null
  const m = label.match(/(\d+)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?/)
  const chapter = m ? Number(m[1]) : 1
  const verse = m ? Number(m[2]) : 1
  const verseEnd = m?.[3] ? Number(m[3]) : undefined
  return fetchScriptureVerse({
    bookNum: book.num,
    bookName: book.name,
    chapter,
    verse,
    verseEnd,
    language,
  })
}

export function getCachedChapterCount(): number {
  return Object.keys(loadChapterCache()).length
}

export function getCachedVerseCount(): number {
  return Object.keys(loadVerseCache()).length
}

/**
 * Scarica un pacchetto offline di libri frequenti (capitoli in cache).
 * onProgress: 0–1
 */
export async function downloadOfflineBiblePack(params: {
  language?: string
  /** Se true, solo i primi N capitoli per libro (più veloce). */
  maxChaptersPerBook?: number
  onProgress?: (ratio: number, label: string) => void
  signal?: AbortSignal
}): Promise<{ chapters: number }> {
  const language = params.language || 'I'
  const maxPer = params.maxChaptersPerBook ?? 12
  const jobs: Array<{ book: number; name: string; chapter: number }> = []
  for (const b of OFFLINE_PACK_BOOKS) {
    const n = Math.min(b.chapters, maxPer)
    for (let c = 1; c <= n; c++) jobs.push({ book: b.num, name: b.name, chapter: c })
  }
  let done = 0
  for (const job of jobs) {
    if (params.signal?.aborted) break
    params.onProgress?.(done / jobs.length, `${job.name} ${job.chapter}`)
    try {
      await fetchChapterHtml(job.book, job.chapter, language)
    } catch {
      /* continua */
    }
    done += 1
  }
  params.onProgress?.(1, 'Completato')
  return { chapters: done }
}
