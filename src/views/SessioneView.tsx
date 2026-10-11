import { useEffect, useMemo, useState } from 'react'
import { Flame, Sparkles } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { JwSearch } from '../components/JwSearch'
import {
  SESSION_STEPS,
  computeStreak,
  dailyEncouragement,
} from '../lib/progress'
import { useAppStore } from '../store/useAppStore'

export function SessioneView() {
  const topics = useAppStore((s) => s.topics)
  const draft = useAppStore((s) => s.sessionDraft)
  const logs = useAppStore((s) => s.sessionLogs)
  const language = useAppStore((s) => s.settings.language)
  const startSession = useAppStore((s) => s.startSession)
  const updateDraft = useAppStore((s) => s.updateSessionDraft)
  const completeSession = useAppStore((s) => s.completeSession)
  const abandonSession = useAppStore((s) => s.abandonSession)
  const [doneLogId, setDoneLogId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const streak = useMemo(() => computeStreak(logs), [logs])
  const lastLog = logs[0]
  const celebration = doneLogId ? logs.find((l) => l.id === doneLogId) : null

  useEffect(() => {
    if (!draft) return
    const id = window.setInterval(() => setTick((t) => t + 1), 30000)
    return () => window.clearInterval(id)
  }, [draft])

  const elapsedMin = draft
    ? Math.max(
        1,
        Math.round((Date.now() - new Date(draft.startedAt).getTime()) / 60000) || 1,
      )
    : 0

  if (celebration) {
    return (
      <div className="session-shell">
        <section className="panel session-card celebrate">
          <div className="badge">Sessione completata</div>
          <h2>Hai studiato con il cuore</h2>
          <p className="muted">
            {celebration.minutesSpent} min · {celebration.topicTitle}
            {streak > 0 ? ` · serie di ${streak} giorni` : ''}
          </p>
          <div className="session-summary">
            {celebration.goal && (
              <div>
                <strong>Obiettivo</strong>
                <p>{celebration.goal}</p>
              </div>
            )}
            {celebration.highlight && (
              <div>
                <strong>Ciò che ti ha colpito</strong>
                <p>{celebration.highlight}</p>
              </div>
            )}
            {celebration.keyVerse && (
              <div>
                <strong>Scrittura chiave</strong>
                <p>{celebration.keyVerse}</p>
              </div>
            )}
            {celebration.practice && (
              <div>
                <strong>Da provare</strong>
                <p>{celebration.practice}</p>
              </div>
            )}
            {celebration.gratitude && (
              <div>
                <strong>Gratitudine</strong>
                <p>{celebration.gratitude}</p>
              </div>
            )}
          </div>
          <p className="encourage">{dailyEncouragement()}</p>
          <div className="row">
            <button className="btn accent" type="button" onClick={() => setDoneLogId(null)}>
              Torna alle sessioni
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setDoneLogId(null)
                startSession(celebration.topicId)
              }}
            >
              Un altro passo
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!draft) {
    const focusTopic =
      topics.find((t) => t.status === 'in_corso') ||
      topics.find((t) => t.status === 'da_iniziare') ||
      topics[0]

    return (
      <div className="session-shell">
        <section className="panel session-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="badge">Percorso guidato</div>
            {streak > 0 && (
              <span className="streak-pill">
                <Flame size={14} /> Serie {streak} giorni
              </span>
            )}
          </div>
          <h2>Una sessione che ti accompagna</h2>
          <p className="muted">
            Otto passi brevi: preghiera, obiettivo, materiale jw.org, meditazione e un’azione concreta.
            Un passo alla volta, senza fretta.
          </p>
          <p className="encourage">
            <Sparkles size={16} /> {dailyEncouragement()}
          </p>

          {focusTopic ? (
            <div className="list-item" style={{ marginTop: '0.5rem' }}>
              <strong>Continua: {focusTopic.title}</strong>
              <p className="muted" style={{ margin: 0 }}>
                {focusTopic.interest || focusTopic.objectives[0]}
              </p>
              <button
                className="btn accent"
                type="button"
                onClick={() => startSession(focusTopic.id)}
              >
                Inizia questa sessione
              </button>
            </div>
          ) : (
            <div className="empty">
              Aggiungi prima un argomento, oppure inizia una sessione libera.
            </div>
          )}

          <div className="row" style={{ marginTop: '0.8rem' }}>
            <button className="btn" type="button" onClick={() => startSession(null)}>
              Sessione libera
            </button>
            {topics.length > 1 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) startSession(e.target.value)
                }}
              >
                <option value="" disabled>
                  Scegli un altro argomento…
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {lastLog && (
            <div className="footnote">
              Ultima sessione: {lastLog.topicTitle} · {lastLog.minutesSpent} min
            </div>
          )}
        </section>

        <section className="panel">
          <h3>I passi che farai</h3>
          <div className="steps">
            {SESSION_STEPS.map((step, i) => (
              <div className="step" key={step.id}>
                <div className="step-num">{i + 1}</div>
                <div>
                  <strong>{step.title}</strong>
                  <p className="muted" style={{ margin: '0.2rem 0 0' }}>{step.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  const step = SESSION_STEPS[draft.step] || SESSION_STEPS[0]
  const progress = ((draft.step + 1) / SESSION_STEPS.length) * 100
  const topic = topics.find((t) => t.id === draft.topicId)

  function next() {
    if (draft!.step >= SESSION_STEPS.length - 1) {
      updateDraft({ minutesSpent: elapsedMin })
      const log = completeSession()
      if (log) setDoneLogId(log.id)
      return
    }
    updateDraft({ step: draft!.step + 1, minutesSpent: elapsedMin })
  }

  function back() {
    if (draft!.step <= 0) return
    updateDraft({ step: draft!.step - 1 })
  }

  return (
    <div className="session-shell">
      <section className="panel session-card">
        <div className="session-progress" aria-hidden>
          <div className="session-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="badge">
            Passo {draft.step + 1}/{SESSION_STEPS.length}
          </span>
          <span className="muted">
            {topic ? topic.title : 'Sessione libera'} · ~{elapsedMin || tick || 1} min
          </span>
        </div>
        <h2>{step.title}</h2>
        <p className="muted">{step.hint}</p>

        {draft.step === 0 && (
          <div className="field">
            <label>Breve preghiera / intenzione</label>
            <textarea
              value={draft.prayer}
              onChange={(e) => updateDraft({ prayer: e.target.value })}
              placeholder="Es. Geova, aiutami a capire meglio e ad applicare con amore…"
            />
          </div>
        )}

        {draft.step === 1 && (
          <div className="field">
            <label>Il mio obiettivo di oggi</label>
            <textarea
              value={draft.goal}
              onChange={(e) => updateDraft({ goal: e.target.value })}
              placeholder="Es. Capire come rendere più sincere le mie preghiere"
            />
          </div>
        )}

        {draft.step === 2 && (
          <div className="stack">
            {(draft.resourceTitle || draft.resourceUrl) && (
              <div className="list-item">
                <strong>{draft.resourceTitle || 'Materiale scelto'}</strong>
                <JwOpenButtons
                  url={draft.resourceUrl}
                  lank={draft.resourceLank}
                  docid={draft.resourceDocid}
                  language={language}
                  compact
                />
              </div>
            )}
            <div className="field">
              <label>Titolo del materiale</label>
              <input
                value={draft.resourceTitle}
                onChange={(e) => updateDraft({ resourceTitle: e.target.value })}
                placeholder="Titolo articolo o video"
              />
            </div>
            <JwSearch
              compact
              language={language}
              onAddResource={(res) =>
                updateDraft({
                  resourceTitle: res.title,
                  resourceUrl: res.url,
                  resourceLank: res.lank,
                  resourceDocid: res.docid,
                })
              }
            />
          </div>
        )}

        {draft.step === 3 && (
          <div className="stack">
            {draft.resourceUrl && (
              <JwOpenButtons
                url={draft.resourceUrl}
                lank={draft.resourceLank}
                docid={draft.resourceDocid}
                language={language}
              />
            )}
            <div className="field">
              <label>Cosa mi ha colpito</label>
              <textarea
                value={draft.highlight}
                onChange={(e) => updateDraft({ highlight: e.target.value })}
                placeholder="Una frase, un esempio, un sentimento…"
              />
            </div>
            <div className="field">
              <label>Scrittura chiave (se ce n’è una)</label>
              <input
                value={draft.keyVerse}
                onChange={(e) => updateDraft({ keyVerse: e.target.value })}
                placeholder="Es. Filippesi 4:6, 7"
              />
            </div>
          </div>
        )}

        {draft.step === 4 && (
          <div className="field">
            <label>La mia meditazione</label>
            <textarea
              value={draft.reflection}
              onChange={(e) => updateDraft({ reflection: e.target.value })}
              placeholder="Con le tue parole: cosa impari su Geova? Come ti parla questo punto?"
              style={{ minHeight: 140 }}
            />
          </div>
        )}

        {draft.step === 5 && (
          <div className="stack">
            <div className="field">
              <label>Domanda</label>
              <input
                value={draft.question}
                onChange={(e) => updateDraft({ question: e.target.value })}
              />
            </div>
            <div className="field">
              <label>La mia risposta</label>
              <textarea
                value={draft.answer}
                onChange={(e) => updateDraft({ answer: e.target.value })}
                placeholder="Rispondi con onestà, anche in poche frasi"
              />
            </div>
          </div>
        )}

        {draft.step === 6 && (
          <div className="field">
            <label>Cosa proverò entro 48 ore</label>
            <textarea
              value={draft.practice}
              onChange={(e) => updateDraft({ practice: e.target.value })}
              placeholder="Es. Pregare ogni mattina 2 minuti su questo tema"
            />
          </div>
        )}

        {draft.step === 7 && (
          <div className="stack">
            <div className="session-summary preview">
              <div>
                <strong>Obiettivo</strong>
                <p>{draft.goal || '—'}</p>
              </div>
              <div>
                <strong>Highlight</strong>
                <p>{draft.highlight || draft.reflection || '—'}</p>
              </div>
              <div>
                <strong>Pratica</strong>
                <p>{draft.practice || '—'}</p>
              </div>
            </div>
            <div className="field">
              <label>Per cosa ringrazio Geova</label>
              <textarea
                value={draft.gratitude}
                onChange={(e) => updateDraft({ gratitude: e.target.value })}
                placeholder="Anche una riga basta"
              />
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
          <div className="row">
            <button className="btn secondary" type="button" onClick={back} disabled={draft.step === 0}>
              Indietro
            </button>
            <button className="btn secondary" type="button" onClick={abandonSession}>
              Esci
            </button>
          </div>
          <button className="btn accent" type="button" onClick={next}>
            {draft.step >= SESSION_STEPS.length - 1 ? 'Completa sessione' : 'Avanti'}
          </button>
        </div>
      </section>
    </div>
  )
}
