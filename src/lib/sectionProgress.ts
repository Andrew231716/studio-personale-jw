import type {
  AppView,
  BibleReadingPlan,
  DecisionItem,
  MinistryAssistNote,
  SavedResource,
  SavedSearch,
  StudySessionLog,
  StudyTopic,
} from '../types'

export interface ProgressItem {
  label: string
  value: string
}

export interface SectionProgressData {
  title: string
  items: ProgressItem[]
  hint?: string
}

type StoreSlice = {
  topics: StudyTopic[]
  decisions: DecisionItem[]
  sessionLogs: StudySessionLog[]
  savedResources: SavedResource[]
  savedSearches: SavedSearch[]
  bibleReadingPlans: BibleReadingPlan[]
  ministryNotes: MinistryAssistNote[]
  aiMessages: { role: string }[]
}

function countBy<T>(list: T[], pred: (x: T) => boolean) {
  return list.filter(pred).length
}

export function getSectionProgress(
  section: AppView,
  store: StoreSlice,
): SectionProgressData | null {
  const {
    topics,
    decisions,
    sessionLogs,
    savedResources,
    savedSearches,
    bibleReadingPlans,
    ministryNotes,
    aiMessages,
  } = store

  switch (section) {
    case 'home':
      return {
        title: 'Il tuo progresso',
        items: [
          { label: 'Sessioni totali', value: String(sessionLogs.length) },
          { label: 'Argomenti', value: String(topics.length) },
          { label: 'Decisioni', value: String(decisions.length) },
        ],
        hint: sessionLogs.length ? 'Continua da dove hai lasciato.' : 'Inizia la prima sessione.',
      }
    case 'argomenti':
      return {
        title: 'Argomenti già aperti',
        items: [
          { label: 'Attivi', value: String(countBy(topics, (t) => t.status !== 'completato')) },
          { label: 'In corso', value: String(countBy(topics, (t) => t.status === 'in_corso')) },
          {
            label: 'Archiviati',
            value: String(countBy(topics, (t) => t.status === 'completato')),
          },
        ],
        hint: topics.length
          ? 'Crea → Sessione o Quaderno. Archivia quando hai finito.'
          : undefined,
      }
    case 'sessione':
      return {
        title: 'Sessioni fatte',
        items: [
          { label: 'Completate', value: String(sessionLogs.length) },
          {
            label: 'Ultima',
            value: sessionLogs[0]
              ? new Date(sessionLogs[0].completedAt).toLocaleDateString('it-IT')
              : '—',
          },
        ],
        hint: 'A fine sessione: archivia, continua nel Quaderno o programma altri giorni.',
      }
    case 'studio':
      return {
        title: 'Nel Quaderno',
        items: [
          {
            label: 'Attivi',
            value: String(countBy(topics, (t) => t.status !== 'completato')),
          },
          {
            label: 'Con risorse',
            value: String(countBy(topics, (t) => (t.resources?.length || 0) > 0)),
          },
          {
            label: 'Con riflessioni',
            value: String(
              countBy(topics, (t) => t.reflections.some((r) => r.response.trim())),
            ),
          },
        ],
        hint: 'Appunti dell’argomento attivo. Archivia quando lo studio è concluso.',
      }
    case 'diario':
      return {
        title: 'Già studiato',
        items: [
          { label: 'Sessioni', value: String(sessionLogs.length) },
          {
            label: 'Minuti totali',
            value: String(sessionLogs.reduce((n, s) => n + (s.minutesSpent || 0), 0)),
          },
          {
            label: 'Archiviati',
            value: String(countBy(topics, (t) => t.status === 'completato')),
          },
        ],
        hint: sessionLogs.length
          ? 'Le sessioni restano qui; gli argomenti si archiviano a parte.'
          : 'Completa una sessione per vederla qui.',
      }
    case 'salvati':
      return {
        title: 'Da studiare (salvati)',
        items: [
          { label: 'Materiali', value: String(savedResources.length) },
          { label: 'Ricerche', value: String(savedSearches.length) },
        ],
      }
    case 'lettureBibbia':
      return {
        title: 'Percorsi già fatti',
        items: [
          { label: 'Percorsi', value: String(bibleReadingPlans.length) },
          {
            label: 'Con riflessioni',
            value: String(
              countBy(bibleReadingPlans, (p) => (p.reflections?.length || 0) > 0),
            ),
          },
        ],
        hint: bibleReadingPlans.length
          ? 'Apri «Il mio percorso» per rivedere e annotare.'
          : 'Scegli un personaggio o un tema per iniziare.',
      }
    case 'ministero':
      return {
        title: 'Schede già preparate',
        items: [
          { label: 'Schede', value: String(ministryNotes.length) },
          {
            label: 'Schema',
            value: String(countBy(ministryNotes, (n) => n.kind === 'schema')),
          },
          {
            label: 'Riassunti',
            value: String(countBy(ministryNotes, (n) => n.kind === 'riassunto')),
          },
        ],
        hint: ministryNotes.length
          ? 'Le schede salvate sono sotto, nella scheda Prepara.'
          : 'Prepara il primo schema da un tema o un articolo.',
      }
    case 'decisioni':
      return {
        title: 'Decisioni già aperte',
        items: [
          { label: 'Aperte', value: String(countBy(decisions, (d) => d.status === 'aperta')) },
          {
            label: 'In valutazione',
            value: String(countBy(decisions, (d) => d.status === 'in_valutazione')),
          },
          { label: 'Decise', value: String(countBy(decisions, (d) => d.status === 'decisa')) },
          {
            label: 'Con analisi',
            value: String(
              countBy(decisions, (d) => Boolean(d.lucidityAnalysis?.trim())),
            ),
          },
        ],
        hint: decisions.length
          ? 'Scrivi la scelta e le motivazioni oneste, poi analizzale con jw.org.'
          : 'Crea la prima decisione a sinistra.',
      }
    case 'videoStudio':
      return {
        title: 'Studi da video',
        items: [
          {
            label: 'Argomenti da video',
            value: String(countBy(topics, (t) => Boolean(t.transcriptMeta))),
          },
          { label: 'Materiali salvati', value: String(savedResources.filter((r) => r.kind === 'video').length) },
        ],
      }
    case 'pdfJwpub':
      return {
        title: 'PDF → EPUB',
        items: [
          { label: 'Uso', value: 'Locale' },
          { label: 'Output', value: 'EPUB' },
        ],
        hint: 'Carica un PDF, leggilo qui o esportalo in EPUB. Non crea argomenti da solo.',
      }
    case 'assistente':
      return {
        title: 'Chat con l’assistente',
        items: [
          {
            label: 'Messaggi',
            value: String(aiMessages.filter((m) => m.role !== 'system').length),
          },
        ],
        hint: 'Le risposte restano salvate in locale e in sync.',
      }
    case 'impostazioni':
      return null
    default:
      return null
  }
}
