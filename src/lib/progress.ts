import type { StudySessionLog } from '../types'

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function todayKey(): string {
  return dayKey(new Date().toISOString())
}

function yesterdayKey(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return dayKey(d.toISOString())
}

export function computeStreak(sessions: StudySessionLog[]): number {
  if (!sessions.length) return 0
  const days = new Set(sessions.map((s) => dayKey(s.completedAt)))
  let streak = 0
  const cursor = new Date()
  // Se non hai studiato oggi, parti da ieri (streak ancora viva)
  if (!days.has(todayKey())) {
    if (!days.has(yesterdayKey())) return 0
    cursor.setDate(cursor.getDate() - 1)
  }
  while (days.has(dayKey(cursor.toISOString()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function sessionsThisWeek(sessions: StudySessionLog[]): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const day = start.getDay() || 7 // lunedì come inizio settimana
  start.setDate(start.getDate() - (day - 1))
  return sessions.filter((s) => new Date(s.completedAt) >= start).length
}

export function studiedToday(sessions: StudySessionLog[]): boolean {
  return sessions.some((s) => dayKey(s.completedAt) === todayKey())
}

export const ENCOURAGEMENTS = [
  'Anche pochi minuti di studio sincero possono rafforzare il tuo cuore.',
  'Geova ama chi lo cerca con impegno. Un passo alla volta è già progresso.',
  'La meditazione rende lo studio personale: ciò che annoti resta con te.',
  'Non serve perfezione. Serve costanza gentile e una preghiera all’inizio.',
  'Ogni applicazione pratica trasforma la conoscenza in amicizia più stretta con Geova.',
  'Rileggere ciò che hai imparato ieri ti aiuta a farlo diventare tuo.',
]

export function dailyEncouragement(): string {
  const idx = new Date().getDate() % ENCOURAGEMENTS.length
  return ENCOURAGEMENTS[idx]
}

export const SESSION_STEPS = [
  {
    id: 'accoglienza',
    title: 'Fermati un momento',
    hint: 'Respira. Chiedi a Geova di aiutarti a capire e ad applicare.',
  },
  {
    id: 'obiettivo',
    title: 'Un obiettivo chiaro',
    hint: 'Scegli una sola cosa che vuoi capire o migliorare oggi.',
  },
  {
    id: 'materiale',
    title: 'Scegli il materiale',
    hint: 'Apri un articolo o un video recente su jw.org / JW Library.',
  },
  {
    id: 'ascolto',
    title: 'Leggi o guarda con attenzione',
    hint: 'Non correre. Segna cosa ti colpisce su Geova o sul tuo cuore.',
  },
  {
    id: 'riflessione',
    title: 'Medita',
    hint: 'Scrivi con le tue parole. È qui che lo studio diventa tuo.',
  },
  {
    id: 'domanda',
    title: 'Rispondi a una domanda',
    hint: 'Una risposta onesta vale più di molte pagine sottolineate.',
  },
  {
    id: 'pratica',
    title: 'Una prova concreta',
    hint: 'Scegli un’azione piccola da fare entro 48 ore.',
  },
  {
    id: 'chiusura',
    title: 'Chiudi con gratitudine',
    hint: 'Rivedi cosa hai imparato e ringrazia Geova.',
  },
] as const
