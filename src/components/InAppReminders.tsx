import { useEffect, useMemo, useState } from 'react'
import { Bell, ListChecks, PlayCircle, X } from 'lucide-react'
import {
  collectActiveReminders,
  dismissReminder,
  pushSystemNotifications,
  type AppReminder,
} from '../lib/reminders'
import { useAppStore } from '../store/useAppStore'

export function InAppReminders() {
  const schedules = useAppStore((s) => s.schedules)
  const decisions = useAppStore((s) => s.decisions)
  const startSession = useAppStore((s) => s.startSession)
  const setActiveDecision = useAppStore((s) => s.setActiveDecision)
  const setView = useAppStore((s) => s.setView)
  const [tick, setTick] = useState(0)
  const [hidden, setHidden] = useState<string[]>([])

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const reminders = useMemo(() => {
    void tick
    return collectActiveReminders({ schedules, decisions }).filter(
      (r) => !hidden.includes(r.id),
    )
  }, [schedules, decisions, tick, hidden])

  useEffect(() => {
    if (reminders.length) pushSystemNotifications(reminders)
  }, [reminders])

  if (!reminders.length) return null

  function dismiss(r: AppReminder) {
    dismissReminder(r.id)
    setHidden((prev) => [...prev, r.id])
  }

  function open(r: AppReminder) {
    if (r.kind === 'schedule') {
      startSession(r.topicId || null)
    } else if (r.decisionId) {
      setActiveDecision(r.decisionId)
      setView('obiettiviDecisioni')
    }
    dismiss(r)
  }

  return (
    <div className="reminder-stack" role="status" aria-live="polite">
      {reminders.slice(0, 3).map((r) => (
        <div className="reminder-banner" key={r.id}>
          <div className="reminder-banner-body">
            <p className="section-kicker" style={{ margin: 0 }}>
              <Bell size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              {r.kind === 'schedule' ? 'Promemoria studio' : 'Obiettivo in scadenza'}
            </p>
            <strong>{r.title}</strong>
            <p className="muted" style={{ margin: '0.15rem 0 0' }}>
              {r.detail}
            </p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button className="btn accent small" type="button" onClick={() => open(r)}>
              {r.kind === 'schedule' ? (
                <>
                  <PlayCircle size={14} /> Inizia
                </>
              ) : (
                <>
                  <ListChecks size={14} /> Obiettivi
                </>
              )}
            </button>
            <button
              className="btn secondary small"
              type="button"
              aria-label="Nascondi promemoria"
              onClick={() => dismiss(r)}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
