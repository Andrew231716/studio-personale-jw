/**
 * Espansione tematica delle ricerche jw.org:
 * non solo parola chiave, ma temi correlati tipici delle pubblicazioni.
 * Il punteggio privilegia i termini dell’utente rispetto a quelli espansi.
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
  'video', 'pubblicazione', 'jw', 'jworg', 'org', 'verso', 'versetto', 'versetti',
  'capitolo', 'bibbia', 'scrittura', 'scritture',
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
    tokens: ['congregazione', 'territorio', 'adunanze', 'proclamatore', 'anziani'],
  },
  {
    match: /preghier|pregare|supplic/i,
    queries: ['come pregare', 'preghiera personale', 'Geova ascolta le preghiere'],
    tokens: ['preghiera', 'pregare', 'fiducia', 'ringraziamento'],
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
    tokens: ['ministero', 'predicazione', 'campo', 'discepoli'],
  },
  {
    match: /perdon|risentiment|offesa/i,
    queries: ['perdono', 'perdonare come Geova'],
    tokens: ['perdono', 'misericordia', 'pace'],
  },
  {
    match: /decision|scelta|decid|soppes/i,
    queries: ['prendere buone decisioni', 'saggezza biblica decisioni'],
    tokens: ['decisioni', 'principi', 'coscienza', 'saggezza'],
  },
  {
    match: /fede|fiducia|dubbi/i,
    queries: ['rafforzare la fede', 'fiducia in Geova'],
    tokens: ['fede', 'fiducia', 'speranza'],
  },
  {
    match: /amor[ei]|carit/i,
    queries: ['amore cristiano', 'amore di Geova'],
    tokens: ['amore', 'bontà'],
  },
  {
    match: /pazienz|longanimit/i,
    queries: ['pazienza', 'frutto dello spirito pazienza'],
    tokens: ['pazienza', 'calma'],
  },
  {
    match: /regno|paradiso|risurrezion|speranza/i,
    queries: ['speranza del Regno', 'risurrezione', 'paradiso terrestre'],
    tokens: ['regno', 'speranza', 'risurrezione', 'paradiso'],
  },
  {
    match: /ges[uù]|cristo|riscatt/i,
    queries: ['Gesù Cristo', 'riscatto', 'esempio di Gesù'],
    tokens: ['gesu', 'cristo', 'riscatto'],
  },
  {
    match: /geova|nome di dio/i,
    queries: ['chi è Geova', 'nome di Dio', 'amicizia con Geova'],
    tokens: ['geova', 'nome', 'amicizia'],
  },
  {
    match: /allontan|disassoc|riammiss|riassoc/i,
    queries: ['allontanamento dalla congregazione', 'riammissione'],
    tokens: ['congregazione', 'pentimento', 'misericordia', 'anziani'],
  },
]

/** Token generici che da soli non bastano a dire che un risultato è attinente. */
const WEAK_TOKENS = new Set([
  'geova', 'dio', 'gesu', 'cristo', 'amore', 'fede', 'pace', 'speranza', 'bibbia',
  'principi', 'saggezza', 'coscienza', 'bonta', 'fratelli', 'regno',
])

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

export function buildThematicQueries(
  userText: string,
  max = 5,
): {
  queries: string[]
  themeTokens: string[]
  /** Solo termini dell’utente (per attinenza stretta). */
  userTokens: string[]
} {
  const cleaned = stripHtml(userText).trim()
  const userTokens = extractThemeTokens(cleaned)
  const themeTokens = [...userTokens]
  const queries: string[] = []

  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim()
    if (!t || queries.some((x) => x.toLowerCase() === t.toLowerCase())) return
    queries.push(t)
  }

  // Query principale: testo utente abbreviato (senza rumore conversazionale)
  const core = userTokens.slice(0, 6).join(' ')
  if (cleaned.length <= 90) push(cleaned)
  if (core) push(core)

  let themeHits = 0
  for (const theme of THEME_MAP) {
    if (!theme.match.test(cleaned)) continue
    themeHits += 1
    // Evita di diluire troppo: al massimo 2 temi espansi
    if (themeHits <= 2) {
      for (const q of theme.queries.slice(0, 2)) push(q)
    }
    for (const t of theme.tokens) {
      const n = normalizeToken(t)
      if (n && !themeTokens.includes(n)) themeTokens.push(n)
    }
  }

  // Variante stretta solo se l’utente ha abbastanza termini distintivi
  if (userTokens.length >= 2) {
    push(`${userTokens[0]} ${userTokens[1]}`)
  }

  return {
    queries: queries.slice(0, max),
    themeTokens: themeTokens.slice(0, 18),
    userTokens: userTokens.slice(0, 14),
  }
}

