/**
 * Raffinamento testo Discorso (dettatura / trascrizione / polish locale):
 * scritture dette a voce, termini jw.org, punteggiatura e senso di base.
 */

import { BIBLE_CHAPTER_COUNTS } from './bibleChapterCounts'
import { BIBLE_BOOKS } from './bibleRefs'
import {
  applyJwSttCorrections,
  expandSpokenBookAbbreviations,
  italianWordsToDigits,
  richDiscourseSpeechHints,
} from './jwSpeechLexicon'
import { normalizeJwItalian } from './jwItalianTerms'

const spokenBookLimits = new Map(
  BIBLE_BOOKS.flatMap((book) => {
    const names = [book.name, book.short]
    return names
      .filter((name): name is string => Boolean(name))
      .map((name) => [
        name.toLocaleLowerCase('it-IT'),
        BIBLE_CHAPTER_COUNTS[book.num],
      ] as const)
  }),
)

const spokenBookPattern = [...spokenBookLimits.keys()]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
  .join('|')

/** Cattura lista versetti dopo «versetto/i»: anche «da 4 a 7», «5 6 e 7», «5/6». */
const VERSE_LIST = String.raw`(?:da\s+)?[0-9][0-9eEdDaA,\s/\-–—]*[0-9]|(?:da\s+)?[0-9]{1,3}`

function parseSpokenVerseAtoms(raw: string): number[] {
  const out: number[] = []
  const pushRange = (a: number, b?: number) => {
    if (!a || a > 176) return
    if (b && b >= a && b <= 176) {
      for (let v = a; v <= b; v++) if (!out.includes(v)) out.push(v)
      return
    }
    if (!out.includes(a)) out.push(a)
  }
  const cleaned = raw
    .replace(/\bda\s+/gi, '')
    .replace(/\s+a\s+/gi, '-')
    .replace(/\s*(?:e|ed)\s*/gi, ',')
    .replace(/\//g, ',')
    .replace(/\s+/g, ',')
  for (const part of cleaned.split(/\s*,\s*/)) {
    const m = part.trim().match(/^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/)
    if (!m) continue
    pushRange(Number(m[1]), m[2] ? Number(m[2]) : undefined)
  }
  return out
}

function formatVerseList(verses: number[]): string {
  if (!verses.length) return ''
  if (verses.length === 1) return String(verses[0])
  let consecutive = true
  for (let i = 1; i < verses.length; i++) {
    if (verses[i] !== verses[i - 1] + 1) {
      consecutive = false
      break
    }
  }
  if (consecutive) return `${verses[0]}-${verses[verses.length - 1]}`
  return verses.join(',')
}

/**
 * Converte riferimenti dettati/trascritti in forma scritta JW.
 * Es. «Salmo capitolo 5 versetti 5 6 e 7» → «Salmo 5:5-7»
 *     «Salmo 28 14» → «Salmo 28:14»
 */
export function normalizeSpokenScriptureReferences(text: string): string {
  if (!text) return text
  // Prima: abbreviazioni libro e numeri in lettere («tredici» → 13)
  let out = expandSpokenBookAbbreviations(italianWordsToDigits(text))

  // 1) Libro + capitolo/cap. + versetto/i + lista
  const spokenVerbose = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${spokenBookPattern})\\s+(?:capitolo|cap\\.?)\\s+(\\d{1,3})\\s+(?:versetti|versetto|vv?\\.?)\\s+(${VERSE_LIST})(?=$|[^\\p{L}\\p{N}])`,
    'giu',
  )
  out = out.replace(
    spokenVerbose,
    (match, prefix: string, book: string, chapterRaw: string, verseRaw: string) => {
      const chapter = Number(chapterRaw)
      const maxChapter = spokenBookLimits.get(book.toLocaleLowerCase('it-IT'))
      const verses = parseSpokenVerseAtoms(verseRaw)
      if (!maxChapter || chapter < 1 || chapter > maxChapter || !verses.length) return match
      return `${prefix}${book} ${chapter}:${formatVerseList(verses)}`
    },
  )

  // 2) Libro + N + versetto/i + lista (senza «capitolo»)
  const spokenSemi = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${spokenBookPattern})\\s+(\\d{1,3})\\s+(?:versetti|versetto|vv?\\.?)\\s+(${VERSE_LIST})(?=$|[^\\p{L}\\p{N}])`,
    'giu',
  )
  out = out.replace(
    spokenSemi,
    (match, prefix: string, book: string, chapterRaw: string, verseRaw: string) => {
      const chapter = Number(chapterRaw)
      const maxChapter = spokenBookLimits.get(book.toLocaleLowerCase('it-IT'))
      const verses = parseSpokenVerseAtoms(verseRaw)
      if (!maxChapter || chapter < 1 || chapter > maxChapter || !verses.length) return match
      return `${prefix}${book} ${chapter}:${formatVerseList(verses)}`
    },
  )

  // 3) Libro + capitolo N (senza versetto ancora) — lascia invariato
  // 4) Libro + capitolo + versetto singoli già «Salmo 28 14»
  const spokenCompact = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${spokenBookPattern})\\s+(\\d{1,3})\\s+(\\d{1,3})(?=$|[^\\p{L}\\p{N}])`,
    'giu',
  )
  out = out.replace(
    spokenCompact,
    (match, prefix: string, book: string, chapterRaw: string, verseRaw: string) => {
      const chapter = Number(chapterRaw)
      const verse = Number(verseRaw)
      const maxChapter = spokenBookLimits.get(book.toLocaleLowerCase('it-IT'))
      if (!maxChapter || chapter < 1 || chapter > maxChapter || verse < 1 || verse > 176) {
        return match
      }
      return `${prefix}${book} ${chapter}:${verse}`
    },
  )

  return out
}

const WORD_END = String.raw`(?=$|[^\p{L}\p{N}])`

export function looksLikeQuestion(text: string): boolean {
  const t = text.replace(/^[.,;:!?…]+\s*/, '').trim()
  if (!t) return false
  if (/[?？]\s*$/.test(t)) return true
  return new RegExp(
    `^(chi|che\\s+cosa|cosa|cos['’]è|cosè|perché|perchè|come|quando|dove|quale|quali|quanto|quanti|quante|forse|non\\s+è\\s+vero|vero|vi\\s+chiedo|ti\\s+chiedo|ci\\s+chiediamo)${WORD_END}`,
    'iu',
  ).test(t)
}

