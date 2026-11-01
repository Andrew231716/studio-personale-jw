/**
 * Metodo di studio e decisione ispirato a consigli ricorrenti
 * nelle pubblicazioni e nei video recenti di jw.org:
 * preghiera, lettura con scopo, meditazione, applicazione pratica,
 * ricerca di principi biblici e bilanciamento di priorità.
 */

export const STUDY_STEPS = [
  {
    id: 'preghiera',
    title: 'Inizia con la preghiera',
    detail:
      'Chiedi a Geova comprensione, un cuore ricettivo e la volontà di applicare ciò che impari.',
  },
  {
    id: 'obiettivo',
    title: 'Definisci un obiettivo chiaro',
    detail:
      'Scegli una domanda o un bisogno concreto (es. “Come rafforzare la mia fede questa settimana?”).',
  },
  {
    id: 'materiale',
    title: 'Scegli materiale recente su jw.org',
    detail:
      'Usa articoli e video aggiornati: ti aiutano a vedere come applicare principi biblici oggi.',
  },
  {
    id: 'riflessione',
    title: 'Medita e annota',
    detail:
      'Scrivi cosa ti colpisce, quali scritture emergono e come ti senti. La meditazione rende lo studio personale.',
  },
  {
    id: 'domande',
    title: 'Rispondi a domande mirate',
    detail:
      'Chiediti: Cosa insegna questo su Geova? Cosa posso cambiare? Chi posso incoraggiare?',
  },
  {
    id: 'pratica',
    title: 'Prova qualcosa di concreto',
    detail:
      'Traduci lo studio in un’azione piccola e verificabile entro pochi giorni.',
  },
] as const

export const DECISION_STEPS = [
  {
    id: 'preghiera',
    title: 'Prega per saggezza',
    detail: 'Chiedi a Geova di guidare i tuoi pensieri e di calmarti.',
  },
  {
    id: 'principi',
    title: 'Cerca principi biblici su jw.org',
    detail:
      'Non cercare solo risposte “sì/no”: cerca principi su priorità, onestà, famiglia, culto e amore.',
  },
  {
    id: 'priorita',
    title: 'Metti in ordine le priorità',
    detail:
      'Geova, famiglia spirituale, responsabilità personali e bisogni altrui: cosa pesa di più in questo caso?',
  },
  {
    id: 'procontro',
    title: 'Elenca pro e contro con onestà',
    detail:
      'Includi conseguenze spirituali, pratiche ed emotive. Evita di forzare i dati verso la risposta che preferisci.',
  },
  {
    id: 'consiglio',
    title: 'Valuta consiglio maturo',
    detail:
      'Per decisioni grandi, considera di parlare con qualcuno di fiducia nella congregazione, dopo aver fatto ricerca personale.',
  },
  {
    id: 'conclusione',
    title: 'Concludi in base ai dati',
    detail:
      'Sintetizza: cosa dicono i principi trovati, le priorità e i pro/contro? Poi agisci con pace interiore.',
  },
] as const

export const DEFAULT_REFLECTION_PROMPTS = [
  'Cosa mi insegna questo materiale su Geova?',
  'Quale scritto mi ha colpito di più e perché?',
  'C’è un atteggiamento che posso migliorare?',
  'Come posso usare ciò che ho imparato per incoraggiare qualcuno?',
]

export const DEFAULT_PRACTICE_IDEAS = [
  'Pregare ogni giorno su questo tema per una settimana',
  'Rileggere la scrittura chiave e annotare un’applicazione',
  'Parlare di questo punto con un familiare o un amico spirituale',
  'Mettere in pratica un piccolo cambiamento nel ministero o nella routine',
]

export function buildDecisionConclusion(input: {
  title: string
  priorities: { label: string; weight: number; note: string }[]
  pros: string[]
  cons: string[]
  prayerNotes: string
}): string {
  const ranked = [...input.priorities].sort((a, b) => b.weight - a.weight)
  const top = ranked.slice(0, 3)
  const proScore = input.pros.filter(Boolean).length
  const conScore = input.cons.filter(Boolean).length
  const lean =
    proScore > conScore + 1
      ? 'I dati inseriti inclinano verso un sì consapevole, a patto di tutelare le priorità più alte.'
      : conScore > proScore + 1
        ? 'I dati inseriti invitaano a cautela o a rimandare finché i contro non sono affrontati.'
        : 'I dati sono bilanciati: conviene pregare ancora, approfondire su jw.org e, se serve, chiedere consiglio.'

  const priorityLines = top.length
    ? top.map((p) => `• ${p.label} (peso ${p.weight}/10)${p.note ? `: ${p.note}` : ''}`).join('\n')
    : '• Nessuna priorità ancora definita'

  return [
    `Decisione: ${input.title}`,
    '',
    'Priorità più rilevanti:',
    priorityLines,
    '',
    `Pro considerati: ${proScore || 0}`,
    `Contro considerati: ${conScore || 0}`,
    input.prayerNotes ? `\nAppunti di preghiera:\n${input.prayerNotes}` : '',
    '',
    `Sintesi: ${lean}`,
    '',
    'Ricorda: la conclusione migliore resta quella allineata ai principi biblici trovati negli articoli e video di jw.org, non solo al conteggio di pro e contro.',
  ]
    .filter((line) => line !== '')
    .join('\n')
}

export type DecisionRecapInput = {
  title: string
  scale: 'piccola' | 'grande'
  status: 'aperta' | 'in_valutazione' | 'decisa'
  context?: string
  chosenDecision?: string
  honestMotivations?: string
  conclusion?: string
  lucidityAnalysis?: string
  prayerNotes?: string
  priorities: { label: string; weight: number }[]
  pros: string[]
  cons: string[]
  linkedTopicsCount: number
  materialsCount: number
}

export function decisionStatusLabel(status: DecisionRecapInput['status']): string {
  if (status === 'decisa') return 'Decisa'
  if (status === 'in_valutazione') return 'In valutazione'
  return 'Aperta'
}

/** Snapshot leggibile di dove sei arrivato con la decisione. */
export function buildDecisionRecap(input: DecisionRecapInput): {
  lines: string[]
  readyForConclusions: boolean
} {
  const pros = input.pros.filter((p) => p.trim())
  const cons = input.cons.filter((c) => c.trim())
  const topPriorities = [...input.priorities]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((p) => p.label)
    .filter(Boolean)

  const lines = [
    `Stato: ${decisionStatusLabel(input.status)} · ${input.scale === 'grande' ? 'grande' : 'piccola'}`,
    input.chosenDecision?.trim()
      ? `Decisione presa: ${input.chosenDecision.trim()}`
      : 'Decisione presa: ancora da scrivere',
    topPriorities.length
      ? `Priorità principali: ${topPriorities.join(' · ')}`
      : 'Priorità: da definire',
    `Pro ${pros.length} · Contro ${cons.length} · Argomenti ${input.linkedTopicsCount} · Materiali ${input.materialsCount}`,
    input.conclusion?.trim() ? 'Conclusione dai dati: presente' : 'Conclusione dai dati: da completare',
    input.lucidityAnalysis?.trim()
      ? 'Analisi di lucidità: fatta'
      : 'Analisi di lucidità: non ancora fatta',
  ]

  const readyForConclusions = Boolean(
    input.chosenDecision?.trim() || input.conclusion?.trim() || input.honestMotivations?.trim(),
  )

  return { lines, readyForConclusions }
}

