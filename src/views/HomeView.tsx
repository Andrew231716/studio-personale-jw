import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Compass, Flame, PlayCircle, Sparkles } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { ScheduleNextStudy } from '../components/ScheduleNextStudy'
import { formatScheduleLabel } from '../lib/calendar'
import { fetchLatestVideos, type LatestMediaItem } from '../lib/jwApi'
import {
  computeStreak,
  dailyEncouragement,
  sessionsThisWeek,
  studiedToday,
} from '../lib/progress'
import { useAppStore } from '../store/useAppStore'

export function HomeView() {
  const settings = useAppStore((s) => s.settings)
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const logs = useAppStore((s) => s.sessionLogs)
  const schedules = useAppStore((s) => s.schedules)
  const setView = useAppStore((s) => s.setView)
  const startSession = useAppStore((s) => s.startSession)
  const [latest, setLatest] = useState<LatestMediaItem[]>([])
  const [feedError, setFeedError] = useState('')

  const streak = useMemo(() => computeStreak(logs), [logs])
  const weekCount = useMemo(() => sessionsThisWeek(logs), [logs])
  const todayDone = useMemo(() => studiedToday(logs), [logs])
  const nextSchedule = useMemo(
    () =>
      [...schedules]
        .filter((s) => new Date(s.startsAt).getTime() > Date.now())
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0],
    [schedules],
  )
  const focusTopic =
    topics.find((t) => t.status === 'in_corso') ||
    topics.find((t) => t.status === 'da_iniziare') ||
    topics[0]

  useEffect(() => {
    if (!settings.features.recentJwFeed) return
    let cancelled = false
    fetchLatestVideos(settings.language)
      .then((items) => {
        if (!cancelled) setLatest(items)
      })
      .catch((e) => {
        if (!cancelled) setFeedError(e instanceof Error ? e.message : 'Feed non disponibile')
      })
    return () => {
      cancelled = true
    }
  }, [settings.language, settings.features.recentJwFeed])

  return (
    <div className="stack">
      <section className={`hero ${settings.theme.heroStyle === 'morbido' ? 'morbido' : ''}`}>
        <img
          className="hero-logo"
          src="/logo.svg"
          alt="JW Studio"
          width={88}
          height={88}
        />
        <h1>{settings.brandName}</h1>
        <p>{settings.tagline}</p>
        <div className="hero-actions">
          <button
            className="btn accent"
            type="button"
            onClick={() => startSession(focusTopic?.id || null)}
          >
            {todayDone ? 'Un altro passo di studio' : 'Inizia la sessione di oggi'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setView('argomenti')}>
            Scegli un argomento
          </button>
        </div>
      </section>

      <section className="panel invite-panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2>{todayDone ? 'Hai già studiato oggi' : 'Il tuo invito di oggi'}</h2>
            <p className="encourage" style={{ margin: '0.5rem 0 0' }}>
              <Sparkles size={16} /> {dailyEncouragement()}
            </p>
          </div>
          {(streak > 0 || weekCount > 0) && (
            <div className="streak-pill">
              <Flame size={14} />
              {streak > 0 ? `${streak} giorni di fila` : `${weekCount} sessioni questa settimana`}
            </div>
          )}
        </div>
        {focusTopic && (
          <div className="list-item" style={{ marginTop: '0.9rem' }}>
            <strong>{focusTopic.title}</strong>
            <p className="muted" style={{ margin: 0 }}>
              {focusTopic.interest || focusTopic.objectives[0] || 'Pronto per una sessione guidata'}
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => startSession(focusTopic.id)}
            >
              <span className="row" style={{ gap: 6 }}>
                <PlayCircle size={16} /> Apri sessione guidata
              </span>
            </button>
          </div>
        )}
        {!focusTopic && (
          <button
            className="btn"
            type="button"
            style={{ marginTop: '0.9rem' }}
            onClick={() => setView('argomenti')}
          >
            Crea il primo argomento
          </button>
        )}
      </section>

      <div className="grid-3">
        <div className="panel">
          <div className="row"><BookOpen size={18} /><h3>Argomenti</h3></div>
          <p className="muted">{topics.length} salvati</p>
          <button className="btn secondary" type="button" onClick={() => setView('argomenti')}>
            Gestisci
          </button>
        </div>
        <div className="panel">
          <div className="row"><Compass size={18} /><h3>Decisioni</h3></div>
          <p className="muted">{decisions.filter((d) => d.status !== 'decisa').length} aperte</p>
          <button className="btn secondary" type="button" onClick={() => setView('decisioni')}>
            Apri
          </button>
        </div>
        <div className="panel">
          <div className="row"><Sparkles size={18} /><h3>Questa settimana</h3></div>
          <p className="muted">{weekCount} sessioni completate</p>
          <button className="btn secondary" type="button" onClick={() => setView('studio')}>
            Vedi quaderno
          </button>
        </div>
      </div>

      {logs[0] && (
        <section className="panel">
          <h2>Ultima scintilla</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {logs[0].topicTitle} · {logs[0].minutesSpent} min
          </p>
          <p style={{ margin: 0 }}>
            {logs[0].highlight || logs[0].gratitude || logs[0].goal}
          </p>
        </section>
      )}

      <section className="panel">
        {nextSchedule && (
          <p className="muted" style={{ marginTop: 0 }}>
            Prossimo in calendario: <strong>{formatScheduleLabel(nextSchedule.startsAt)}</strong>
            {nextSchedule.topicTitle ? ` · ${nextSchedule.topicTitle}` : ''}
          </p>
        )}
        <ScheduleNextStudy
          topicId={focusTopic?.id || null}
          topicTitle={focusTopic?.title || ''}
          defaultTitle={focusTopic ? `Studio: ${focusTopic.title}` : 'Prossimo studio personale'}
        />
      </section>

      {settings.features.recentJwFeed && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Video recenti su jw.org / JW Library</h2>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                Materiale fresco da cui partire nella prossima sessione
              </p>
            </div>
          </div>
          {feedError && <p className="muted">{feedError}</p>}
          <div className="grid-3">
            {latest.map((item) => (
              <div key={item.guid} className="list-item">
                {item.image ? (
                  <img className="media-thumb" src={item.image} alt="" loading="lazy" />
                ) : (
                  <div className="media-thumb" />
                )}
                <strong>{item.title}</strong>
                <span className="muted">{item.duration}</span>
                <JwOpenButtons
                  url={item.url}
                  lank={item.lank}
                  language={settings.language}
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="footnote">
        Questa app non è affiliata a jw.org. I contenuti collegati appartengono a{' '}
        <a href="https://www.jw.org/" target="_blank" rel="noreferrer">jw.org</a>.
      </p>
    </div>
  )
}