export function looksLikeExclamation(text: string): boolean {
  const t = text.replace(/^[.,;:!?…]+\s*/, '').trim()
  if (!t) return false
  if (/[!！]\s*$/.test(t)) return true
  return new RegExp(
    `^(oh|ah|eh|wow|che\\s+(bello|meraviglia|gioia|privilegio)|quanto\\s+(è|sono)|come\\s+è\\s+\\p{L}+|alleluia|lode\\s+a\\s+geova)${WORD_END}`,
    'iu',
  ).test(t)
}

/** Suggerimenti frasi per Web Speech (termini JW + libri). */
export function discourseSpeechHints(extra: string[] = []): string[] {
  return richDiscourseSpeechHints(extra)
}

/**
 * Raffinamento locale completo: scritture dette, termini JW, domande/esclamazioni,
 * spazi e maiuscole. Non inventa contenuto.
 */
export function refineDiscourseSpeechText(raw: string): string {
  let s = String(raw || '')
  if (!s.trim()) return ''
  s = applyJwSttCorrections(s)
  s = normalizeSpokenScriptureReferences(s)
  s = normalizeJwItalian(s)

  // Domande/esclamazioni finite con punto → ? / !
  s = s.replace(/([^.?!…\n]{8,}?)(\.)(?=\s|$)/g, (_full, body: string, dot: string) => {
    const chunk = body.trim()
    if (looksLikeQuestion(chunk)) return `${body}?`
    if (looksLikeExclamation(chunk)) return `${body}!`
    return `${body}${dot}`
  })

  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/\s+([,.;:!?…])/g, '$1')
  s = s.replace(/([.!?…])\s*([a-zàèéìòù])/g, (_, p, c) => `${p} ${c.toUpperCase()}`)
  s = s.replace(/(^|\n)([a-zàèéìòù])/g, (_, a, c) => `${a}${c.toUpperCase()}`)
  return s.trim()
}

/** Prompt condiviso per correzione AI (polish / post-trascrizione). */
export const DISCOURSE_PROOFREAD_RULES = `Sei un correttore di bozze per un discorso pubblico di un Testimone di Geova (stile jw.org / TNM italiana).
Compito: correggi grammatica, sintassi, punteggiatura e senso compiuto di frasi e periodi in italiano.
Regole strette:
- Non aggiungere idee, esempi, citazioni o paragrafi nuovi.
- Non togliere il senso: resta fedele al contenuto dell’utente.
- Metti punto, virgola, punto e virgola, due punti, punto interrogativo ed esclamativo dove il senso e la tonalità lo richiedono (domande → ?; enfasi → !).
- Riferimenti biblici in forma scritta JW con due punti: «Salmo 5:5-7», «Giacomo 2:1-2,3». Se dettati come «Salmo capitolo 5 versetti 5 e 6», normalizzali.
- Terminologia jw.org: Geova, 1–2 Corinti (non Corinzi), Rivelazione (non Apocalisse), ministero (mai «ministeriale»), servo di ministero, congregazione, Sala del Regno, territorio, anziani, adunanze.
- Restituisci SOLO il testo corretto, senza prefazioni né markdown.`
