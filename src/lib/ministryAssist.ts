import { askAi } from './ai'
import { searchJw, searchJwDeep } from './jwApi'
import { uid } from './id'
import type { JwResult, MinistryAssistKind, MinistryAssistNote, StudyResource } from '../types'

export const MINISTRY_KIND_LABELS: Record<MinistryAssistKind, string> = {
  riassunto: 'Riassunto articolo',
  schema: 'Schema / conversazione',
  spunto: 'Spunti per conversare',
  scritture: 'Scritture e spiegazioni',
  presentazione: 'Schema presentazione',
}

export const MINISTRY_SUGGESTIONS = [
  'Regno di Dio',
  'speranza della risurrezione',
  'perché esiste la sofferenza',
  'chi è Geova',
  'nome di Dio',
  'fine di questo sistema',
  'famiglia',
  'preghiera',
  'cosa succede quando si muore',
  'paradiso terrestre',
  'chi sono i Testimoni di Geova',
  'come si svolge uno studio biblico',
]

function resultsToResources(results: JwResult[]): StudyResource[] {
  return results.slice(0, 10).map((r) => ({
    id: uid('res'),
    title: r.title,
    url: r.url,
    kind: r.kind,
    notes: [r.context, r.snippet].filter(Boolean).join(' — '),
    lank: r.lank,
    docid: r.docid,
  }))
}

function promptForKind(kind: MinistryAssistKind, topic: string): string {
  switch (kind) {
    case 'riassunto':
      return `Aiutami a fare un riassunto chiaro e fedele per il ministero sul tema/articolo “${topic}”, basandoti SOLO sugli articoli/video jw.org del contesto.
Struttura:
- Idea centrale (1-2 frasi)
- 3-5 punti principali
- Una scrittura chiave (nome libro TNM italiana)
- Una domanda gentile da fare alla persona
- Un invito semplice a leggere insieme un articolo tra quelli elencati (cita solo titoli presenti)`
    case 'schema':
      return `Crea uno schema / mini struttura per una conversazione di ministero sul tema “${topic}”.
Formato breve, pratico da usare sul campo:
1. Introduzione cordiale (1 frase)
2. Domanda di interesse
3. 2-3 punti con scritture (TNM italiana)
4. Possibile obiezione + risposta breve basata sui materiali jw.org
5. Conclusione / prossimo passo
Usa solo i risultati jw.org del contesto; non inventare link.`
    case 'presentazione':
      return `Crea uno schema per una breve presentazione / conversazione strutturata sul tema “${topic}” (2-4 minuti), basato SOLO sui materiali jw.org del contesto.
Formato:
1. Titolo della presentazione
2. Obiettivo (1 frase)
3. Apertura (gancio + scrittura)
4. Corpo: 3 punti numerati, ciascuno con scrittura e 1-2 frasi di spiegazione
5. Illustrazione semplice (senza inventare citazioni lunghe)
6. Domanda di interesse / applicazione
7. Invito a leggere/guardare insieme un materiale jw.org citato nel contesto
Tono rispettoso e caldo.`
    case 'spunto':
      return `Dammi spunti pratici per conversare con le persone sul tema “${topic}”.
Elenca:
- 4 aperture di conversazione naturali
- 4 domande che fanno riflettere
- 3 illustrazioni semplici (senza inventare citazioni)
- 3 scritture utili (TNM italiana) collegate ai materiali jw.org elencati
Tono rispettoso, caldo, tipico del ministero dei Testimoni di Geova.`
    case 'scritture':
      return `Per il tema “${topic}”, proponi scritture e brevi spiegazioni utili nel ministero.
Per ogni scrittura (3-6):
- Riferimento in forma TNM italiana (es. 2 Corinti, Rivelazione)
- Perché è utile in conversazione (1-2 frasi)
- Come collegarla a un articolo/video presente nel contesto (solo titoli reali)
Non inventare citazioni letterali lunghe.`
  }
}

function sourceBlockFromResults(results: JwResult[]): string {
  return results
    .slice(0, 12)
    .map((r) => {
      const snip = r.snippet ? ` — ${r.snippet.slice(0, 160)}` : ''
      return `- ${r.title}${r.context ? ` (${r.context})` : ''}${snip}\n  URL: ${r.url}`
    })
    .join('\n')
}

export async function searchMinistryArticles(params: {
  query: string
  language?: string
}): Promise<JwResult[]> {
  const language = params.language || 'I'
  const query = params.query.trim()
  if (!query) return []
  const deep = await searchJwDeep(`${query} ministero predicazione`, {
    language,
    filters: ['publications', 'videos', 'indexes'],
    maxQueries: 4,
    perSection: 8,
  })
  return deep.flat
}

export async function buildMinistryAssist(params: {
  kind: MinistryAssistKind
  topic: string
  language?: string
  /** Se presente, centra il riassunto/schema su questo materiale */
  focus?: Pick<JwResult, 'title' | 'url' | 'snippet' | 'context' | 'lank' | 'docid' | 'kind'>
}): Promise<MinistryAssistNote> {
  const language = params.language || 'I'
  const topic = params.topic.trim()

  let results: JwResult[] = []
  if (params.focus?.url) {
    const extra = await searchJw(topic || params.focus.title, {
      language,
      filter: 'publications',
    }).catch(() => [] as JwResult[])
    results = [
      {
        id: params.focus.docid || params.focus.lank || uid('focus'),
        title: params.focus.title,
        snippet: params.focus.snippet || '',
        kind: params.focus.kind || 'article',
        section: 'articoli',
        url: params.focus.url,
        lank: params.focus.lank,
        docid: params.focus.docid,
        context: params.focus.context,
      },
      ...extra,
    ]
  } else {
    const deep = await searchJwDeep(`${topic} ministero predicazione`, {
      language,
      filters: ['publications', 'videos', 'indexes'],
      maxQueries: 4,
      perSection: 5,
    })
    results = deep.flat
  }

  const resources = resultsToResources(results)
  const sourceBlock = sourceBlockFromResults(results)

  let content = ''
  try {
    content = await askAi({
      prompt: promptForKind(params.kind, topic || params.focus?.title || ''),
      context: `Tema ministero: ${topic}\nTipo: ${MINISTRY_KIND_LABELS[params.kind]}\n${
        params.focus ? `Materiale principale: ${params.focus.title}\nURL: ${params.focus.url}\n` : ''
      }\nFonti jw.org:\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org.'}`,
      allowedUrls: resources.map((r) => r.url),
    })
  } catch {
    content = [
      `Tema: ${topic || params.focus?.title || ''}`,
      '',
      'Cerca su jw.org articoli aggiornati su questo argomento.',
      'Prepara: 1 scrittura, 1 punto principale, 1 domanda gentile, 1 invito a leggere insieme.',
    ].join('\n')
  }

  return {
    id: uid('min'),
    title: `${MINISTRY_KIND_LABELS[params.kind]}: ${topic || params.focus?.title || ''}`.slice(
      0,
      120,
    ),
    kind: params.kind,
    topic: topic || params.focus?.title || '',
    content,
    resources,
    sourceTitle: params.focus?.title,
    sourceUrl: params.focus?.url,
    createdAt: new Date().toISOString(),
  }
}
