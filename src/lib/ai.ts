import { DECISION_STEPS, STUDY_STEPS } from './studyMethod'
import type { AiMessage, DecisionItem, JwResult, StudyTopic } from '../types'
import { uid } from './id'

const SYSTEM_GROUNDING = `Sei un assistente per lo studio personale basato esclusivamente su materiali di jw.org (articoli e video del sito ufficiale dei Testimoni di Geova).
Regole:
- Non inventare citazioni letterali di pubblicazioni. Se non hai un titolo reale dai risultati di ricerca, invita a cercarlo su jw.org.
- Aiuta a elaborare pensieri, risposte, azioni e decisioni con tono rispettoso, caldo e pratico.
- Struttura i consigli secondo: preghiera → obiettivi → ricerca su jw.org → riflessione → applicazione.
- Per le decisioni: priorità, principi, pro/contro, conclusione basata sui dati forniti dall'utente.
- Rispondi sempre in italiano.
- Non sostituisci la Bibbia, gli anziani o la coscienza personale.`

export async function askAi(params: {
  prompt: string
  history?: AiMessage[]
  context?: string
}): Promise<string> {
  const { prompt, history = [], context = '' } = params
  try {
    const remote = await askPollinations(prompt, history, context)
    if (remote?.trim()) return remote.trim()
  } catch {
    // fallback locale
  }
  return localCoach(prompt, context)
}

async function askPollinations(
  prompt: string,
  history: AiMessage[],
  context: string,
): Promise<string> {
  const messages = [
    { role: 'system', content: SYSTEM_GROUNDING + (context ? `\n\nContesto:\n${context}` : '') },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: prompt },
  ]

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      model: 'openai',
      seed: Date.now() % 100000,
    }),
  })

  if (!res.ok) throw new Error(`AI HTTP ${res.status}`)
  const text = await res.text()
  // Some pollinations responses are plain text; others JSON
  try {
    const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content
    if (content) return content
  } catch {
    // plain text
  }
  return text
}

function localCoach(prompt: string, context: string): string {
  const lower = prompt.toLowerCase()
  const steps = lower.includes('decision') || lower.includes('scelta') || lower.includes('decid')
    ? DECISION_STEPS
    : STUDY_STEPS

  const stepBlock = steps.map((s, i) => `${i + 1}. **${s.title}** — ${s.detail}`).join('\n')

  let focus = 'studio personale'
  if (lower.includes('pregh')) focus = 'preghiera e dipendenza da Geova'
  if (lower.includes('ans') || lower.includes('preoccup')) focus = 'pace interiore e fiducia'
  if (lower.includes('famigl')) focus = 'famiglia e priorità'
  if (lower.includes('minister') || lower.includes('predica')) focus = 'ministero e amore per le persone'

  return [
    `Ecco un aiuto strutturato (modalità locale gratuita) sul tema “${focus}”.`,
    '',
    context ? `Ho tenuto conto di questo contesto:\n${context}\n` : '',
    'Percorso consigliato, allineato ai consigli tipici di articoli e video su jw.org:',
    stepBlock,
    '',
    'Per elaborare la tua risposta:',
    '1. Scrivi in 2-3 frasi cosa senti davvero.',
    '2. Collega ogni frase a un principio o a un articolo/video trovato su jw.org.',
    '3. Scegli una sola azione pratica da provare entro 48 ore.',
    '4. Chiudi con una preghiera breve e specifica.',
    '',
    `La tua richiesta: “${prompt.trim()}”`,
    '',
    'Se vuoi, incolla qui i titoli degli articoli/video che hai trovato e ti aiuto a trasformarli in obiettivi, domande e passi concreti.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildStudyContext(topic?: StudyTopic | null, results: JwResult[] = []): string {
  const parts: string[] = []
  if (topic) {
    parts.push(`Argomento: ${topic.title}`)
    if (topic.interest) parts.push(`Interesse: ${topic.interest}`)
    if (topic.objectives.length) parts.push(`Obiettivi: ${topic.objectives.join('; ')}`)
    if (topic.reflections.some((r) => r.response)) {
      parts.push(
        'Riflessioni:\n' +
          topic.reflections
            .filter((r) => r.response)
            .map((r) => `- ${r.prompt}: ${r.response}`)
            .join('\n'),
      )
    }
  }
  if (results.length) {
    parts.push(
      'Risultati jw.org:\n' +
        results
          .slice(0, 8)
          .map((r) => `- [${r.kind}] ${r.title} (${r.url})`)
          .join('\n'),
    )
  }
  return parts.join('\n\n')
}

export function buildDecisionContext(decision?: DecisionItem | null, results: JwResult[] = []): string {
  if (!decision && !results.length) return ''
  const parts: string[] = []
  if (decision) {
    parts.push(`Decisione: ${decision.title} (${decision.scale})`)
    parts.push(`Contesto: ${decision.context}`)
    if (decision.priorities.length) {
      parts.push(
        'Priorità:\n' +
          decision.priorities.map((p) => `- ${p.label} peso ${p.weight}: ${p.note}`).join('\n'),
      )
    }
    if (decision.pros.length) parts.push('Pro: ' + decision.pros.join('; '))
    if (decision.cons.length) parts.push('Contro: ' + decision.cons.join('; '))
  }
  if (results.length) {
    parts.push(
      'Materiale jw.org collegato:\n' +
        results.slice(0, 8).map((r) => `- ${r.title}`).join('\n'),
    )
  }
  return parts.join('\n\n')
}

export function createMessage(role: AiMessage['role'], content: string): AiMessage {
  return { id: uid('msg'), role, content, createdAt: new Date().toISOString() }
}
