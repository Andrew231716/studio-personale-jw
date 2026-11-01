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
}

export interface ScriptureVerseResult {
  label: string
  bible: string
  text: string
  url: string
  bookName: string
  chapter: number
  verse: number
  cached?: boolean
}

const CACHE_KEY = 'jw-studio-bible-verse-cache-v1'
const MAX_CACHE = 120

type CacheMap = Record<string, { text: string; label: string; savedAt: string }>

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CacheMap
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveCache(map: CacheMap) {
  try {
    const entries = Object.entries(map).sort((a, b) =>
      b[1].savedAt.localeCompare(a[1].savedAt),
    )
    const trimmed = Object.fromEntries(entries.slice(0, MAX_CACHE))
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

/** Libri ordinati dal nome più lungo (es. «Cantico dei Cantici» prima di «Cantico»). */
const BOOKS_BY_LEN = [...BIBLE_BOOKS].sort((a, b) => {
  const an = (a.short ? Math.max(a.name.length, a.short.length) : a.name.length)
  const bn = (b.short ? Math.max(b.name.length, b.short.length) : b.name.length)
  return bn - an
})

/**
 * Trova riferimenti tipo «Proverbi 14:12», «1 Corinti 13:4-7», «Salmi 23:1».
 */
export function findScriptureRefsInText(text: string): ParsedScriptureRef[] {
  if (!text) return []
  const out: ParsedScriptureRef[] = []
  const seen = new Set<string>()

  for (const book of BOOKS_BY_LEN) {
    const names = [book.name, book.short].filter(Boolean) as string[]
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      const re = new RegExp(
        `(^|[^\\wÀ-ÿ])(${escaped})\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3}))?`,
        'gi',
      )
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        const chapter = Number(m[3])
        const verse = Number(m[4])
        const verseEnd = m[5] ? Number(m[5]) : undefined
        if (!chapter || !verse) continue
        const label = verseEnd
          ? `${book.name} ${chapter}:${verse}-${verseEnd}`
          : `${book.name} ${chapter}:${verse}`
        const key = `${book.num}:${chapter}:${verse}:${verseEnd || verse}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          label,
          bookNum: book.num,
          bookName: book.name,
          chapter,
          verse,
          verseEnd,
          bible: bibleCode(book.num, chapter, verse),
          index: m.index + m[1].length,
        })
      }
    }
  }

  return out.sort((a, b) => a.index - b.index)
}

/** Ultimo riferimento completo vicino alla fine del testo (mentre digiti). */
export function latestScriptureNearEnd(text: string, lookBack = 80): ParsedScriptureRef | null {
  const sliceStart = Math.max(0, text.length - lookBack)
  const tail = text.slice(sliceStart)
  const refs = findScriptureRefsInText(tail)
  if (!refs.length) return null
  const last = refs[refs.length - 1]
  // Preferisci solo se il riferimento finisce vicino alla fine (appena scritto)
  const endInTail = last.index + last.label.length
  if (endInTail < tail.length - 12) {
    // forse sta continuando a scrivere dopo; comunque ok se è l'ultimo
  }
  return {
    ...last,
    index: sliceStart + last.index,
  }
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
    const re = new RegExp(
      `<span[^>]*id="v${book}-${chapter}-${v}(?:-\\d+)?"[^>]*>([\\s\\S]*?)</span>`,
      'gi',
    )
    const chunks: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      chunks.push(stripHtml(m[1]))
    }
    if (chunks.length) {
      let line = chunks.join(' ').replace(/^\d+\s*/, '').trim()
      if (end > verse) line = `${v} ${line}`
      parts.push(line)
    }
  }
  return parts.join('\n').trim()
}

export async function fetchScriptureVerse(params: {
  bookNum: number
  bookName: string
  chapter: number
  verse: number
  verseEnd?: number
  language?: string
}): Promise<ScriptureVerseResult> {
  const language = params.language || 'I'
  const label =
    params.verseEnd && params.verseEnd > params.verse
      ? `${params.bookName} ${params.chapter}:${params.verse}-${params.verseEnd}`
      : `${params.bookName} ${params.chapter}:${params.verse}`
  const bible = bibleCode(params.bookNum, params.chapter, params.verse)
  const cacheId = `${language}:${bible}:${params.verseEnd || params.verse}`
  const cache = loadCache()
  if (cache[cacheId]?.text) {
    return {
      label: cache[cacheId].label || label,
      bible,
      text: cache[cacheId].text,
      url: bibleOpenUrl(bible, language),
      bookName: params.bookName,
      chapter: params.chapter,
      verse: params.verse,
      cached: true,
    }
  }

  const url = `/api/jw-bible?language=${encodeURIComponent(language)}&book=${params.bookNum}&chapter=${params.chapter}&verse=${params.verse}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Bibbia non disponibile (${res.status})`)
  const data = (await res.json()) as { title?: string; content?: string; error?: string }
  if (!data.content) throw new Error(data.error || 'Capitolo non trovato')
  const text = extractVerseFromChapterHtml(
    data.content,
    params.bookNum,
    params.chapter,
    params.verse,
    params.verseEnd,
  )
  if (!text) throw new Error('Versetto non trovato nel capitolo')

  cache[cacheId] = { text, label, savedAt: new Date().toISOString() }
  saveCache(cache)

  return {
    label,
    bible,
    text,
    url: bibleOpenUrl(bible, language),
    bookName: params.bookName,
    chapter: params.chapter,
    verse: params.verse,
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
