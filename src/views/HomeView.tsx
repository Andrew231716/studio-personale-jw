import { useEffect, useMemo, useState } from 'react'
import { Flame, PlayCircle } from 'lucide-react'
import { CloudSyncPanel } from '../components/CloudSyncPanel'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { ScheduleNextStudy } from '../components/ScheduleNextStudy'
import { SectionProgress } from '../components/SectionProgress'
import { getBibleReadingStatus, sortBibleReadingPlans } from '../lib/bibleReadingGuide'
import { formatScheduleLabel } from '../lib/calendar'
import { fetchLatestVideos, type LatestMediaItem } from '../lib/jwApi'
import {
  SESSION_STEPS,
  computeStreak,
  dailyEncouragement,
  sessionsThisWeek,
  studiedToday,
  sessionStepIndexes,
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
  const readingPlans = useAppStore((s) => s.bibleReadingPlans)
  const openBibleReadingPlan = useAppStore((s) => s.openBibleReadingPlan)
  const sessionDraft = useAppStore((s) => s.sessionDraft)
  const setView = useAppStore((s) => s.setView)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
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
  const readingPlan = settings.features.lettureBibbia !== false
    ? sortBibleReadingPlans(readingPlans).find((plan) => getBibleReadingStatus(plan).next)
    : undefined
  const canResumeSession = sessionDraft && settings.features.sessione !== false
  const readingStatus = readingPlan && getBibleReadingStatus(readingPlan)
  const sessionSteps = sessionStepIndexes(sessionDraft?.mode)
  const sessionStepTitle = sessionDraft && SESSION_STEPS[sessionSteps[sessionDraft.step]]?.title

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
        <div className="hero-actions study-actions">
          {canResumeSession ? (
            <button className="btn accent" type="button" onClick={() => setView('sessione')}>
              Riprendi sessione
            </button>
          ) : readingPlan ? (
            <button className="btn accent" type="button" onClick={() => openBibleReadingPlan(readingPlan.id)}>
              Riprendi lettura
            </button>
          ) : settings.features.sessione !== false && (
            <button className="btn accent" type="button" onClick={() => setView('sessione')}>
              Inizia a studiare
            </button>
          )}
          {settings.features.argomenti && (
            <button className="btn ghost" type="button" onClick={() => setView('argomenti')}>
              Scegli un argomento
            </button>
          )}
        </div>
        {canResumeSession && (
          <p>
            {topics.find((item) => item.id === sessionDraft.topicId)?.title || sessionDraft.goal || 'Sessione libera'}
            {' · '}Passo {sessionDraft.step + 1} di {sessionSteps.length}{sessionStepTitle ? ` · ${sessionStepTitle}` : ''}
          </p>
        )}
        {readingPlan && readingStatus && (
          <div className="stack home-reading">
            <p><strong>{plainText(readingPlan.title)}</strong> · {readingStatus.label}</p>
            {canResumeSession ? (
              <button className="btn ghost" type="button" onClick={() => openBibleReadingPlan(readingPlan.id)}>
                Riprendi lettura
              </button>
            ) : settings.features.sessione !== false && (
              <button className="btn ghost" type="button" onClick={() => setView('sessione')}>
                Inizia una sessione
              </button>
            )}
          </div>
        )}
      </section>



      <section className="section panel">
        <p className="section-kicker">Oggi</p>
        <h2>{todayDone ? 'Hai già fatto un passo' : 'Spunto di oggi'}</h2>
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

        {nextSchedule && (
          <div className="focus-strip" style={{ marginBottom: '0.85rem' }}>
            <h3>{plainText(nextSchedule.title)}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {formatScheduleLabel(nextSchedule.startsAt)}
              {nextSchedule.topicTitle ? ` · ${plainText(nextSchedule.topicTitle)}` : ''}
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button
                className="btn accent"
                type="button"
                onClick={() => startSession(nextSchedule.topicId)}
              >
                <PlayCircle size={16} /> Inizia sessione
              </button>
              {nextSchedule.topicId && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setActiveTopic(nextSchedule.topicId)}
                >
                  Apri quaderno
                </button>
              )}
            </div>
          </div>
        )}

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
              <button className="btn secondary" type="button" onClick={() => setActiveTopic(focusTopic.id)}>
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

      <details className="section panel study-options">
        <summary>Strumenti di studio</summary>
        <div className="chip-row" style={{ marginTop: '0.35rem' }}>
          {(
            [
              ['lettureBibbia', 'Letture Bibbia', settings.features.lettureBibbia !== false],
              ['ministero', 'Ministero', settings.features.ministero !== false],
              ['discorso', 'Discorso', settings.features.discorso !== false],
              ['decisioni', 'Decisioni', settings.features.decisioni],
              [
                'obiettiviDecisioni',
                'Obiettivi',
                settings.features.obiettiviDecisioni !== false,
              ],
              ['videoStudio', 'Video → studio', settings.features.videoStudio !== false],
              ['salvati', 'Da studiare', settings.features.salvati !== false],
            ] as const
          )
            .filter(([, , on]) => on)
            .map(([view, label]) => (
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
      </details>
      <SectionProgress section="home" />
      <CloudSyncPanel compact />

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
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button className="btn secondary" type="button" onClick={() => setView('diario')}>
              Apri Diario
            </button>
            {logs[0].topicId && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => setActiveTopic(logs[0].topicId)}
              >
                Apri Quaderno
              </button>
            )}
            <button
              className="btn"
              type="button"
              onClick={() => startSession(logs[0].topicId)}
            >
              <PlayCircle size={16} /> Nuova sessione
            </button>
          </div>
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
          {feedError && (
            <p className="muted" style={{ marginTop: 0 }}>
              {feedError.includes('API non disponibile')
                ? 'Video non caricabili qui: manca il server API locale. Sul sito pubblicato funzionano normalmente.'
                : feedError}
            </p>
          )}
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
