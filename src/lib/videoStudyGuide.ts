import { askAi } from './ai'
import { JW_ITALIAN_TERM_HINT, normalizeJwItalian } from './jwItalianTerms'
import {
  filterGenericStructure,
  isGenericStudyLine,
  localStructureFromSource,
  parseStudyStructure,
  type StudyStructure,
} from './studyStructureAi'
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
- Basa OGNI obiettivo, riflessione, domanda e pratica su punti CONCRETI della trascrizione (temi, esempi, consigli, scritture nominate).
- Vietato il generico: niente «Capire il messaggio principale», «Applicare nella vita quotidiana», «Crescere spiritualmente» senza dettagli dal video.
- Niente ripetizioni: ogni punto deve essere distinto; non ripetere la stessa idea tra obiettivi, riflessioni, domande e pratiche.
- Usa solo ciò che emerge dalla trascrizione (non inventare citazioni letterali non presenti).
- Tono rispettoso, pratico, tipico delle pubblicazioni JW.
- ${JW_ITALIAN_TERM_HINT}
- Non inventare titoli di articoli o link.
- Nel campo TITOLO metti ESATTAMENTE il titolo del video fornito.
- Rispondi SOLO in questo formato, senza altro testo e senza markdown:

TITOLO:
(titolo del video)

RIASSUNTO:
(2-4 frasi sul messaggio specifico del video)

OBIETTIVI:
- obiettivo concreto 1 (legato a un punto del video)
- obiettivo concreto 2
- obiettivo concreto 3

RIFLESSIONI:
- domanda di riflessione specifica 1
- domanda di riflessione specifica 2
- domanda di riflessione specifica 3
- domanda di riflessione specifica 4

DOMANDE:
- domanda di studio specifica 1
- domanda di studio specifica 2
- domanda di studio specifica 3
- domanda di studio specifica 4

PRATICHE:
- azione pratica specifica 1
- azione pratica specifica 2
- azione pratica specifica 3`

export async function buildVideoStudyGuide(params: {
  videoTitle: string
  transcript: string
}): Promise<VideoStudyGuide> {
  const videoTitle = params.videoTitle.trim() || 'Video JW'
  const transcript = params.transcript
  const clipped = transcript.slice(0, 12000)
  try {
    const raw = await askAi({
      prompt: `${GUIDE_PROMPT}

VIDEO (usa questo come TITOLO): «${videoTitle}»

## Trascrizione
${clipped}

Rispondi ORA solo nel formato richiesto.`,
    })
    const parsed = parseGuideResponse(raw, videoTitle, transcript)
    if (
      parsed.objectives.filter((o) => !isGenericStudyLine(o)).length >= 2 ||
      parsed.questions.filter((q) => !isGenericStudyLine(q.question)).length >= 2 ||
      parsed.reflections.filter((r) => !isGenericStudyLine(r.prompt)).length >= 2
    ) {
      return parsed
    }
  } catch {
    /* fallback locale */
  }
  return localGuideFromTranscript(videoTitle, transcript)
}

export function parseGuideResponse(
  raw: string,
  fallbackTitle: string,
  transcript = '',
): VideoStudyGuide {
  const parsed = parseStudyStructure(raw, fallbackTitle)
  const grounded = filterGenericStructure(parsed, fallbackTitle, transcript)
  return ensureGuide(grounded, fallbackTitle)
}

function ensureGuide(parsed: StudyStructure, videoTitle: string): VideoStudyGuide {
  const title = videoTitle.trim() || parsed.title || 'Video JW'
  return {
    title,
    summary:
      parsed.summary ||
      `Studio personale basato sul video «${title}» e sulla sua trascrizione.`,
    objectives: parsed.objectives,
    reflections: parsed.reflections,
    questions: parsed.questions,
    practices: parsed.practices,
  }
}

function localGuideFromTranscript(videoTitle: string, transcript: string): VideoStudyGuide {
  const local = localStructureFromSource(videoTitle, normalizeJwItalian(transcript))
  return ensureGuide(local, videoTitle)
}
