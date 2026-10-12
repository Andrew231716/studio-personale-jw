import { useMemo, useState } from 'react'
import { BookMarked, Download, FileText } from 'lucide-react'
import {
  exportSummaryEpub,
  exportSummaryJwlibraryPackage,
  exportSummaryPdf,
} from '../lib/exportStudy'
import { buildStudySummary, type StudySummary } from '../lib/studySummary'
import type { SummaryPeriod } from '../types'
import { useAppStore } from '../store/useAppStore'

export function DiarioView() {
  const sessions = useAppStore((s) => s.sessionLogs)
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const startSession = useAppStore((s) => s.startSession)

  const [period, setPeriod] = useState<SummaryPeriod>('settimana')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState<'pdf' | 'epub' | 'jwlibrary' | null>(null)
  const [message, setMessage] = useState('')

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

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    [sessions],
  )

  async function runExport(kind: 'pdf' | 'epub' | 'jwlibrary') {
    setBusy(kind)
    setMessage('')
    try {
      if (kind === 'pdf') await exportSummaryPdf(summary)
      if (kind === 'epub') await exportSummaryEpub(summary)
      if (kind === 'jwlibrary') await exportSummaryJwlibraryPackage(summary)
      setMessage(
        kind === 'jwlibrary'
          ? 'Pacchetto .jwlibrary scaricato (archivio personale delle tue note).'
          : `File ${kind.toUpperCase()} scaricato.`,
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <p className="section-kicker">Diario</p>
        <h2>I tuoi studi fatti</h2>
        <p className="lede">
          Rivedi le sessioni completate e crea un riepilogo del giorno, della settimana o del mese.
        </p>

        {sortedSessions.length === 0 ? (
          <div className="empty">
            Nessuna sessione completata ancora.
            <div style={{ marginTop: '0.8rem' }}>
              <button className="btn" type="button" onClick={() => startSession(null)}>
                Inizia la prima sessione
              </button>
            </div>
          </div>
        ) : (
          <div className="list" style={{ marginTop: '0.5rem' }}>
            {sortedSessions.map((s) => (
              <article key={s.id} className="list-item">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{s.topicTitle}</strong>
                  <span className="badge">{s.minutesSpent} min</span>
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {new Date(s.completedAt).toLocaleString('it-IT')}
                </p>
                {s.goal && <p style={{ margin: 0 }}><strong>Obiettivo:</strong> {s.goal}</p>}
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
                  </p>
                )}
                <div className="row">
                  {s.topicId && (
                    <button
                      className="btn secondary small"
                      type="button"
                      onClick={() => useAppStore.getState().setActiveTopic(s.topicId)}
                    >
                      Apri quaderno
                    </button>
                  )}
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => startSession(s.topicId)}
                  >
                    Nuova sessione
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <p className="section-kicker">Esporta</p>
        <h2>Riepilogo in un unico file</h2>
        <p className="lede">
          Raccoglie sessioni, risposte, riflessioni e decisioni del periodo scelto.
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
            onClick={() => void runExport('pdf')}
          >
            <FileText size={16} /> {busy === 'pdf' ? 'Creo PDF…' : 'Scarica PDF'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!!busy}
            onClick={() => void runExport('epub')}
          >
            <BookMarked size={16} /> {busy === 'epub' ? 'Creo EPUB…' : 'Scarica EPUB'}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!!busy}
            onClick={() => void runExport('jwlibrary')}
          >
            <Download size={16} />
            {busy === 'jwlibrary' ? 'Creo pacchetto…' : 'Pacchetto .jwlibrary'}
          </button>
        </div>

        <p className="footnote" style={{ marginTop: '0.9rem' }}>
          Il file <strong>.jwlibrary</strong> qui è un archivio personale delle tue note (testo + JSON).
          JW Library importa solo i backup generati dall’app ufficiale, quindi potrebbe non aprirlo:
          per rileggere e condividere usa PDF o EPUB.
        </p>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  )
}
