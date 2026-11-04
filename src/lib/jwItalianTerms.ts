/**
 * Allinea il testo alla terminologia italiana di jw.org / Traduzione del Nuovo Mondo.
 * (es. «2 Corinti», non «2 Corinzi»; «ministero», non «ministeriale»)
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
  // Divisioni tipiche di altre traduzioni → nomi TNM
  [/\bNuovo Testamento\b/g, 'Scritture greche cristiane'],
  [/\bnuovo testamento\b/gi, 'Scritture greche cristiane'],
  [/\bAntico Testamento\b/g, 'Scritture ebraiche'],
  [/\bVecchio Testamento\b/g, 'Scritture ebraiche'],
  [/\bantico testamento\b/gi, 'Scritture ebraiche'],
  [/\bvecchio testamento\b/gi, 'Scritture ebraiche'],
]

/**
 * Forme da evitare nelle pubblicazioni JW italiane.
 * Ordine: frasi più lunghe / specifiche prima, poi generiche.
 */
const TERM_REPLACEMENTS: Replacer[] = [
  [/\bJehovah\b/g, 'Geova'],
  [/\bJehovà\b/gi, 'Geova'],
  [/\bWatchtower\b/gi, 'Torre di Guardia'],
  [/\bKingdom Hall\b/gi, 'Sala del Regno'],

  // «ministeriale» non è lo stile tipico di jw.org → «ministero»
  [/\bimpegno ministeriale\b/gi, 'impegno nel ministero'],
  [/\battivit[aà] ministeriali\b/gi, 'attività di ministero'],
  [/\battivit[aà] ministeriale\b/gi, 'attività di ministero'],
  [/\blavoro ministeriale\b/gi, 'lavoro di predicazione'],
  [/\bservizio ministeriale\b/gi, 'ministero'],
  [/\bresponsabilit[aà] ministeriali\b/gi, 'responsabilità nel ministero'],
  [/\bresponsabilit[aà] ministeriale\b/gi, 'responsabilità nel ministero'],
  [/\bcompiti ministeriali\b/gi, 'compiti di ministero'],
  [/\bqualit[aà] ministeriali\b/gi, 'qualità nel ministero'],
  [/\besperienza ministeriale\b/gi, 'esperienza nel ministero'],
  [/\bvita ministeriale\b/gi, 'vita nel ministero'],
  [/\bcarriera ministeriale\b/gi, 'servizio nel ministero'],
  [/\baiuto ministeriale\b/gi, 'aiuto per il ministero'],
  [/\baspetto ministeriale\b/gi, 'aspetto del ministero'],
  [/\bruolo ministeriale\b/gi, 'ruolo nel ministero'],
  [/\bformazione ministeriale\b/gi, 'formazione per il ministero'],
  [/\bpreparazione ministeriale\b/gi, 'preparazione per il ministero'],
  [/\bimpegno di predicazione ministeriale\b/gi, 'impegno nel ministero'],
  // «servo ministeriale» → termine ufficiale
  [/\bservi ministeriali\b/gi, 'servi di ministero'],
  [/\bservo ministeriale\b/gi, 'servo di ministero'],
  // residui dell’aggettivo
  [/\bministeriali\b/gi, 'di ministero'],
  [/\bministeriale\b/gi, 'di ministero'],

  // Altre forme non tipiche delle pubblicazioni JW
  [/\bevangelizzazione\b/gi, 'predicazione'],
  [/\bevangelizzare\b/gi, 'predicare'],
  [/\bparrocchia\b/gi, 'congregazione'],
  [/\bparrocchie\b/gi, 'congregazioni'],
  [/\bKingdom Ministry\b/gi, 'Ministero del Regno'],
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
  // Ripulisci raddoppi accidentali tipo «di di ministero»
  out = out.replace(/\bdi\s+di ministero\b/gi, 'di ministero')
  out = out.replace(/\bnel\s+di ministero\b/gi, 'nel ministero')
  out = out.replace(/\bdel\s+di ministero\b/gi, 'del ministero')
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
export const JW_ITALIAN_TERM_HINT = `Terminologia italiana di jw.org / Traduzione del Nuovo Mondo (obbligatoria):
Libri e Bibbia:
- «1 Corinti» e «2 Corinti» (MAI «Corinzi»).
- «Rivelazione» (MAI «Apocalisse»).
- «Scritture ebraiche» / «Scritture greche cristiane» (MAI «Antico/Nuovo Testamento»).
- Nomi dei libri come nella TNM italiana (Matteo, Giovanni, Atti, Romani, Efesini, Filippesi, Ebrei, Giacomo, 1 Pietro, Rivelazione).

Ministero e congregazione (stile jw.org):
- Preferisci SEMPRE «ministero», «nel ministero», «di ministero», «lavoro di predicazione», «predicazione».
- MAI «ministeriale» / «ministeriali» (es. non «impegno ministeriale» ma «impegno nel ministero»).
- «servo di ministero» / «servi di ministero» (non «servo ministeriale»).
- «congregazione», «territorio», «anziani», «adunanze», «Sala del Regno».
- «Riunione Vita e Ministero cristiano», «studio biblico», «campo», «ritorno», «persona interessata».
- «Geova», «Gesù Cristo», «Regno», «Buona notizia», «verità biblica».

Quando il testo è per la PREDICAZIONE / MINISTERO verso il pubblico:
- Destinatario = persona del territorio (pubblico), NON un fratello o una sorella.
- Usa: «la persona», «chi ascolta», «persona interessata» — MAI rivolgersi con «fratello» / «sorella».

Quando il testo è interno alla congregazione (studio personale, decisioni, adunanze):
- Puoi usare: «fratello/sorella», «pubblicatore», «pioniere», «anziano», «corpo degli anziani», «circoscrizione», «Betel», «organizzazione di Geova».

Evita linguaggio da altre confessioni: parrocchia, evangelizzazione (usa predicazione), clero, pastorale, vocazione sacerdotale, ecc.
Se un termine non compare tipicamente su jw.org, riformulalo con parole semplici tipiche delle pubblicazioni JW.`
