/**
 * Allinea il testo alla terminologia italiana di jw.org / Traduzione del Nuovo Mondo.
 * (es. «2 Corinti», non «2 Corinzi»; «Rivelazione», non «Apocalisse»)
 */

type Replacer = [RegExp, string | ((...args: string[]) => string)]

/** Sostituzioni di nomi dei libri biblici e forme comuni non JW. */
const BOOK_REPLACEMENTS: Replacer[] = [
  // Lettere ai Corinti (TNM italiana)
  [/\b([12])\s*Corinzi\b/gi, '$1 Corinti'],
  [
    /\b(I{1,3}|IV|V)\s*Corinzi\b/gi,
    (_m, n: string) => `${romanToArabic(n)} Corinti`,
  ],
  [/\bCorinzi\b/gi, 'Corinti'],
  // Ultimo libro della Bibbia
  [/\bdell[’']Apocalisse\b/gi, 'di Rivelazione'],
  [/\bApocalisse\b/gi, 'Rivelazione'],
  // Forma lunga → forma usata spesso nelle citazioni JW
  [/\bAtti degli Apostoli\b/gi, 'Atti'],
]

/** Altre forme tipiche da evitare nelle pubblicazioni JW italiane. */
const TERM_REPLACEMENTS: Replacer[] = [
  [/\bJehovah\b/g, 'Geova'],
  [/\bJehovà\b/gi, 'Geova'],
  [/\bWatchtower\b/gi, 'Torre di Guardia'],
  [/\bKingdom Hall\b/gi, 'Sala del Regno'],
]

function romanToArabic(roman: string): string {
  const map: Record<string, string> = {
    I: '1',
    II: '2',
    III: '3',
    IV: '4',
    V: '5',
  }
  return map[roman.toUpperCase()] || roman
}

/** Normalizza un testo verso le forme usate su jw.org (italiano). */
export function normalizeJwItalian(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, to] of [...BOOK_REPLACEMENTS, ...TERM_REPLACEMENTS]) {
    out = out.replace(re, to as never)
  }
  return out
}

export function normalizeJwItalianList(items: string[]): string[] {
  return items
    .map(normalizeJwItalian)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isSectionHeading(s))
}

export function isSectionHeading(line: string): boolean {
  return /^(TITOLO|RIASSUNTO|OBIETTIVI|RIFLESSIONI|DOMANDE|PRATICHE)\b/i.test(
    line.replace(/[*#:]+/g, '').trim(),
  )
}

/** Nota da includere nei prompt di sistema. */
export const JW_ITALIAN_TERM_HINT = `Terminologia biblica italiana di jw.org / Traduzione del Nuovo Mondo:
- Usa «1 Corinti» e «2 Corinti» (MAI «Corinzi»).
- Usa «Rivelazione» (MAI «Apocalisse»).
- Usa i nomi dei libri come nella TNM italiana (es. Matteo, Giovanni, Atti, Romani, Efesini, Filippesi, Ebrei, Giacomo, 1 Pietro, Rivelazione).
- Usa «Geova», «congregazione», «anziani», «Sala del Regno», «adunanze», «ministero», «territorio».
Non usare termini di altre confessioni o di altre traduzioni bibliche quando esistono le forme JW.`
