import { useEffect, useState } from 'react'
import { BookOpen, Compass, Sparkles } from 'lucide-react'
import { fetchLatestVideos, type LatestMediaItem } from '../lib/jwApi'
import { STUDY_STEPS } from '../lib/studyMethod'
import { useAppStore } from '../store/useAppStore'

export function HomeView() {
  const settings = useAppStore((s) => s.settings)
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const setView = useAppStore((s) => s.setView)
  const [latest, setLatest] = useState<LatestMediaItem[]>([])
  const [feedError, setFeedError] = useState('')

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
        <div className="badge" style={{ width: 'fit-content' }}>Fonte: jw.org</div>
        <h1>{settings.brandName}</h1>
        <p>{settings.tagline}</p>
        <div className="hero-actions">
          <button className="btn accent" type="button" onClick={() => setView('argomenti')}>
            Inizia uno studio
          </button>
          <button className="btn ghost" type="button" onClick={() => setView('decisioni')}>
            Valuta una decisione
          </button>
          <button className="btn ghost" type="button" onClick={() => setView('assistente')}>
            Chiedi all’AI
          </button>
        </div>
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
          <div className="row"><Sparkles size={18} /><h3>Metodo</h3></div>
          <p className="muted">Basato su consigli recenti di jw.org</p>
          <button className="btn secondary" type="button" onClick={() => setView('studio')}>
            Vedi studio
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Come studiare oggi</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>{settings.studyMethodNotes}</p>
          </div>
        </div>
        <div className="steps">
          {STUDY_STEPS.map((step, i) => (
            <div className="step" key={step.id}>
              <div className="step-num">{i + 1}</div>
              <div>
                <strong>{step.title}</strong>
                <p className="muted" style={{ margin: '0.2rem 0 0' }}>{step.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {settings.features.recentJwFeed && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h2>Video recenti su jw.org</h2>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                Materiale aggiornato da cui trarre obiettivi e punti di riflessione
              </p>
            </div>
          </div>
          {feedError && <p className="muted">{feedError}</p>}
          <div className="grid-3">
            {latest.map((item) => (
              <a
                key={item.guid}
                className="list-item result-link"
                href={item.url}
                target="_blank"
                rel="noreferrer"
              >
                {item.image ? (
                  <img className="media-thumb" src={item.image} alt="" loading="lazy" />
                ) : (
                  <div className="media-thumb" />
                )}
                <strong>{item.title}</strong>
                <span className="muted">{item.duration}</span>
              </a>
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
