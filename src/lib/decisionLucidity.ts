import { askAi } from './ai'
import { searchJwDeep } from './jwApi'
import type { ContentKind, DecisionItem, JwResult, JwSectionId, StudyTopic } from '../types'

const LUCIDITY_QUERIES_HINT =
  'prendere decisioni saggezza preghiera emozioni sentimento ragione consiglio biblico cuore coscienza'

/**
 * Cerca su jw.org materiale su saggezza, emozioni e decisioni,
 * poi analizza la scelta e le motivazioni oneste dell’utente.
 */
export async function analyzeDecisionLucidity(params: {
  decision: DecisionItem
  language?: string
  linkedTopics?: StudyTopic[]
}): Promise<{ analysis: string; sources: JwResult[]; queriesUsed: string[] }> {
  const { decision, language = 'I', linkedTopics = [] } = params
  const chosen = (decision.chosenDecision || '').trim()
  const motives = (decision.honestMotivations || '').trim()
  if (!chosen || !motives) {
    throw new Error('Scrivi prima la decisione presa e le motivazioni oneste.')
  }

  const searchSeed = [
    decision.title,
    chosen.slice(0, 120),
    motives.slice(0, 180),
    LUCIDITY_QUERIES_HINT,
  ]
    .filter(Boolean)
    .join(' ')

  const deep = await searchJwDeep(searchSeed, {
    language,
    maxQueries: 6,
    perSection: 4,
    filters: ['publications', 'videos', 'indexes', 'bible'],
  })

  const linkedResults: JwResult[] = (decision.relatedResources || []).map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    snippet: r.notes || (r.bible ? `Scrittura ${r.bible}` : ''),
    kind: (r.kind || 'article') as ContentKind,
    lank: r.lank,
    docid: r.docid,
    wolUrl: r.wolUrl,
    section: kindToSection(r.kind),
  }))

  const sources = mergeSources(linkedResults, deep.flat).slice(0, 14)
  const context = buildLucidityContext(decision, linkedTopics, sources)

  const prompt = `Analizza in modo rispettoso e concreto la decisione che ho già preso e le motivazioni che ho scritto in modo onesto.

Obiettivo dell’analisi (obbligatorio):
1. Capire se la scelta sembra presa con buon senso e ragionevolezza, secondo i principi biblici nei materiali jw.org del contesto.
2. Individuare segnali che le emozioni (paura, orgoglio, impulso, rabbia, desiderio di piacere ad altri, stanchezza, ecc.) possano aver guidato più della lucidità.
3. Distinguere ciò che è onesto e sano da ciò che va ripesato con calma.
4. Suggerire domande di preghiera e di riflessione, e (solo se utile) consigli pratici allineati alle fonti jw.org elencate — senza inventare articoli o versetti.

Formato della risposta:
- Sintesi breve (2-4 frasi)
- Segnali di lucidità / buon senso
- Segnali di possibile influenza emotiva
- Principi da jw.org (cita SOLO titoli/URL presenti nel contesto)
- Domande oneste da pormi ancora
- Passo successivo prudente

Terminologia: usa solo lo stile italiano di jw.org (es. «impegno nel ministero», MAI «impegno ministeriale»; «servo di ministero»; «1 Corinti», non «Corinzi»).

Non giudicare la persona. Non sostituire la coscienza, gli anziani né la Bibbia. Non inventare fonti.`

  const analysis = await askAi({
    prompt,
    context,
    allowedUrls: sources.map((s) => s.url).filter(Boolean),
  })

  return {
    analysis,
    sources,
    queriesUsed: deep.queriesUsed || [],
  }
}

function kindToSection(kind: ContentKind | undefined): JwSectionId {
  switch (kind) {
    case 'video':
      return 'video'
    case 'audio':
      return 'audio'
    case 'book':
      return 'libri'
    case 'brochure':
      return 'opuscoli'
    case 'bible':
      return 'bibbia'
    case 'index':
      return 'indici'
    default:
      return 'articoli'
  }
}

function mergeSources(a: JwResult[], b: JwResult[]): JwResult[] {
  const map = new Map<string, JwResult>()
  for (const r of [...a, ...b]) {
    const key = `${r.docid || ''}|${r.lank || ''}|${r.url}`
    if (!map.has(key)) map.set(key, r)
  }
  return Array.from(map.values())
}

function buildLucidityContext(
  decision: DecisionItem,
  linkedTopics: StudyTopic[],
  sources: JwResult[],
): string {
  const parts: string[] = [
    `Titolo decisione: ${decision.title} (${decision.scale})`,
    `Contesto: ${decision.context || '—'}`,
    `Decisione presa (dichiarata dall’utente): ${decision.chosenDecision}`,
    `Motivazioni oneste (dichiarate dall’utente):\n${decision.honestMotivations}`,
  ]

  if (decision.priorities?.length) {
    parts.push(
      'Priorità dichiarate:\n' +
        decision.priorities
          .map((p) => `- ${p.label} (peso ${p.weight})${p.note ? `: ${p.note}` : ''}`)
          .join('\n'),
    )
  }
  if (decision.pros?.filter(Boolean).length) {
    parts.push('Pro: ' + decision.pros.filter(Boolean).join('; '))
  }
  if (decision.cons?.filter(Boolean).length) {
    parts.push('Contro: ' + decision.cons.filter(Boolean).join('; '))
  }
  if (decision.conclusion?.trim()) {
    parts.push(`Conclusione precedente: ${decision.conclusion.slice(0, 600)}`)
  }
  if (decision.prayerNotes?.trim()) {
    parts.push(`Appunti di preghiera: ${decision.prayerNotes.slice(0, 400)}`)
  }
  if (linkedTopics.length) {
    parts.push(
      'Argomenti di studio collegati:\n' +
        linkedTopics
          .map(
            (t) =>
              `- ${t.title}${t.interest ? `: ${t.interest.slice(0, 140)}` : ''}`,
          )
          .join('\n'),
    )
  }
  if (sources.length) {
    parts.push(
      'Materiale jw.org (uniche fonti citabili per l’analisi):\n' +
        sources
          .map((r) => {
            const snip = r.snippet ? ` — ${r.snippet.slice(0, 160)}` : ''
            const sec = r.section ? `[${r.section}] ` : ''
            return `- ${sec}${r.title}${snip}\n  URL: ${r.url}`
          })
          .join('\n'),
    )
  } else {
    parts.push(
      'Nessun risultato jw.org disponibile: non inventare titoli né link; invita a cercare su jw.org.',
    )
  }

  return parts.join('\n\n')
}
