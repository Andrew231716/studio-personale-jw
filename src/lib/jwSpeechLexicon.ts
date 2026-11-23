/**
 * Lessico teocratico / correzioni tipiche STT per Discorso.
 * Usato come hint Web Speech e post-correzione locale.
 */

import { BIBLE_ABBREVIATIONS } from './bibleAbbreviations'
import { BIBLE_BOOKS } from './bibleRefs'

/** Termini tipici jw.org (italiano) — hint + normalizzazione. */
export const JW_SPEECH_TERMS = [
  'Geova',
  'Gesù Cristo',
  'spirito santo',
  'Regno di Dio',
  'Buona notizia',
  'Sala del Regno',
  'congregazione',
  'territorio',
  'pubblicatore',
  'pioniere',
  'pioniere regolare',
  'pioniere ausiliario',
  'anziano',
  'anziani',
  'servo di ministero',
  'servi di ministero',
  'ministero',
  'predicazione',
  'studio biblico',
  'persona interessata',
  'ritorno',
  'adunanza',
  'adunanze',
  'Riunione Vita e Ministero cristiano',
  'Traduzione del Nuovo Mondo',
  'Torre di Guardia',
  'Svegliatevi',
  'Betel',
  'circoscrizione',
  'assemblea',
  'congresso',
  'battesimo',
  'unzione',
  'nuovo mondo',
  'sistema di cose',
  'giorni ultimi',
  'Rivelazione',
  '1 Corinti',
  '2 Corinti',
  'Scritture ebraiche',
  'Scritture greche cristiane',
] as const

/** Errori frequenti del riconoscimento vocale → forma JW. */
export const JW_STT_CORRECTIONS: Array<[RegExp, string]> = [
  [/\bJehovah\b/gi, 'Geova'],
  [/\bGeov[ae]\b/gi, 'Geova'],
  [/\bGheova\b/gi, 'Geova'],
  [/\bWatchtower\b/gi, 'Torre di Guardia'],
  [/\bKingdom Hall\b/gi, 'Sala del Regno'],
  [/\bsala del regno\b/gi, 'Sala del Regno'],
  [/\b([12])\s*Corinzi\b/gi, '$1 Corinti'],
  [/\bCorinzi\b/gi, 'Corinti'],
  [/\bApocalisse\b/gi, 'Rivelazione'],
  [/\bministeriale\b/gi, 'di ministero'],
  [/\bministeriali\b/gi, 'di ministero'],
  [/\bparrocchia\b/gi, 'congregazione'],
  [/\bevangelizzazione\b/gi, 'predicazione'],
  [/\bNuovo Testamento\b/gi, 'Scritture greche cristiane'],
  [/\bAntico Testamento\b/gi, 'Scritture ebraiche'],
  [/\bVecchio Testamento\b/gi, 'Scritture ebraiche'],
  [/\bspirito Santo\b/g, 'spirito santo'],
  [/\bSpirito Santo\b/g, 'spirito santo'],
]

/** Numeri italiani detti → cifre (per scritture). */
const ONES: Record<string, number> = {
  zero: 0,
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
}

const TENS: Record<string, number> = {
  venti: 20,
  trenta: 30,
  quaranta: 40,
  cinquanta: 50,
  sessanta: 60,
  settanta: 70,
  ottanta: 80,
  novanta: 90,
}

const HUNDREDS: Record<string, number> = {
  cento: 100,
}

