/**
 * jsPDF con Helvetica standard non misura bene molti Unicode
 * (frecce, trattini tipografici, virgolette curve): le righe
 * risultano troppo lunghe e finiscono sul bordo del foglio.
 * Normalizziamo a un sottoinsieme sicuro prima di split/draw.
 */
export function pdfSafeText(input: string): string {
  if (!input) return ''
  return (
    input
      .normalize('NFKC')
      // frecce / marker di risposta (causa tipica di overflow)
      .replace(/[→⇒➔➜➞➝➙]/g, '>')
      .replace(/[←⇐⬅]/g, '<')
      // trattini tipografici
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      // virgolette / apostrofi
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
      // punti di sospensione e bullet
      .replace(/\u2026/g, '...')
      .replace(/[\u2022\u2023\u2043\u25CF\u25E6\u2219]/g, '-')
      // spazi speciali
      .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
      .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '')
      // restanti non stampabili / fuori WinAnsi tipico (tiene accenti latini)
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  )
}

/** Unisce più righe di un elenco in una sola frase per il PDF. */
export function pdfJoinLines(text: string, sep = ' - '): string {
  return pdfSafeText(text)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join(sep)
}
