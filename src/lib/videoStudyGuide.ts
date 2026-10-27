import { askAi } from './ai'
import { uid } from './id'
import { DEFAULT_PRACTICE_IDEAS, DEFAULT_REFLECTION_PROMPTS } from './studyMethod'
import type { PracticeItem, ReflectionPoint, StudyQuestion } from '../types'

export interface VideoStudyGuide {
  title: string
  summary: string
  objectives: string[]
  reflections: ReflectionPoint[]
  questions: StudyQuestion[]
  practices: PracticeItem[]
}

const GUIDE_PROMPT = `Sei un assistente per lo studio personale basato su materiali di jw.org.
A partire dalla TRASCRIZIONE di un video ufficiale JW, crea una guida di studio personale in italiano.
Regole:
- Usa solo ciò che emerge dalla trascrizione (non inventare citazioni letterali non presenti).
- Tono rispettoso, pratico, tipico delle pubblicazioni JW.
- Non inventare titoli di articoli o link.
- Rispondi SOLO in questo formato, senza altro testo:

TITOLO:
(un titolo breve per lo studio)

RIASSUNTO:
(2-4 frasi sul messaggio principale)

OBIETTIVI:
- obiettivo 1
- obiettivo 2
- obiettivo 3

RIFLESSIONI:
- domanda di riflessione 1
- domanda di riflessione 2
- domanda di riflessione 3
- domanda di riflessione 4

DOMANDE:
- domanda di studio 1
- domanda di studio 2
- domanda di studio 3
- domanda di studio 4

PRATICHE:
- azione pratica 1
- azione pratica 2
- azione pratica 3`

export async function buildVideoStudyGuide(params: {
  videoTitle: string
  transcript: string
}): Promise<VideoStudyGuide> {
  const { videoTitle, transcript } = params
  const clipped = transcript.slice(0, 10000)
  try {
    const raw = await askAi({
      prompt: `Crea la guida di studio per il video “${videoTitle}”.`,
      context: `${GUIDE_PROMPT}\n\n## Trascrizione\n${clipped}`,
    })
    const parsed = parseGuideResponse(raw, videoTitle)
    if (parsed.objectives.length || parsed.questions.length) return parsed
  } catch {
    // fallback locale
  }
  return localGuideFromTranscript(videoTitle, transcript)
}

export function parseGuideResponse(raw: string, fallbackTitle: string): VideoStudyGuide {
  const title = sectionLine(raw, 'TITOLO') || fallbackTitle
  const summary = sectionBlock(raw, 'RIASSUNTO') || ''
  const objectives = bullets(sectionBlock(raw, 'OBIETTIVI')).slice(0, 5)
  const reflections = bullets(sectionBlock(raw, 'RIFLESSIONI'))
    .slice(0, 6)
    .map((prompt) => ({ id: uid('ref'), prompt, response: '' }))
  const questions = bullets(sectionBlock(raw, 'DOMANDE'))
    .slice(0, 6)
    .map((question) => ({ id: uid('q'), question, answer: '' }))
  const practices = bullets(sectionBlock(raw, 'PRATICHE'))
    .slice(0, 5)
    .map((action) => ({ id: uid('prac'), action, tried: false, outcome: '' }))

  return {
    title,
    summary,
    objectives:
      objectives.length > 0
        ? objectives
        : ['Capire il messaggio principale del video e applicarlo nella vita quotidiana'],
    reflections:
      reflections.length > 0
        ? reflections
        : DEFAULT_REFLECTION_PROMPTS.map((prompt) => ({
            id: uid('ref'),
            prompt,
            response: '',
          })),
    questions:
      questions.length > 0
        ? questions
        : [
            {
              id: uid('q'),
              question: 'Cosa mi insegna questo video su Geova?',
              answer: '',
            },
          ],
    practices:
      practices.length > 0
        ? practices
        : DEFAULT_PRACTICE_IDEAS.slice(0, 3).map((action) => ({
            id: uid('prac'),
            action,
            tried: false,
            outcome: '',
          })),
  }
}

function localGuideFromTranscript(videoTitle: string, transcript: string): VideoStudyGuide {
  const sentences = transcript
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
  const highlights = sentences.slice(0, 3)
  const summary =
    highlights.join(' ') ||
    `Studio personale basato sul video “${videoTitle}” e sulla sua trascrizione.`

  return {
    title: `Studio: ${videoTitle}`,
    summary,
    objectives: [
      'Comprendere il messaggio principale del video',
      'Collegare i punti principali a principi biblici',
      'Scegliere un’applicazione pratica per questa settimana',
    ],
    reflections: [
      ...DEFAULT_REFLECTION_PROMPTS.map((prompt) => ({
        id: uid('ref'),
        prompt,
        response: '',
      })),
      {
        id: uid('ref'),
        prompt: 'Quale frase del video mi ha colpito di più e perché?',
        response: '',
      },
    ],
    questions: [
      {
        id: uid('q'),
        question: 'Qual è il punto centrale che il video vuole insegnare?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Cosa imparo su Geova o su Gesù da questo discorso?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Quale scrittura o principio potrei rileggere e meditare?',
        answer: '',
      },
      {
        id: uid('q'),
        question: 'Chi potrei incoraggiare con ciò che ho imparato?',
        answer: '',
      },
    ],
    practices: DEFAULT_PRACTICE_IDEAS.slice(0, 3).map((action) => ({
      id: uid('prac'),
      action,
      tried: false,
      outcome: '',
    })),
  }
}

function sectionBlock(text: string, heading: string): string {
  const re = new RegExp(
    `${heading}\\s*:?\\s*([\\s\\S]*?)(?=\\n(?:TITOLO|RIASSUNTO|OBIETTIVI|RIFLESSIONI|DOMANDE|PRATICHE)\\s*:|$)`,
    'i',
  )
  const m = text.match(re)
  return (m?.[1] || '').trim()
}

function sectionLine(text: string, heading: string): string {
  const block = sectionBlock(text, heading)
  return block.split('\n').map((l) => l.trim()).find(Boolean) || ''
}

function bullets(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 3)
}