/** Converte sequenze di numeri in lettere in cifre (1–176 tipico per versetti). */
export function italianWordsToDigits(text: string): string {
  if (!text) return text
  const token =
    '(?:zero|un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta|cento)'
  const re = new RegExp(`\\b(?:${token})(?:\\s*(?:e\\s+)?${token}){0,3}\\b`, 'gi')
  return text.replace(re, (match) => {
    const parts = match
      .toLocaleLowerCase('it-IT')
      .replace(/\be\b/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    let value = 0
    let i = 0
    while (i < parts.length) {
      const w = parts[i]
      if (HUNDREDS[w] != null) {
        value += HUNDREDS[w]
        i++
        continue
      }
      if (TENS[w] != null) {
        value += TENS[w]
        i++
        if (i < parts.length && ONES[parts[i]] != null && ONES[parts[i]] < 10) {
          value += ONES[parts[i]]
          i++
        }
        continue
      }
      if (ONES[w] != null) {
        value += ONES[w]
        i++
        continue
      }
      return match
    }
    if (value < 1 || value > 176) return match
    return String(value)
  })
}

/** Espande abbreviazioni libro («Pr 14:12», «mt capitolo 5») verso il nome TNM. */
export function expandSpokenBookAbbreviations(text: string): string {
  if (!text) return text
  let out = text
  const entries = Object.entries(BIBLE_ABBREVIATIONS).sort((a, b) => b[0].length - a[0].length)
  for (const [abbr, name] of entries) {
    const esc = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Evita «versetti da 4 a 7» → Daniele: serve capitolo/cap. oppure N:N
    const re = new RegExp(
      `(^|[^\\p{L}\\p{N}])${esc}(?=\\s+(?:capitolo|cap\\.?)|\\s+\\d{1,3}\\s*:)`,
      'giu',
    )
    out = out.replace(re, `$1${name}`)
  }
  return out
}

export function applyJwSttCorrections(text: string): string {
  let out = text
  for (const [re, to] of JW_STT_CORRECTIONS) out = out.replace(re, to)
  return out
}

/** Hint Web Speech arricchiti (libri + termini JW). */
export function richDiscourseSpeechHints(extra: string[] = []): string[] {
  const books = BIBLE_BOOKS.flatMap((b) => [b.name, b.short].filter(Boolean) as string[])
  return [...new Set([...JW_SPEECH_TERMS, ...books, 'capitolo', 'versetto', 'versetti', ...extra])]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60)
}

/** Parole che spesso indicano incertezza / filler STT. */
export const UNCERTAIN_FILLERS = [
  'ehm',
  'hmm',
  'mh',
  'tipo',
  'diciamo',
  'insomma',
  'praticamente',
  'basicamente',
]

/** Trova indizi di parole incerte (filler o doppioni consecutivi). */
export function findUncertainSpans(text: string): Array<{ start: number; end: number; reason: string }> {
  const spans: Array<{ start: number; end: number; reason: string }> = []
  if (!text) return spans
  const fillerRe = new RegExp(`\\b(${UNCERTAIN_FILLERS.join('|')})\\b`, 'gi')
  let m: RegExpExecArray | null
  while ((m = fillerRe.exec(text))) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: 'filler' })
  }
  const dupRe = /\b(\p{L}{3,})\s+\1\b/giu
  while ((m = dupRe.exec(text))) {
    spans.push({ start: m.index, end: m.index + m[0].length, reason: 'ripetizione' })
  }
  return spans.sort((a, b) => a.start - b.start)
}

/** Frasi che suggeriscono passaggio di sezione nel discorso. */
export function detectSpokenSectionCue(
  text: string,
): 'introduzione' | 'punto' | 'conclusione' | null {
  const t = text.trim().toLocaleLowerCase('it-IT')
  if (/^(in\s+conclusione|concludiamo|per\s+concludere|chiudiamo|in\s+chiusura)\b/.test(t)) {
    return 'conclusione'
  }
  if (/^(apriamo|iniziamo|nell['’]?introduzione|per\s+introdurre|partiamo\s+da)\b/.test(t)) {
    return 'introduzione'
  }
  if (/^(punto\s+(uno|due|tre|quattro|cinque|\d)|passiamo\s+al\s+punto|secondo\s+punto|terzo\s+punto)\b/.test(t)) {
    return 'punto'
  }
  return null
}
