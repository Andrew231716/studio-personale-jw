import { buildJwLibraryShareLink } from './jwLibrary'

/** Numero libro TNM (ordine standard usato da jw.org / JW Library). */
export const BIBLE_BOOKS: Array<{ num: number; name: string; short?: string }> = [
  { num: 1, name: 'Genesi' },
  { num: 2, name: 'Esodo' },
  { num: 3, name: 'Levitico' },
  { num: 4, name: 'Numeri' },
  { num: 5, name: 'Deuteronomio' },
  { num: 6, name: 'Giosuè' },
  { num: 7, name: 'Giudici' },
  { num: 8, name: 'Rut' },
  { num: 9, name: '1 Samuele' },
  { num: 10, name: '2 Samuele' },
  { num: 11, name: '1 Re' },
  { num: 12, name: '2 Re' },
  { num: 13, name: '1 Cronache' },
  { num: 14, name: '2 Cronache' },
  { num: 15, name: 'Esdra' },
  { num: 16, name: 'Neemia' },
  { num: 17, name: 'Ester' },
  { num: 18, name: 'Giobbe' },
  { num: 19, name: 'Salmi' },
  { num: 20, name: 'Proverbi' },
  { num: 21, name: 'Ecclesiaste' },
  { num: 22, name: 'Cantico dei Cantici', short: 'Cantico' },
  { num: 23, name: 'Isaia' },
  { num: 24, name: 'Geremia' },
  { num: 25, name: 'Lamentazioni' },
  { num: 26, name: 'Ezechiele' },
  { num: 27, name: 'Daniele' },
  { num: 28, name: 'Osea' },
  { num: 29, name: 'Gioele' },
  { num: 30, name: 'Amos' },
  { num: 31, name: 'Abdia' },
  { num: 32, name: 'Giona' },
  { num: 33, name: 'Michea' },
  { num: 34, name: 'Naum' },
  { num: 35, name: 'Abacuc' },
  { num: 36, name: 'Sofonia' },
  { num: 37, name: 'Aggeo' },
  { num: 38, name: 'Zaccaria' },
  { num: 39, name: 'Malachia' },
  { num: 40, name: 'Matteo' },
  { num: 41, name: 'Marco' },
  { num: 42, name: 'Luca' },
  { num: 43, name: 'Giovanni' },
  { num: 44, name: 'Atti' },
  { num: 45, name: 'Romani' },
  { num: 46, name: '1 Corinti' },
  { num: 47, name: '2 Corinti' },
  { num: 48, name: 'Galati' },
  { num: 49, name: 'Efesini' },
  { num: 50, name: 'Filippesi' },
  { num: 51, name: 'Colossesi' },
  { num: 52, name: '1 Tessalonicesi' },
  { num: 53, name: '2 Tessalonicesi' },
  { num: 54, name: '1 Timoteo' },
  { num: 55, name: '2 Timoteo' },
  { num: 56, name: 'Tito' },
  { num: 57, name: 'Filemone' },
  { num: 58, name: 'Ebrei' },
  { num: 59, name: 'Giacomo' },
  { num: 60, name: '1 Pietro' },
  { num: 61, name: '2 Pietro' },
  { num: 62, name: '1 Giovanni' },
  { num: 63, name: '2 Giovanni' },
  { num: 64, name: '3 Giovanni' },
  { num: 65, name: 'Giuda' },
  { num: 66, name: 'Rivelazione' },
]

/** Codice bible= usato da jw.org / JW Library (libro + cap 3 cifre + versetto 3 cifre). */
export function bibleCode(book: number, chapter = 1, verse = 1): string {
  return `${book}${String(chapter).padStart(3, '0')}${String(verse).padStart(3, '0')}`
}

export function bibleOpenUrl(
  bible: string,
  language = 'I',
  pub = 'nwtsty',
): string {
  const share = buildJwLibraryShareLink({ bible, pub, wtlocale: language }, language)
  if (share) return share
  const params = new URLSearchParams({
    pub,
    bible,
    wtlocale: language,
    prefer: 'lang',
  })
  return `https://www.jw.org/open?${params.toString()}`
}

export function bookOpenUrl(bookNum: number, language = 'I'): string {
  return bibleOpenUrl(bibleCode(bookNum, 1, 1), language)
}

export function findBookByName(name: string) {
  const n = name.trim().toLowerCase()
  return BIBLE_BOOKS.find(
    (b) =>
      b.name.toLowerCase() === n ||
      (b.short && b.short.toLowerCase() === n) ||
      b.name.toLowerCase().includes(n),
  )
}

/** Estrae codice bible= da un URL jw.org/open o finder. */
export function extractBibleCode(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url, 'https://www.jw.org')
    return u.searchParams.get('bible') || undefined
  } catch {
    const m = url.match(/[?&]bible=([^&]+)/i)
    return m ? decodeURIComponent(m[1]) : undefined
  }
}

/**
 * Prova a interpretare riferimenti tipo «Genesi 12:1-3», «1 Corinti 13:4», «Salmi 23».
 */
export function parseScriptureLabel(label: string): { bible?: string; bookName?: string } {
  const text = label.replace(/\u00a0/g, ' ').trim()
  const m = text.match(
    /^((?:\d\s*)?[A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+)*)\s+(\d+)(?::(\d+))?/i,
  )
  if (!m) {
    const bookOnly = findBookByName(text)
    return bookOnly
      ? { bible: bibleCode(bookOnly.num, 1, 1), bookName: bookOnly.name }
      : {}
  }
  const book = findBookByName(m[1])
  if (!book) return {}
  const chapter = Number(m[2]) || 1
  const verse = Number(m[3]) || 1
  return { bible: bibleCode(book.num, chapter, verse), bookName: book.name }
}
