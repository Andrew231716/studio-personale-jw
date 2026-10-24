/**
 * Espansione tematica delle ricerche jw.org:
 * non solo parola chiave, ma temi correlati tipici delle pubblicazioni.
 */

const STOPWORDS = new Set([
  'a', 'ad', 'al', 'allo', 'ai', 'agli', 'all', 'agl', 'alla', 'alle',
  'con', 'col', 'coi', 'da', 'dal', 'dallo', 'dai', 'dagli', 'dall', 'dagl', 'dalla', 'dalle',
  'di', 'del', 'dello', 'dei', 'degli', 'dell', 'degl', 'della', 'delle',
  'in', 'nel', 'nello', 'nei', 'negli', 'nell', 'negl', 'nella', 'nelle',
  'su', 'sul', 'sullo', 'sui', 'sugli', 'sull', 'sugl', 'sulla', 'sulle',
  'per', 'tra', 'fra', 'e', 'ed', 'o', 'od', 'ma', 'se', 'che', 'chi', 'cui',
  'un', 'una', 'uno', 'il', 'lo', 'la', 'i', 'gli', 'le', 'l',
  'mi', 'ti', 'si', 'ci', 'vi', 'ne', 'io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro',
  'mio', 'mia', 'tuo', 'tua', 'suo', 'sua', 'nostro', 'vostra',
  'questo', 'questa', 'quello', 'quella', 'come', 'quando', 'dove', 'perche', 'perché',
  'anche', 'ancora', 'gia', 'già', 'molto', 'poco', 'piu', 'più', 'meno',
  'essere', 'avere', 'fare', 'sono', 'sei', 'e', 'ho', 'hai', 'ha',
  'aiutami', 'aiutare', 'voglio', 'vorrei', 'posso', 'deve', 'devi', 'devo',
  'parlare', 'tema', 'argomento', 'studio', 'cercare', 'trovare', 'articolo', 'articoli',
  'video', 'pubblicazione', 'jw', 'jworg', 'org',
])

/** Temi JW → termini di ricerca correlati (contenuto / contesto tipico). */
const THEME_MAP: Array<{ match: RegExp; queries: string[]; tokens: string[] }> = [
  {
    match: /congregaz|territor|adunanz|sala del regno|proclamator|trasfer/i,
    queries: [
      'ambientarsi in una nuova congregazione',
      'congregazione del territorio',
      'adunanze di congregazione',
      'lettera di presentazione congregazione',
    ],
    tokens: ['congregazione', 'territorio', 'adunanze', 'proclamatore', 'anziani', 'associazione'],
  },
  {
    match: /preghier|pregare|supplic/i,
    queries: ['come pregare', 'preghiera personale', 'Geova ascolta le preghiere'],
    tokens: ['preghiera', 'pregare', 'Geova', 'fiducia', 'ringraziamento'],
  },
  {
    match: /ansie|ansia|preoccup|stress|paura|angosc/i,
    queries: ['superare l’ansia', 'pace interiore', 'fiducia in Geova'],
    tokens: ['ansia', 'pace', 'fiducia', 'preoccupazioni', 'conforto'],
  },
  {
    match: /famigl|matrimon|marito|moglie|genitor|figli/i,
    queries: ['famiglia cristiana', 'matrimonio', 'genitori e figli'],
    tokens: ['famiglia', 'matrimonio', 'genitori', 'amore', 'rispetto'],
  },
  {
    match: /minister|predic|campo|testimonianz|discepol/i,
    queries: ['ministero', 'predicare con coraggio', 'studio biblico'],
    tokens: ['ministero', 'predicazione', 'campo', 'discepoli', 'buona notizia'],
  },
  {
    match: /perdon|risentiment|offesa/i,
    queries: ['perdono', 'perdonare come Geova'],
    tokens: ['perdono', 'misericordia', 'pace', 'amore'],
  },
  {
    match: /decision|scelta|decid/i,
    queries: ['prendere buone decisioni', 'saggezza biblica decisioni'],
    tokens: ['decisioni', 'principi', 'coscienza', 'saggezza'],
  },
  {
    match: /fede|fiducia|dubbi/i,
    queries: ['rafforzare la fede', 'fiducia in Geova'],
    tokens: ['fede', 'fiducia', 'speranza', 'Geova'],
  },
  {
    match: /amor[ei]|carit/i,
    queries: ['amore cristiano', 'amore di Geova'],
    tokens: ['amore', 'carità', 'bontà', 'fratelli'],
  },
  {
    match: /pazienz|longanimit/i,
    queries: ['pazienza', 'frutto dello spirito pazienza'],
    tokens: ['pazienza', 'spirito', 'calma'],
  },
  {
    match: /regno|paradiso|risurrezion|speranza/i,
    queries: ['speranza del Regno', 'risurrezione', 'paradiso terrestre'],
    tokens: ['Regno', 'speranza', 'risurrezione', 'paradiso'],
  },
  {
    match: /ges[uù]|cristo|riscatt/i,
    queries: ['Gesù Cristo', 'riscatto', 'esempio di Gesù'],
    tokens: ['Gesù', 'Cristo', 'riscatto', 'discepolo'],
  },
  {
    match: /geova|dio|nome di dio/i,
    queries: ['chi è Geova', 'nome di Dio', 'amicizia con Geova'],
    tokens: ['Geova', 'Dio', 'nome', 'amicizia'],
  },
  {
    match: /allontan|disassoc|riammiss|riassoc/i,
    queries: ['allontanamento dalla congregazione', 'riammissione'],
    tokens: ['congregazione', 'pentimento', 'misericordia', 'anziani'],
  },
]

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeToken(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9àèéìòù'\-]/gi, '')
}

