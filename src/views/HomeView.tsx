import { useEffect, useMemo, useState } from 'react'
import { Flame, PlayCircle } from 'lucide-react'
import { CloudSyncPanel } from '../components/CloudSyncPanel'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { ScheduleNextStudy } from '../components/ScheduleNextStudy'
import { SectionProgress } from '../components/SectionProgress'
import { formatScheduleLabel } from '../lib/calendar'
import { fetchLatestVideos, type LatestMediaItem } from '../lib/jwApi'
import {
  computeStreak,
  dailyEncouragement,
  sessionsThisWeek,
  studiedToday,
} from '../lib/progress'
import { pickFocusTopic } from '../lib/studyFlow'
import { useAppStore } from '../store/useAppStore'

/** Rimuove residui markdown (es. `**`) dai titoli salvati. */
function plainText(value: string): string {
  return value
    .replace(/\*{1,3}/g, '')
    .replace(/_{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function HomeView() {
  const settings = useAppStore((s) => s.settings)
  const topics = useAppStore((s) => s.topics)
  const logs = useAppStore((s) => s.sessionLogs)
  const schedules = useAppStore((s) => s.schedules)
  const sessionDraft = useAppStore((s) => s.sessionDraft)
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
  const focusTopic = pickFocusTopic(topics)

  useEffect(() => {
    if (!settings.features.recentJwFeed) return
    let cancelled = false
    fetchLatestVideos(settings.language)
      .then((items) => {
        if (!cancelled) setLatest(items.slice(0, 6))
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
        <img className="hero-logo" src="/logo.svg" alt="" width={56} height={56} />
        <h1>{settings.brandName}</h1>
        <p>{settings.tagline}</p>
        <div className="hero-actions">
          <button
            className="btn accent"
            type="button"
            onClick={() => startSession(focusTopic?.id || null)}
          >
            {todayDone ? 'Continua a studiare' : 'Inizia la sessione di oggi'}
          </button>
          <button className="btn ghost" type="button" onClick={() => setView('argomenti')}>
            Scegli un argomento
          </button>
        </div>
      </section>

      {sessionDraft && (
        <section className="panel resume-banner">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p className="section-kicker" style={{ margin: 0 }}>
                Sessione in corso
              </p>
              <strong>
                {topics.find((t) => t.id === sessionDraft.topicId)?.title ||
                  sessionDraft.goal ||
                  'Sessione libera'}
              </strong>
              <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                Passo {(sessionDraft.step || 0) + 1} · riprendi da dove hai lasciato
              </p>
            </div>
            <button className="btn accent" type="button" onClick={() => setView('sessione')}>
              Riprendi sessione
            </button>
          </div>
        </section>
      )}

      <SectionProgress section="home" />
      <CloudSyncPanel compact />

      <section className="section panel">
        <p className="section-kicker">Strumenti rapidi</p>
        <div className="chip-row" style={{ marginTop: '0.35rem' }}>
          {(
            [
              ['lettureBibbia', 'Letture Bibbia'],
              ['ministero', 'Ministero'],
              ['decisioni', 'Decisioni'],
              ['videoStudio', 'Video → studio'],
              ['salvati', 'Da studiare'],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              className="chip"
              onClick={() => setView(view)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="section panel">
        <p className="section-kicker">Oggi</p>
        <h2>{todayDone ? 'Hai già fatto un passo' : 'Il tuo invito allo studio'}</h2>
        <p className="encourage">{dailyEncouragement()}</p>
        <div className="meta-line">
          {streak > 0 && (
            <span className="streak-mark">
              <Flame size={15} /> Serie di {streak === 1 ? '1 giorno' : `${streak} giorni`}
            </span>
          )}
          <span>
            Questa settimana:{' '}
            <strong>
              {weekCount === 1 ? '1 sessione' : `${weekCount} sessioni`}
            </strong>
          </span>
          {nextSchedule && (
            <span>
              Prossimo: <strong>{formatScheduleLabel(nextSchedule.startsAt)}</strong>
            </span>
          )}
        </div>

        {focusTopic ? (
          <div className="focus-strip">
            <h3>{plainText(focusTopic.title)}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {plainText(
                focusTopic.interest ||
                  focusTopic.objectives[0] ||
                  'Pronto per una sessione guidata',
              )}
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={() => startSession(focusTopic.id)}>
                <PlayCircle size={16} /> Apri sessione guidata
              </button>
              <button className="btn secondary" type="button" onClick={() => setView('studio')}>
                Apri quaderno
              </button>
            </div>
          </div>
        ) : (
          <div className="focus-strip">
            <p className="muted" style={{ margin: 0 }}>
              Crea un argomento per iniziare con un percorso chiaro.
            </p>
            <button className="btn" type="button" onClick={() => setView('argomenti')}>
              Crea il primo argomento
            </button>
          </div>
        )}
      </section>

      {logs[0] && (
        <section className="section panel">
          <p className="section-kicker">Ultima sessione</p>
          <h2>{plainText(logs[0].topicTitle) || 'Sessione'}</h2>
          <p className="lede">
            {logs[0].minutesSpent} min
            {plainText(logs[0].highlight || logs[0].gratitude || logs[0].goal || '')
              ? ` · ${plainText(logs[0].highlight || logs[0].gratitude || logs[0].goal || '')}`
              : ''}
          </p>
        </section>
      )}

      <section className="section panel">
        <ScheduleNextStudy
          topicId={focusTopic?.id || null}
          topicTitle={focusTopic?.title || ''}
          defaultTitle={focusTopic ? `Studio: ${focusTopic.title}` : 'Prossimo studio personale'}
        />
      </section>

      {settings.features.recentJwFeed && (
        <section className="section panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">jw.org</p>
              <h2>Video recenti</h2>
              <p className="lede">Materiale aggiornato da aprire sul sito o in JW Library</p>
            </div>
          </div>
          {feedError && <p className="muted">{feedError}</p>}
          <div className="grid-3">
            {latest.map((item) => (
              <article key={item.guid} className="media-card list-item">
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
              </article>
            ))}
          </div>
        </section>
      )}

      <p className="footnote">
        App non affiliata a jw.org. I contenuti collegati appartengono a{' '}
        <a href="https://www.jw.org/" target="_blank" rel="noreferrer">
          jw.org
        </a>
        .
      </p>
    </div>
  )
}
