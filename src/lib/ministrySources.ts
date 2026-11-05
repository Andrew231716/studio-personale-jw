/**
 * Fonti ufficiali su cui ancorare la sezione Ministero
 * (titoli e simboli pubblicazione come su jw.org / JW Library).
 */
export interface MinistryCoreSource {
  id: string
  /** Titolo italiano tipico di jw.org */
  title: string
  /** Simbolo pubblicazione (pub=) se stabile */
  pub?: string
  /** Tipo per il prompt */
  kind: 'opuscolo' | 'libro' | 'guida' | 'video'
  /** Come usarla nella predicazione */
  useFor: string
}

export const MINISTRY_CORE_SOURCES: MinistryCoreSource[] = [
  {
    id: 'lmd',
    title: 'Ama le persone. Fai discepoli',
    pub: 'lmd',
    kind: 'opuscolo',
    useFor:
      'Amare le persone, coltivare interesse, fare discepoli con tatto e pazienza.',
  },
  {
    id: 'rs',
    title: 'Ragioniamo facendo uso delle Scritture',
    pub: 'rs',
    kind: 'libro',
    useFor:
      'Risposte a obiezioni, soggetti di conversazione, introduzioni e ragionamenti con le Scritture.',
  },
  {
    id: 'be',
    title: 'Traete beneficio dalla Scuola di Ministero Teocratico',
    pub: 'be',
    kind: 'opuscolo',
    useFor:
      'Qualità del discorso, preparazione, chiarezza e buone abitudini di studio per il ministero.',
  },
  {
    id: 'th',
    title: 'Applicati alla lettura e all’insegnamento',
    pub: 'th',
    kind: 'opuscolo',
    useFor:
      'Lettura ad alta voce, insegnamento chiaro, tono, pause, contatto visivo, struttura.',
  },
  {
    id: 'mwb-efficaci',
    title: 'Efficaci nel ministero (Guida per l’adunanza Vita e ministero)',
    pub: 'mwb',
    kind: 'guida',
    useFor:
      'Consigli pratici settimanali della Guida: aperture, dimostrazioni, capacità nel ministero.',
  },
  {
    id: 'ministry-videos',
    title: 'Video della sezione Ministero (jw.org)',
    kind: 'video',
    useFor:
      'Esempi di conversazioni, metodi di predicazione, introduzioni e capacità da imitare.',
  },
]

const CORE_PUBS = new Set(
  MINISTRY_CORE_SOURCES.map((s) => s.pub).filter(Boolean) as string[],
)

const CORE_TITLE_RE = [
  /ama le persone/i,
  /fai discepoli/i,
  /ragioniamo/i,
  /traete beneficio/i,
  /applicati alla lettura/i,
  /efficaci nel ministero/i,
  /affiniamo le (nostre )?capacit/i,
  /guida per l[’']adunanza/i,
  /vita (cristiana )?e ministero/i,
  /introduzioni per il ministero/i,
]

/** True se il risultato appartiene alle fonti ufficiali del Ministero. */
export function isMinistryCoreResult(r: {
  title?: string
  context?: string
  lank?: string
  pub?: string
  url?: string
  kind?: string
  section?: string
}): boolean {
  const pub =
    r.pub ||
    (r.lank || '').replace(/^pub-/i, '').replace(/_VIDEO$/i, '').split('_')[0] ||
    ''
  if (pub && CORE_PUBS.has(pub.toLowerCase())) return true
  if (/^mwb/i.test(pub) || /pub-mwb/i.test(r.lank || '') || /pub=mwb/i.test(r.url || '')) {
    return true
  }
  const blob = `${r.title || ''} ${r.context || ''}`
  if (CORE_TITLE_RE.some((re) => re.test(blob))) return true
  if (r.kind === 'video' || r.section === 'video') {
    // video ministero: lascia che il boost sia soft via titolo/categoria
    if (/ministero|predicazione|introduzione|territorio/i.test(blob)) return true
  }
  return false
}

/** Query mirate: tema + ciascuna fonte ufficiale. */
export function ministrySourceQueries(topic: string): string[] {
  const t = topic.trim()
  if (!t) return []
  return [
    `${t} Ragioniamo`,
    `${t} Ama le persone Fai discepoli`,
    `${t} Traete beneficio ministero`,
    `${t} Applicati alla lettura insegnamento`,
    `Efficaci nel ministero ${t}`,
    `${t} Guida adunanza Vita ministero`,
    `${t} Introduzioni per il ministero`,
  ]
}

/** Blocco da mettere nel contesto AI. */
export function ministryCoreSourcesPromptBlock(): string {
  const lines = MINISTRY_CORE_SOURCES.map(
    (s) =>
      `- ${s.title}${s.pub ? ` (pub=${s.pub})` : ''} [${s.kind}]: ${s.useFor}`,
  )
  return `Fonti UFFICIALI per analisi e preparazione (jw.org / JW Library) — ancora SOLO a queste per metodo e stile:
${lines.join('\n')}
Istruzioni:
- Per preparare la scheda (aperture, punti, obiezioni, inviti) usa esclusivamente l’approccio di queste pubblicazioni/video e i risultati elencati nel contesto.
- Se nei risultati c’è una voce di «Ragioniamo» o «Efficaci nel ministero», usala in priorità.
- Non inventare citazioni letterali lunghe da questi libri: riassumi il metodo e collega scritture/titoli presenti nel contesto.
- La ricerca libera di materiale su tutto jw.org è un passo separato: qui non espandere ad altre pubblicazioni fuori da questo elenco.`
}

/** Punteggio extra per ordinare i risultati (più alto = meglio). */
export function ministryCoreBoost(r: {
  title?: string
  context?: string
  lank?: string
  pub?: string
  url?: string
  kind?: string
  section?: string
  themeScore?: number
}): number {
  let score = typeof r.themeScore === 'number' ? r.themeScore : 0
  if (isMinistryCoreResult(r)) score += 8
  const pub = (r.pub || '').toLowerCase()
  if (pub === 'rs' || pub === 'lmd') score += 3
  if (pub === 'th' || pub === 'be') score += 2
  if (/mwb/i.test(pub) || /efficaci nel ministero/i.test(`${r.title} ${r.context}`)) score += 3
  if (r.kind === 'video' || r.section === 'video') score += 1
  return score
}