/** Normalizza testo lungo mantenendo gli spazi (per matching nel contesto). */
function normalizeText(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9àèéìòù'\-\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractThemeTokens(text: string): string[] {
  const raw = stripHtml(text)
    .split(/[\s,.;:!?/()\[\]«»"']+/)
    .map(normalizeToken)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  const uniq: string[] = []
  for (const t of raw) {
    if (!uniq.includes(t)) uniq.push(t)
  }
  return uniq.slice(0, 14)
}

export function buildThematicQueries(userText: string, max = 5): { queries: string[]; themeTokens: string[] } {
  const cleaned = stripHtml(userText).trim()
  const themeTokens = extractThemeTokens(cleaned)
  const queries: string[] = []

  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim()
    if (!t || queries.some((x) => x.toLowerCase() === t.toLowerCase())) return
    queries.push(t)
  }

  // Query principale: testo utente abbreviato (senza rumore conversazionale)
  const core = themeTokens.slice(0, 6).join(' ')
  if (cleaned.length <= 90) push(cleaned)
  if (core) push(core)

  for (const theme of THEME_MAP) {
    if (theme.match.test(cleaned)) {
      for (const q of theme.queries) push(q)
      for (const t of theme.tokens) {
        if (!themeTokens.includes(normalizeToken(t))) themeTokens.push(normalizeToken(t))
      }
    }
  }

  // Variante “tema + contesto tipico”
  if (themeTokens.length >= 2) {
    push(`${themeTokens[0]} ${themeTokens[1]} principi biblici`)
  }

  return { queries: queries.slice(0, max), themeTokens: themeTokens.slice(0, 18) }
}

/** Punti in base a quanto titolo/snippet/context parlano del tema, non solo della parola. */
export function scoreThemeMatch(
  result: { title: string; snippet?: string; context?: string },
  themeTokens: string[],
  query: string,
): number {
  const title = normalizeText(result.title)
  const snippet = normalizeText(stripHtml(result.snippet || ''))
  const context = normalizeText(result.context || '')
  const hayTitle = ` ${title} `
  const haySnippet = ` ${snippet} `

  let score = 0
  for (const token of themeTokens) {
    if (!token || token.length < 3) continue
    const needle = token
    if (hayTitle.includes(needle)) score += 4
    else if (haySnippet.includes(needle)) score += 2.5
    else if (context.includes(needle)) score += 1
  }

  // Bonus se più token del tema co-occorrono nello snippet (contesto tematico)
  const hitsInSnippet = themeTokens.filter((t) => t.length >= 4 && haySnippet.includes(t)).length
  if (hitsInSnippet >= 2) score += 3
  if (hitsInSnippet >= 3) score += 2

  const qTokens = extractThemeTokens(query)
  for (const t of qTokens) {
    if (hayTitle.includes(t)) score += 1.5
    if (haySnippet.includes(t)) score += 1
  }

  return score
}
