import { useEffect, useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { JwSearch } from '../components/JwSearch'
import { ScheduleNextStudy } from '../components/ScheduleNextStudy'
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
          <p className="section-kicker">Sessione completata</p>
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

        <section className="panel">
          <ScheduleNextStudy
            topicId={celebration.topicId}
            topicTitle={celebration.topicTitle}
            defaultTitle={`Studio: ${celebration.topicTitle}`}
            defaultNotes={
              [
                celebration.practice ? `Da provare: ${celebration.practice}` : '',
                celebration.keyVerse ? `Scrittura: ${celebration.keyVerse}` : '',
              ]
                .filter(Boolean)
                .join('\n')
            }
          />
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
            <p className="section-kicker" style={{ margin: 0 }}>Percorso guidato</p>
            {streak > 0 && (
              <span className="streak-mark">
                <Flame size={14} /> Serie {streak} giorni
              </span>
            )}
          </div>
          <h2>Una sessione che ti accompagna</h2>
          <p className="lede">
            Otto passi brevi: preghiera, obiettivo, materiale jw.org, meditazione e un’azione concreta.
          </p>
          <p className="encourage">{dailyEncouragement()}</p>

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
          <ScheduleNextStudy
            topicId={focusTopic?.id || null}
            topicTitle={focusTopic?.title || ''}
            defaultTitle={focusTopic ? `Studio: ${focusTopic.title}` : 'Prossimo studio personale'}
          />
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
        <div className="meta-line">
          <span>
            Passo <strong>{draft.step + 1}/{SESSION_STEPS.length}</strong>
          </span>
          <span>
            {topic ? topic.title : 'Sessione libera'} · ~{elapsedMin || tick || 1} min
          </span>
        </div>
        <h2>{step.title}</h2>
        <p className="lede">{step.hint}</p>

        {draft.step === 0 && (
          <ExpandableField
            label="Breve preghiera / intenzione"
            value={draft.prayer}
            onChange={(value) => updateDraft({ prayer: value })}
            placeholder="Es. Geova, aiutami a capire meglio e ad applicare con amore…"
          />
        )}

        {draft.step === 1 && (
          <ExpandableField
            label="Il mio obiettivo di oggi"
            value={draft.goal}
            onChange={(value) => updateDraft({ goal: value })}
            placeholder="Es. Capire come rendere più sincere le mie preghiere"
          />
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
            <ExpandableField
              label="Cosa mi ha colpito"
              value={draft.highlight}
              onChange={(value) => updateDraft({ highlight: value })}
              placeholder="Una frase, un esempio, un sentimento…"
            />
            <ExpandableField
              label="Scrittura chiave (se ce n’è una)"
              value={draft.keyVerse}
              onChange={(value) => updateDraft({ keyVerse: value })}
              placeholder="Es. Filippesi 4:6, 7"
              multiline={false}
            />
          </div>
        )}

        {draft.step === 4 && (
          <ExpandableField
            label="La mia meditazione"
            value={draft.reflection}
            onChange={(value) => updateDraft({ reflection: value })}
            placeholder="Con le tue parole: cosa impari su Geova? Come ti parla questo punto?"
            rows={6}
          />
        )}

        {draft.step === 5 && (
          <div className="stack">
            <ExpandableField
              label="Domanda"
              value={draft.question}
              onChange={(value) => updateDraft({ question: value })}
            />
            <ExpandableField
              label="La mia risposta"
              value={draft.answer}
              onChange={(value) => updateDraft({ answer: value })}
              placeholder="Rispondi con onestà, anche in poche frasi"
            />
          </div>
        )}

        {draft.step === 6 && (
          <ExpandableField
            label="Cosa proverò entro 48 ore"
            value={draft.practice}
            onChange={(value) => updateDraft({ practice: value })}
            placeholder="Es. Pregare ogni mattina 2 minuti su questo tema"
          />
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
            <ExpandableField
              label="Per cosa ringrazio Geova"
              value={draft.gratitude}
              onChange={(value) => updateDraft({ gratitude: value })}
              placeholder="Anche una riga basta"
            />
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
