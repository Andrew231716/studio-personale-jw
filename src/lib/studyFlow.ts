import type { AppView, ScheduledStudy, StudyTopic } from '../types'

/** Ruolo chiaro di ciascuna sezione del percorso di studio. */
export const STUDY_FLOW_STEPS: Array<{
  view: AppView
  label: string
  role: string
}> = [
  {
    view: 'argomenti',
    label: 'Argomenti',
    role: 'Cosa vuoi studiare',
  },
  {
    view: 'sessione',
    label: 'Sessione',
    role: 'Studia oggi (passi guidati)',
  },
  {
    view: 'studio',
    label: 'Quaderno',
    role: 'Appunti e materiali',
  },
  {
    view: 'diario',
    label: 'Diario',
    role: 'Sessioni già fatte',
  },
]

export function isTopicActive(status: StudyTopic['status']): boolean {
  return status !== 'completato'
}

export function isTopicArchived(status: StudyTopic['status']): boolean {
  return status === 'completato'
}

/** Argomenti su cui ha senso riprendere lo studio (non archiviati). */
export function activeTopics(topics: StudyTopic[]): StudyTopic[] {
  return topics.filter((t) => isTopicActive(t.status))
}

export function archivedTopics(topics: StudyTopic[]): StudyTopic[] {
  return topics.filter((t) => isTopicArchived(t.status))
}

/** Scelta del prossimo argomento da studiare (ignora gli archiviati). */
export function pickFocusTopic(topics: StudyTopic[]): StudyTopic | null {
  return (
    topics.find((t) => t.status === 'in_corso') ||
    topics.find((t) => t.status === 'approfondire') ||
    topics.find((t) => t.status === 'da_iniziare') ||
    null
  )
}

export function topicHasUpcomingSchedule(
  topicId: string | null | undefined,
  schedules: ScheduledStudy[],
): boolean {
  if (!topicId) return false
  const now = Date.now() - 60_000
  return schedules.some(
    (s) => s.topicId === topicId && new Date(s.startsAt).getTime() >= now,
  )
}

export function statusLabel(status: StudyTopic['status']): string {
  switch (status) {
    case 'in_corso':
      return 'In corso'
    case 'approfondire':
      return 'Da approfondire'
    case 'completato':
      return 'Archiviato'
    default:
      return 'Da iniziare'
  }
}
