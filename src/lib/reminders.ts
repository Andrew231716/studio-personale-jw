import type { DecisionItem, ScheduledStudy } from '../types'

export type ReminderKind = 'schedule' | 'goal'

export interface AppReminder {
  id: string
  kind: ReminderKind
  title: string
  detail: string
  /** Quando scatta (ISO). */
  at: string
  topicId?: string | null
  decisionId?: string
  scheduleId?: string
}

const DISMISS_KEY = 'jw-studio-dismissed-reminders'

function loadDismissed(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...ids].slice(-80)))
  } catch {
    /* ignore quota */
  }
}

export function dismissReminder(id: string) {
  const set = loadDismissed()
  set.add(id)
  saveDismissed(set)
}

export function isReminderDismissed(id: string): boolean {
  return loadDismissed().has(id)
}

/** Promemoria studi entro la finestra reminder → fine durata. */
export function collectScheduleReminders(
  schedules: ScheduledStudy[],
  now = new Date(),
): AppReminder[] {
  const nowMs = now.getTime()
  const out: AppReminder[] = []
  for (const s of schedules) {
    const start = new Date(s.startsAt).getTime()
    if (!Number.isFinite(start)) continue
    const remindBefore = Math.max(5, s.reminderMinutes || 15) * 60_000
    const end = start + Math.max(5, s.durationMinutes || 25) * 60_000
    const windowStart = start - remindBefore
    if (nowMs < windowStart || nowMs > end) continue
    const id = `sched:${s.id}:${s.startsAt.slice(0, 16)}`
    out.push({
      id,
      kind: 'schedule',
      title: s.title || 'Studio programmato',
      detail: s.topicTitle
        ? `${s.topicTitle} · ${new Date(s.startsAt).toLocaleString('it-IT')}`
        : new Date(s.startsAt).toLocaleString('it-IT'),
      at: s.startsAt,
      topicId: s.topicId,
      scheduleId: s.id,
    })
  }
  return out
}

/** Obiettivi con scadenza oggi o già passata (non fatti). */
export function collectGoalReminders(
  decisions: DecisionItem[],
  now = new Date(),
): AppReminder[] {
  const today = now.toISOString().slice(0, 10)
  const out: AppReminder[] = []
  for (const d of decisions) {
    for (const g of d.goals || []) {
      if (g.done || !g.dueDate) continue
      if (g.dueDate > today) continue
      const overdue = g.dueDate < today
      const id = `goal:${g.id}:${g.dueDate}`
      out.push({
        id,
        kind: 'goal',
        title: g.title,
        detail: overdue
          ? `Scaduto il ${g.dueDate} · ${d.title}`
          : `Scade oggi · ${d.title}`,
        at: `${g.dueDate}T12:00:00`,
        decisionId: d.id,
      })
    }
  }
  return out
}

export function collectActiveReminders(input: {
  schedules: ScheduledStudy[]
  decisions: DecisionItem[]
  now?: Date
}): AppReminder[] {
  const now = input.now || new Date()
  return [
    ...collectScheduleReminders(input.schedules, now),
    ...collectGoalReminders(input.decisions, now),
  ].filter((r) => !isReminderDismissed(r.id))
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

const NOTIFIED_KEY = 'jw-studio-notified-reminders'

function loadNotified(): Set<string> {
  try {
    const raw = sessionStorage.getItem(NOTIFIED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function markNotified(id: string) {
  const set = loadNotified()
  set.add(id)
  try {
    sessionStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set].slice(-80)))
  } catch {
    /* ignore */
  }
}

/** Invia notifiche di sistema per i promemoria nuovi (una sola volta a sessione). */
export function pushSystemNotifications(reminders: AppReminder[]) {
  if (notificationPermission() !== 'granted') return
  for (const r of reminders) {
    if (loadNotified().has(r.id)) continue
    try {
      new Notification(r.title, {
        body: r.detail,
        tag: r.id,
        silent: false,
      })
      markNotified(r.id)
    } catch {
      /* ignore */
    }
  }
}
