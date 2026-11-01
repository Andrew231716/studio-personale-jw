import { useMemo, useState } from 'react'
import { BookMarked, CheckCircle2, FileText, NotebookPen, PlayCircle } from 'lucide-react'
import { SectionProgress } from '../components/SectionProgress'
import { StudyFlowGuide } from '../components/StudyFlowGuide'
import { exportSummaryEpub, exportSummaryPdf } from '../lib/exportStudy'
import { uid } from '../lib/id'
import { statusLabel } from '../lib/studyFlow'
import { buildStudySummary, type StudySummary } from '../lib/studySummary'
import type { SummaryPeriod } from '../types'
import { useAppStore } from '../store/useAppStore'

export function DiarioView() {
  const sessions = useAppStore((s) => s.sessionLogs)
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const startSession = useAppStore((s) => s.startSession)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const archiveTopic = useAppStore((s) => s.archiveTopic)
  const reopenTopic = useAppStore((s) => s.reopenTopic)

  const [period, setPeriod] = useState<SummaryPeriod>('settimana')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState<'pdf' | 'epub' | null>(null)
  const [message, setMessage] = useState('')
  const [topicFilter, setTopicFilter] = useState<'tutti' | 'libere' | string>('tutti')
  const [practiceHint, setPracticeHint] = useState('')

  const summary: StudySummary = useMemo(
    () =>
      buildStudySummary({
        period,
        anchor: new Date(`${anchor}T12:00:00`),
        sessions,
        topics,
        decisions,
      }),
    [period, anchor, sessions, topics, decisions],
  )

  const topicOptions = useMemo(() => {
    const ids = new Set(
      sessions.map((s) => s.topicId).filter((id): id is string => Boolean(id)),
    )
    return topics.filter((t) => ids.has(t.id))
  }, [sessions, topics])

  const sortedSessions = useMemo(() => {
    const list = [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    if (topicFilter === 'tutti') return list
    if (topicFilter === 'libere') return list.filter((s) => !s.topicId)
    return list.filter((s) => s.topicId === topicFilter)
  }, [sessions, topicFilter])

  function isPracticeDone(topicId: string | null, practice: string | undefined) {
    if (!topicId || !practice?.trim()) return false
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return false
    const action = practice.trim()
    return topic.practices.some((p) => p.action.trim() === action && p.tried)
  }

  function markPracticed(topicId: string, practice: string) {
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const action = practice.trim()
    if (!action) return
    const practices = [...topic.practices]
    const idx = practices.findIndex((p) => p.action.trim() === action)
    if (idx >= 0) {
      practices[idx] = {
        ...practices[idx],
        tried: true,
        outcome: practices[idx].outcome || 'Segnato dal Diario',
      }
    } else {
      practices.unshift({
        id: uid('prac'),
        action,
        tried: true,
        outcome: 'Segnato dal Diario',
      })
    }
    updateTopic(topicId, { practices })
    setPracticeHint('Pratica segnata come fatta nel Quaderno.')
  }

  async function runExport(kind: 'pdf' | 'epub') {
    setBusy(kind)
    setMessage('')
    try {
      if (kind === 'pdf') await exportSummaryPdf(summary)
      if (kind === 'epub') await exportSummaryEpub(summary)
      setMessage(
        kind === 'epub'
          ? 'EPUB scaricato. Aprilo con Libri / Apple Books.'
          : 'File PDF scaricato.',
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      <StudyFlowGuide current="diario" />
      <SectionProgress section="diario" />
      <section className="panel">
        <p className="section-kicker">4 · Diario</p>
        <h2>Sessioni già fatte</h2>
        <p className="lede">
          Ogni sessione completata resta qui. Filtra per argomento e segna le pratiche fatte.
        </p>

        {sessions.length > 0 && (
          <div className="field" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            <label htmlFor="diario-filter">Filtra per argomento</label>
            <select
              id="diario-filter"
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
            >
              <option value="tutti">Tutte le sessioni ({sessions.length})</option>
              {sessions.some((s) => !s.topicId) && (
                <option value="libere">Solo sessioni libere</option>
              )}
              {topicOptions.map((t) => {
                const count = sessions.filter((s) => s.topicId === t.id).length
                return (
                  <option key={t.id} value={t.id}>
                    {t.title} ({count})
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {practiceHint && (
          <p className="muted" style={{ margin: '0.55rem 0 0' }}>
            {practiceHint}
          </p>
        )}

        {sessions.length === 0 ? (
          <div className="empty">
            Nessuna sessione completata ancora.
            <div style={{ marginTop: '0.8rem' }}>
              <button className="btn" type="button" onClick={() => startSession(null)}>
                Inizia la prima sessione
              </button>
            </div>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="empty" style={{ marginTop: '0.85rem' }}>
            Nessuna sessione con questo filtro.
          </div>
        ) : (
          <div className="list" style={{ marginTop: '0.85rem' }}>
            {sortedSessions.map((s) => {
              const linked = s.topicId
                ? topics.find((t) => t.id === s.topicId)
                : undefined
              const practiced = isPracticeDone(s.topicId, s.practice)
              return (
                <article key={s.id} className="list-item">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong>{s.topicTitle}</strong>
                    <span className="badge">{s.minutesSpent} min</span>
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {new Date(s.completedAt).toLocaleString('it-IT')}
                    {linked ? ` · Argomento: ${statusLabel(linked.status)}` : ''}
                  </p>
                  {s.goal && (
                    <p style={{ margin: 0 }}>
                      <strong>Obiettivo:</strong> {s.goal}
                    </p>
                  )}
                  {(s.highlight || s.reflection) && (
                    <p style={{ margin: 0 }}>{s.highlight || s.reflection}</p>
                  )}
                  {s.answer && (
                    <p style={{ margin: 0 }}>
                      <strong>Risposta:</strong> {s.answer}
                    </p>
                  )}
                  {s.practice && (
                    <p className="muted" style={{ margin: 0 }}>
                      Da praticare: {s.practice}
                      {practiced ? ' · fatta' : ''}
                    </p>
                  )}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    {s.topicId && s.practice?.trim() && !practiced && (
                      <button
                        className="btn accent small"
                        type="button"
                        onClick={() => markPracticed(s.topicId!, s.practice!)}
                      >
                        <CheckCircle2 size={14} /> Ho praticato
                      </button>
                    )}
                    {s.topicId && s.practice?.trim() && practiced && (
                      <span className="badge">Pratica fatta</span>
                    )}
                    {s.topicId && (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => setActiveTopic(s.topicId)}
                      >
                        <NotebookPen size={14} /> Quaderno
                      </button>
                    )}
                    <button
                      className="btn secondary small"
                      type="button"
                      onClick={() => startSession(s.topicId)}
                    >
                      <PlayCircle size={14} /> Nuova sessione
                    </button>
                    {linked && linked.status !== 'completato' && (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => archiveTopic(linked.id)}
                      >
                        Archivia argomento
                      </button>
                    )}
                    {linked && linked.status === 'completato' && (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => reopenTopic(linked.id)}
                      >
                        Riapri argomento
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <p className="section-kicker">Esporta</p>
        <h2>Riepilogo in un unico file</h2>
        <p className="lede">
          Un documento chiaro da rileggere o condividere: sessioni, quaderno e decisioni del
          periodo, senza link lunghi né testo confuso.
        </p>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="period">Periodo</label>
            <select
              id="period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as SummaryPeriod)}
            >
              <option value="giorno">Giorno</option>
              <option value="settimana">Settimana</option>
              <option value="mese">Mese</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="anchor">Data di riferimento</label>
            <input
              id="anchor"
              type="date"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value)}
            />
          </div>
        </div>

        <div className="list-item" style={{ marginBottom: '0.85rem' }}>
          <strong>{summary.range.label}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {summary.sessions.length} sessioni · {summary.totalMinutes} minuti ·{' '}
            {summary.topics.length} argomenti collegati · {summary.decisions.length} decisioni
          </p>
        </div>

        <div className="row">
          <button
            className="btn accent"
            type="button"
            disabled={!!busy}
            onClick={() => void runExport('epub')}
          >
            <BookMarked size={16} /> {busy === 'epub' ? 'Creo EPUB…' : 'Scarica EPUB'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!!busy}
            onClick={() => void runExport('pdf')}
          >
            <FileText size={16} /> {busy === 'pdf' ? 'Creo PDF…' : 'Scarica PDF'}
          </button>
        </div>

        <p className="footnote" style={{ marginTop: '0.9rem' }}>
          L’<strong>EPUB</strong> si apre con Libri / Apple Books. Il PDF è comodo da stampare o
          condividere.
        </p>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  )
}
