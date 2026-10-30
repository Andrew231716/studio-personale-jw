import { askAi } from './ai'
import { searchJwDeep } from './jwApi'
import { uid } from './id'
import type { BibleReadingKind, BibleReadingPlan, JwResult, StudyResource } from '../types'

export const BIBLE_READING_SUGGESTIONS: Record<
  BibleReadingKind,
  Array<{ label: string; query: string }>
> = {
  personaggio: [
    { label: 'Abramo', query: 'Abramo fede Bibbia' },
    { label: 'Giuseppe', query: 'Giuseppe figlio di Giacobbe' },
    { label: 'Mosè', query: 'Mosè Esodo' },
    { label: 'Rut', query: 'Rut lealtà' },
    { label: 'Davide', query: 'Davide re Israele' },
    { label: 'Daniele', query: 'Daniele integrità' },
    { label: 'Ester', query: 'Ester coraggio' },
    { label: 'Gesù', query: 'Gesù Cristo esempio' },
    { label: 'Pietro', query: 'apostolo Pietro' },
    { label: 'Paolo', query: 'apostolo Paolo' },
  ],
  racconto: [
    { label: 'Creazione', query: 'creazione Genesi' },
    { label: 'Diluvio', query: 'Noè diluvio' },
    { label: 'Esodo', query: 'uscita dall’Egitto Esodo' },
    { label: 'Davide e Golia', query: 'Davide e Golia' },
    { label: 'Forno ardente', query: 'tre ebrei forno ardente' },
    { label: 'Figliol prodigo', query: 'parabola del figlio prodigo' },
    { label: 'Buon samaritano', query: 'parabola del buon samaritano' },
    { label: 'Risurrezione di Lazzaro', query: 'risurrezione di Lazzaro' },
  ],
  libro: [
    { label: 'Genesi', query: 'libro di Genesi panoramica' },
    { label: 'Salmi', query: 'libro dei Salmi' },
    { label: 'Proverbi', query: 'libro dei Proverbi saggezza' },
    { label: 'Isaia', query: 'libro di Isaia' },
    { label: 'Matteo', query: 'vangelo di Matteo' },
    { label: 'Giovanni', query: 'vangelo di Giovanni' },
    { label: 'Atti', query: 'libro degli Atti' },
    { label: 'Romani', query: 'lettera ai Romani' },
    { label: '1 Corinti', query: '1 Corinti lettera' },
    { label: 'Rivelazione', query: 'libro di Rivelazione' },
  ],
  tema: [
    { label: 'Preghiera', query: 'preghiera Bibbia esempi' },
    { label: 'Fede', query: 'fede esempi biblici' },
    { label: 'Perdono', query: 'perdono Bibbia' },
    { label: 'Regno di Dio', query: 'Regno di Dio Bibbia' },
    { label: 'Risurrezione', query: 'risurrezione speranza Bibbia' },
    { label: 'Amore', query: 'amore cristiano Bibbia' },
  ],
}

export const BIBLE_KIND_LABELS: Record<BibleReadingKind, string> = {
  personaggio: 'Personaggi',
  racconto: 'Racconti',
  libro: 'Libri',
  tema: 'Temi',
}

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

export async function buildBibleReadingPlan(params: {
  kind: BibleReadingKind
  query: string
  language?: string
}): Promise<BibleReadingPlan> {
  const language = params.language || 'I'
  const query = params.query.trim()
  const deep = await searchJwDeep(`${query} Bibbia lettura`, {
    language,
    filters: ['publications', 'indexes', 'videos', 'bible'],
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

  const kindLabel = BIBLE_KIND_LABELS[params.kind]
  const prompt = `Propomi un percorso di lettura della Bibbia su “${query}” (categoria: ${kindLabel}).
Struttura la risposta così:
1. Titolo del percorso
2. Perché vale la pena leggerlo (2-3 frasi)
3. Passi di lettura consigliati (scritture o capitoli in forma TNM italiana, es. 1 Corinti, Rivelazione)
4. Domande di riflessione (3-5)
5. Come collegarlo agli articoli/video jw.org elencati nel contesto (cita solo quei titoli)
Non inventare link. Usa solo terminologia jw.org.`

  let plan = ''
  try {
    plan = await askAi({
      prompt,
      context: `Categoria: ${kindLabel}\nQuery: ${query}\n\nFonti jw.org:\n${sourceBlock || 'Nessuna fonte: invita a cercare su jw.org.'}`,
      allowedUrls: resources.map((r) => r.url),
    })
  } catch {
    plan = [
      `Percorso di lettura: ${query}`,
      '',
      'Consulta su jw.org / JW Library i risultati trovati e scegli 2-3 scritture o articoli da leggere con calma.',
      'Annota: Cosa imparo su Geova? Cosa posso applicare?',
    ].join('\n')
  }

  const titleMatch = plan.match(/^(?:1\.\s*)?(?:Titolo[^:\n]*:\s*)?(.+)$/m)
  return {
    id: uid('bible'),
    title: (titleMatch?.[1] || `Lettura: ${query}`).replace(/\*\*/g, '').trim().slice(0, 120),
    kind: params.kind,
    query,
    plan,
    resources,
    createdAt: new Date().toISOString(),
  }
}
