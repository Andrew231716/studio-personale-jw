import { askAi } from './ai'
import { searchJwDeep } from './jwApi'
import { uid } from './id'
import type { JwResult, MinistryAssistKind, MinistryAssistNote, StudyResource } from '../types'

export const MINISTRY_KIND_LABELS: Record<MinistryAssistKind, string> = {
  riassunto: 'Riassunto articolo',
  schema: 'Schema / mini struttura',
  spunto: 'Spunti per conversare',
  scritture: 'Scritture e spiegazioni',
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
]

function resultsToResources(results: JwResult[]): StudyResource[] {
  return results.slice(0, 8).map((r) => ({
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
      return `Aiutami a fare un riassunto chiaro e fedele per il ministero sul tema “${topic}”, basandoti SOLO sugli articoli/video jw.org del contesto.
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

export async function buildMinistryAssist(params: {
  kind: MinistryAssistKind
  topic: string
  language?: string
}): Promise<MinistryAssistNote> {
  const language = params.language || 'I'
  const topic = params.topic.trim()
  const deep = await searchJwDeep(`${topic} ministero predicazione`, {
    language,
    filters: ['publications', 'videos', 'indexes'],
    maxQueries: 4,
    perSection: 5,
  })
  const resources = resultsToResources(deep.flat)
  const sourceBlock = deep.sections
    .map(
      (s) =>
        `### ${s.label}\n` +
        s.items
          .map((r) => {
            const snip = r.snippet ? ` — ${r.snippet.slice(0, 140)}` : ''
            return `- ${r.title}${r.context ? ` (${r.context})` : ''}${snip}\n  URL: ${r.url}`
          })
          .join('\n'),
    )
    .join('\n\n')

  let content = ''
  try {
    content = await askAi({
      prompt: promptForKind(params.kind, topic),
      context: `Tema ministero: ${topic}\nTipo: ${MINISTRY_KIND_LABELS[params.kind]}\n\nFonti jw.org:\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org.'}`,
      allowedUrls: resources.map((r) => r.url),
    })
  } catch {
    content = [
      `Tema: ${topic}`,
      '',
      'Cerca su jw.org articoli aggiornati su questo argomento.',
      'Prepara: 1 scrittura, 1 punto principale, 1 domanda gentile, 1 invito a leggere insieme.',
    ].join('\n')
  }

  return {
    id: uid('min'),
    title: `${MINISTRY_KIND_LABELS[params.kind]}: ${topic}`.slice(0, 120),
    kind: params.kind,
    topic,
    content,
    resources,
    createdAt: new Date().toISOString(),
  }
}