/**
 * Punti in base a quanto titolo/snippet parlano del tema dell’utente.
 * I token espansi (tema JW) pesano meno; i token deboli da soli non bastano.
 */
export function scoreThemeMatch(
  result: { title: string; snippet?: string; context?: string },
  themeTokens: string[],
  query: string,
  userTokens: string[] = [],
): number {
  const title = normalizeText(result.title)
  const snippet = normalizeText(stripHtml(result.snippet || ''))
  const context = normalizeText(result.context || '')
  const hayTitle = ` ${title} `
  const haySnippet = ` ${snippet} `
  const hayAll = ` ${title} ${snippet} ${context} `

  const primary = userTokens.length ? userTokens : extractThemeTokens(query)
  const expanded = themeTokens.filter((t) => !primary.includes(t))

  let score = 0
  let userHits = 0
  let strongUserHits = 0

  for (const token of primary) {
    if (!token || token.length < 3) continue
    const inTitle = hayTitle.includes(token)
    const inSnippet = haySnippet.includes(token)
    if (inTitle) {
      score += WEAK_TOKENS.has(token) ? 2 : 5
      userHits += 1
      if (!WEAK_TOKENS.has(token)) strongUserHits += 1
    } else if (inSnippet) {
      score += WEAK_TOKENS.has(token) ? 1 : 3
      userHits += 1
      if (!WEAK_TOKENS.has(token)) strongUserHits += 1
    }
  }

  for (const token of expanded) {
    if (!token || token.length < 4) continue
    if (hayTitle.includes(token)) score += 1.2
    else if (haySnippet.includes(token)) score += 0.6
  }

  // Co-occorrenza di più termini utente nello stesso risultato
  if (userHits >= 2) score += 3
  if (userHits >= 3) score += 2
  if (strongUserHits >= 2) score += 2

  // Frase query quasi intera nel titolo
  const qNorm = normalizeText(query)
  if (qNorm.length >= 8 && hayTitle.includes(qNorm.slice(0, Math.min(qNorm.length, 40)))) {
    score += 4
  }

  // Senza alcun termine utente nel testo → punteggio quasi nullo
  // (evita risultati generici da query tematiche espanse)
  if (primary.length > 0 && userHits === 0) {
    score = Math.min(score, 1.5)
  }

  // Solo token deboli (Geova, amore…) senza termini distintivi
  if (primary.some((t) => !WEAK_TOKENS.has(t)) && strongUserHits === 0 && userHits > 0) {
    score *= 0.55
  }

  // Piccolo bonus se il context (pubblicazione) è coerente, senza salvare risultati irrilevanti
  if (userHits > 0) {
    for (const token of primary.slice(0, 4)) {
      if (token.length >= 4 && context.includes(token)) score += 0.4
    }
  }

  void hayAll
  return score
}

/** True se il testo sembra un riferimento biblico (es. «Proverbi 3:5»). */
export function looksLikeScriptureQuery(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^\s*((?:\d\s*)?[A-Za-zÀ-ÿ']+(?:\s+[A-Za-zÀ-ÿ']+)*)\s+\d+(?::\d+(?:\s*[-–]\s*\d+)?)?\s*$/i.test(t)) {
    return true
  }
  return /\b(genesi|esodo|levitico|numeri|deuteronomio|giosue|giudici|rut|samuele|re|cronache|esdra|neemia|ester|giobbe|salmi|proverbi|ecclesiaste|cantico|isaia|geremia|lamentazioni|ezechiele|daniele|osea|gioele|amos|obadia|giona|michea|naum|abacuc|sofonica|aggeo|zaccaria|malachia|matteo|marco|luca|giovanni|atti|romani|corinti|galati|efesini|filippesi|colossesi|tessalonicesi|timoteo|tito|filemone|ebrei|giacomo|pietro|giuda|rivelazione)\b/i.test(
    t,
  )
}
