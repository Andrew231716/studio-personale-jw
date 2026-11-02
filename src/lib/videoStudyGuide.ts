import { askAi } from './ai'
import { uid } from './id'
import { JW_ITALIAN_TERM_HINT, normalizeJwItalian } from './jwItalianTerms'
import {
  parseStudyStructure,
  type StudyStructure,
} from './studyStructureAi'
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
- ${JW_ITALIAN_TERM_HINT}
- Non inventare titoli di articoli o link.
- Nel campo TITOLO metti ESATTAMENTE il titolo del video fornito (non inventarne uno nuovo).
- Rispondi SOLO in questo formato, senza altro testo e senza markdown:

TITOLO:
(titolo del video)

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
  const clipped = transcript.slice(0, 12000)
  try {
    const raw = await askAi({
      prompt: `${GUIDE_PROMPT}

VIDEO (usa questo come TITOLO): «${videoTitle}»

## Trascrizione
${clipped}

Rispondi ORA solo nel formato richiesto.`,
    })
    const parsed = parseGuideResponse(raw, videoTitle)
    if (
      parsed.objectives.length >= 2 ||
      parsed.questions.length >= 2 ||
      parsed.reflections.length >= 2
    ) {
      return parsed
    }
  } catch {
    /* fallback locale */
  }
  return localGuideFromTranscript(videoTitle, transcript)
}

export function parseGuideResponse(raw: string, fallbackTitle: string): VideoStudyGuide {
  const parsed = parseStudyStructure(raw, fallbackTitle)
  return ensureGuide(parsed, fallbackTitle)
}

function ensureGuide(parsed: StudyStructure, videoTitle: string): VideoStudyGuide {
  // Il titolo dell’argomento Quaderno deve restare quello del video
  const title = videoTitle.trim() || parsed.title || 'Video JW'
  return {
    title,
    summary:
      parsed.summary ||
      `Studio personale basato sul video «${title}» e sulla sua trascrizione.`,
    objectives:
      parsed.objectives.length > 0
        ? parsed.objectives
        : [
            'Comprendere il messaggio principale del video',
            'Collegare i punti principali a principi biblici',
            'Scegliere un’applicazione pratica per questa settimana',
          ],
    reflections:
      parsed.reflections.length > 0
        ? parsed.reflections
        : [
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
    questions:
      parsed.questions.length > 0
        ? parsed.questions
        : [
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
    practices:
      parsed.practices.length > 0
        ? parsed.practices
        : DEFAULT_PRACTICE_IDEAS.slice(0, 3).map((action) => ({
            id: uid('prac'),
            action,
            tried: false,
            outcome: '',
          })),
  }
}

function localGuideFromTranscript(videoTitle: string, transcript: string): VideoStudyGuide {
  const sentences = normalizeJwItalian(transcript)
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
  const highlights = sentences.slice(0, 3)
  const summary =
    highlights.join(' ') ||
    `Studio personale basato sul video «${videoTitle}» e sulla sua trascrizione.`

  return ensureGuide(
    {
      title: videoTitle,
      summary,
      objectives: [],
      reflections: [],
      questions: [],
      practices: [],
    },
    videoTitle,
  )
}
