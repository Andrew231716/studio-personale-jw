import { useMemo, useState } from 'react'
import { CalendarPlus, Pencil, PlayCircle, Trash2 } from 'lucide-react'
import {
  defaultNextStudyLocalInput,
  downloadAppleCalendarEvent,
  formatScheduleLabel,
  isoToLocalInput,
  localInputToIso,
} from '../lib/calendar'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'
import type { ScheduledStudy } from '../types'

interface Props {
  topicId?: string | null
  topicTitle?: string
  defaultTitle?: string
  defaultNotes?: string
  compact?: boolean
}

export function ScheduleNextStudy({
  topicId = null,
  topicTitle = '',
  defaultTitle,
  defaultNotes = '',
  compact = false,
}: Props) {
  const topics = useAppStore((s) => s.topics)
  const schedules = useAppStore((s) => s.schedules)
  const addSchedule = useAppStore((s) => s.addSchedule)
  const updateSchedule = useAppStore((s) => s.updateSchedule)
  const removeSchedule = useAppStore((s) => s.removeSchedule)
  const startSession = useAppStore((s) => s.startSession)

  const [when, setWhen] = useState(defaultNextStudyLocalInput(24))
  const [minutes, setMinutes] = useState(25)
  const [reminder, setReminder] = useState(15)
  const [title, setTitle] = useState(defaultTitle || topicTitle || 'Prossimo studio personale')
  const [notes, setNotes] = useState(defaultNotes)
  const [selectedTopic, setSelectedTopic] = useState(topicId || '')
  const [feedback, setFeedback] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const upcoming = useMemo(
    () =>
      [...schedules]
        .filter((s) => new Date(s.startsAt).getTime() >= Date.now() - 60_000)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [schedules],
  )

  function createAndAddToApple() {
    if (!when) {
      setFeedback('Scegli data e ora.')
      return
    }
    const topic = topics.find((t) => t.id === selectedTopic)
    if (editingId) {
      const patch: Partial<ScheduledStudy> = {
        title: title.trim() || 'Studio JW Studio',
        topicId: topic?.id || topicId || null,
        topicTitle: topic?.title || topicTitle || '',
        startsAt: localInputToIso(when),
        durationMinutes: minutes,
        reminderMinutes: reminder,
        notes: notes.trim(),
      }
      updateSchedule(editingId, patch)
      const updated = { ...(schedules.find((s) => s.id === editingId) || {}), ...patch } as ScheduledStudy
      downloadAppleCalendarEvent({
        id: editingId,
        createdAt: updated.createdAt || new Date().toISOString(),
        ...patch,
      } as ScheduledStudy)
      setEditingId(null)
      setFeedback('Evento aggiornato e .ics scaricato di nuovo.')
      return
    }
    const event: ScheduledStudy = {
      id: uid('cal'),
      title: title.trim() || 'Studio JW Studio',
      topicId: topic?.id || topicId || null,
      topicTitle: topic?.title || topicTitle || '',
      startsAt: localInputToIso(when),
      durationMinutes: minutes,
      reminderMinutes: reminder,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    }
    addSchedule(event)
    downloadAppleCalendarEvent(event)
    setFeedback(
      'Evento salvato qui e scaricato come .ics: aprilo per aggiungerlo al Calendario Apple.',
    )
  }

  function beginEdit(s: ScheduledStudy) {
    setEditingId(s.id)
    setWhen(isoToLocalInput(s.startsAt))
    setMinutes(s.durationMinutes)
    setReminder(s.reminderMinutes)
    setTitle(s.title)
    setNotes(s.notes || '')
    setSelectedTopic(s.topicId || '')
    setFeedback('Modifica i campi e salva per aggiornare.')
  }

  return (
    <div className={`stack ${compact ? 'schedule-compact' : ''}`}>
      <div>
        <p className="section-kicker">Calendario</p>
        <h2 style={{ margin: 0 }}>Programma il prossimo studio</h2>
        <p className="lede">
          Scegli data e ora, poi aggiungi l’evento al Calendario Apple
        </p>
      </div>

      {/* Data/ora a tutta larghezza: su iOS datetime-local sborda se stretto in griglia */}
      <div className="field">
        <label htmlFor="sched-when">Data e ora</label>
        <input
          id="sched-when"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="sched-min">Durata (minuti)</label>
          <input
            id="sched-min"
            type="number"
            min={5}
            max={180}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value) || 25)}
          />
        </div>
        <div className="field">
          <label htmlFor="sched-reminder">Promemoria (minuti prima)</label>
          <select
            id="sched-reminder"
            value={reminder}
            onChange={(e) => setReminder(Number(e.target.value))}
          >
            <option value={5}>5 minuti</option>
            <option value={15}>15 minuti</option>
            <option value={30}>30 minuti</option>
            <option value={60}>1 ora</option>
            <option value={1440}>1 giorno</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="sched-title">Titolo evento</label>
        <input
          id="sched-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {topics.length > 0 && (
        <div className="field">
          <label htmlFor="sched-topic">Argomento</label>
          <select
            id="sched-topic"
            value={selectedTopic}
            onChange={(e) => {
              setSelectedTopic(e.target.value)
              const t = topics.find((x) => x.id === e.target.value)
              if (t && (!title || title === topicTitle || title === defaultTitle)) {
                setTitle(`Studio: ${t.title}`)
              }
            }}
          >
            <option value="">Nessuno / libero</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label htmlFor="sched-notes">Note</label>
        <textarea
          id="sched-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Es. Continuare la riflessione sulla preghiera"
        />
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button className="btn accent" type="button" onClick={createAndAddToApple}>
          <span className="row" style={{ gap: 6 }}>
            <CalendarPlus size={16} />{' '}
            {editingId ? 'Salva modifiche e .ics' : 'Aggiungi al Calendario Apple'}
          </span>
        </button>
        {editingId && (
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setEditingId(null)
              setFeedback('')
            }}
          >
            Annulla modifica
          </button>
        )}
      </div>
      {feedback && <p className="muted" style={{ margin: 0 }}>{feedback}</p>}

      {upcoming.length > 0 && (
        <div className="stack" style={{ marginTop: '0.4rem' }}>
          <strong>Prossimi studi programmati</strong>
          {upcoming.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{s.title}</strong>
                <span className="badge">{formatScheduleLabel(s.startsAt)}</span>
              </div>
              {s.topicTitle && <p className="muted" style={{ margin: 0 }}>{s.topicTitle}</p>}
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="btn accent small"
                  type="button"
                  onClick={() => startSession(s.topicId)}
                >
                  <PlayCircle size={14} /> Inizia
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => beginEdit(s)}
                >
                  <span className="row" style={{ gap: 6 }}>
                    <Pencil size={14} /> Modifica
                  </span>
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    downloadAppleCalendarEvent(s)
                    setFeedback('File .ics scaricato di nuovo.')
                  }}
                >
                  <span className="row" style={{ gap: 6 }}>
                    <CalendarPlus size={14} /> Riapri in Calendario
                  </span>
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (editingId === s.id) setEditingId(null)
                    removeSchedule(s.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
