import { useEffect, useMemo, useState } from 'react'
import { Archive, BookMarked, Flame, NotebookPen } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { JwSearch } from '../components/JwSearch'
import { ScheduleNextStudy } from '../components/ScheduleNextStudy'
import { ScriptureAssist } from '../components/ScriptureAssist'
import { SectionProgress } from '../components/SectionProgress'
import { StudyFlowGuide } from '../components/StudyFlowGuide'
import {
  SESSION_STEPS,
  sessionStepIndexes,
  computeStreak,
  dailyEncouragement,
} from '../lib/progress'
import { bibleOpenUrl, parseScriptureLabel } from '../lib/bibleRefs'
import { pickFocusTopic, topicHasUpcomingSchedule } from '../lib/studyFlow'
import { useAppStore } from '../store/useAppStore'

export function SessioneView() {
  const topics = useAppStore((s) => s.topics)
  const draft = useAppStore((s) => s.sessionDraft)
  const logs = useAppStore((s) => s.sessionLogs)
  const schedules = useAppStore((s) => s.schedules)
  const language = useAppStore((s) => s.settings.language)
  const startSession = useAppStore((s) => s.startSession)
  const updateDraft = useAppStore((s) => s.updateSessionDraft)
  const completeSession = useAppStore((s) => s.completeSession)
  const lastCompletedSessionId = useAppStore((s) => s.lastCompletedSessionId)
  const clearLastCompletedSession = useAppStore((s) => s.clearLastCompletedSession)
  const abandonSession = useAppStore((s) => s.abandonSession)
  const archiveTopic = useAppStore((s) => s.archiveTopic)
  const reopenTopic = useAppStore((s) => s.reopenTopic)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const setView = useAppStore((s) => s.setView)
  const [tick, setTick] = useState(0)
  const [afterChoice, setAfterChoice] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState<string>()

  const streak = useMemo(() => computeStreak(logs), [logs])
  const lastLog = logs[0]
  const celebration = lastCompletedSessionId
    ? logs.find((l) => l.id === lastCompletedSessionId) || null
    : null
  const celebrationTopic = celebration?.topicId
    ? topics.find((t) => t.id === celebration.topicId)
    : null
  const hasMoreDaysPlanned = topicHasUpcomingSchedule(celebration?.topicId, schedules)

  function dismissCelebration() {
    clearLastCompletedSession()
    setAfterChoice('')
  }

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
        <StudyFlowGuide current="sessione" />
        <section className="panel session-card celebrate">
          <p className="section-kicker">Sessione completata e salvata nel Diario</p>
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
        </section>

        {celebration.topicId && celebrationTopic && (
          <section className="panel">
            <p className="section-kicker">E adesso?</p>
            <h3 style={{ marginTop: 0 }}>Chiudi o continua questo argomento</h3>
            <p className="lede">
              La sessione è già nel Diario. Se non hai altri giorni previsti, puoi archiviare
              l’argomento. Se vuoi approfondire, tienilo aperto nel Quaderno o programma altri
              giorni.
            </p>
            {hasMoreDaysPlanned && (
              <p className="muted" style={{ marginTop: 0 }}>
                Hai già altri studi programmati per questo argomento: resta attivo.
              </p>
            )}
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={hasMoreDaysPlanned || celebrationTopic.status === 'completato'}
                onClick={() => {
                  archiveTopic(celebration.topicId!)
                  setAfterChoice('Argomento archiviato. Lo trovi in Argomenti → Archiviati.')
                }}
              >
                <Archive size={16} /> Completa e archivia
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  reopenTopic(celebration.topicId!, 'approfondire')
                  dismissCelebration()
                  setActiveTopic(celebration.topicId)
                }}
              >
                <NotebookPen size={16} /> Continua nel Quaderno
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  dismissCelebration()
                  setView('diario')
                }}
              >
                <BookMarked size={16} /> Apri il Diario
              </button>
            </div>
            {afterChoice && (
              <p className="muted" style={{ margin: '0.65rem 0 0' }}>
                {afterChoice}
              </p>
            )}
          </section>
        )}

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
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            Se programmi altri giorni, l’argomento resta attivo (non viene archiviato).
          </p>
        </section>

        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn secondary" type="button" onClick={dismissCelebration}>
            Torna alle sessioni
          </button>
          <button
            className="btn ghost"
            type="button"
            style={{ color: 'inherit' }}
            onClick={() => {
              dismissCelebration()
              startSession(celebration.topicId)
            }}
          >
            Un’altra sessione subito
          </button>
        </div>
      </div>
    )
  }

  if (!draft) {
    const focusTopic = pickFocusTopic(topics)

    return (
      <div className="session-shell">
        <StudyFlowGuide current="sessione" />
        <SectionProgress section="sessione" />
        <section className="panel session-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <p className="section-kicker" style={{ margin: 0 }}>Percorso guidato</p>
            {streak > 0 && (
              <span className="streak-mark">
                <Flame size={14} /> Serie {streak} giorni
              </span>
            )}
          </div>
          <h2>Inizia a studiare</h2>
          <p className="lede">Scegli l’argomento e il tipo di sessione.</p>
          <div className="field">
            <label htmlFor="session-topic">Argomento della sessione</label>
            <select
              id="session-topic"
              value={selectedTopicId ?? focusTopic?.id ?? ''}
              onChange={(event) => setSelectedTopicId(event.target.value)}
            >
              <option value="">Sessione libera</option>
              {topics.filter((item) => item.status !== 'completato').map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="row study-actions">
            <button className="btn accent" type="button" onClick={() => startSession((selectedTopicId ?? focusTopic?.id) || null, 'rapida')}>
              Sessione rapida
            </button>
            <button className="btn secondary" type="button" onClick={() => startSession((selectedTopicId ?? focusTopic?.id) || null, 'completa')}>
              Sessione completa
            </button>
          </div>
          <p className="muted">Rapida: leggi, rifletti, applica. Completa: otto passi guidati.</p>

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

  const stepIndexes = sessionStepIndexes(draft.mode)
  const currentStep = stepIndexes[draft.step] ?? stepIndexes[0]
  const rapidLabels = ['Leggi', 'Rifletti', 'Applica']
  const step = SESSION_STEPS[currentStep]
  const progress = ((draft.step + 1) / stepIndexes.length) * 100
  const topic = topics.find((t) => t.id === draft.topicId)

  function next() {
    if (draft!.step >= stepIndexes.length - 1) {
      updateDraft({ minutesSpent: elapsedMin })
      completeSession()
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
            Passo <strong>{draft.step + 1}/{stepIndexes.length}</strong>
          </span>
          <span>
            {topic ? topic.title : 'Sessione libera'} · ~{elapsedMin || tick || 1} min
          </span>
        </div>
        <h2>{draft.mode === 'rapida' ? rapidLabels[draft.step] : step.title}</h2>
        <p className="lede">{step.hint}</p>

        {currentStep === 0 && (
          <ExpandableField
            label="Breve preghiera / intenzione"
            value={draft.prayer}
            onChange={(value) => updateDraft({ prayer: value })}
            placeholder="Es. Geova, aiutami a capire meglio e ad applicare con amore…"
          />
        )}

        {currentStep === 1 && (
          <ExpandableField
            label="Il mio obiettivo di oggi"
            value={draft.goal}
            onChange={(value) => updateDraft({ goal: value })}
            placeholder="Es. Capire come rendere più sincere le mie preghiere"
          />
        )}

        {currentStep === 2 && (
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

        {currentStep === 3 && (
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
            {draft.keyVerse.trim() && (() => {
              const parsed = parseScriptureLabel(draft.keyVerse)
              const openUrl = parsed.bible
                ? bibleOpenUrl(parsed.bible, language)
                : `https://www.jw.org/finder?prefer=lang&wtlocale=${language}&q=${encodeURIComponent(draft.keyVerse.trim())}`
              return (
                <JwOpenButtons
                  url={openUrl}
                  bible={parsed.bible}
                  language={language}
                  compact
                  webLabel={draft.keyVerse.trim()}
                />
              )
            })()}
            <ScriptureAssist
              text={`${draft.keyVerse}\n${draft.highlight}\n${draft.reflection}`}
              language={language}
              compact
              onInsert={(snippet) =>
                updateDraft({
                  reflection: draft.reflection.trim()
                    ? `${draft.reflection.trim()}\n\n${snippet}`
                    : snippet,
                })
              }
            />
          </div>
        )}

        {currentStep === 4 && (
          <>
            <ExpandableField
              label="La mia meditazione"
              value={draft.reflection}
              onChange={(value) => updateDraft({ reflection: value })}
              placeholder="Con le tue parole: cosa impari su Geova? Come ti parla questo punto? Es. Mt 6:33"
              rows={6}
            />
            <ScriptureAssist
              text={draft.reflection}
              language={language}
              onInsert={(snippet) =>
                updateDraft({
                  reflection: draft.reflection.trim()
                    ? `${draft.reflection.trim()}\n\n${snippet}`
                    : snippet,
                })
              }
            />
          </>
        )}

        {currentStep === 5 && (
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

        {currentStep === 6 && (
          <ExpandableField
            label="Cosa proverò entro 48 ore"
            value={draft.practice}
            onChange={(value) => updateDraft({ practice: value })}
            placeholder="Es. Pregare ogni mattina 2 minuti su questo tema"
          />
        )}

        {currentStep === 7 && (
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

        <div className="row study-actions" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
          <div className="row study-actions">
            <button className="btn secondary" type="button" onClick={back} disabled={draft.step === 0}>
              Indietro
            </button>
            <button className="btn secondary" type="button" onClick={() => setView('home')}>
              Salva e torna alla Home
            </button>
          </div>
          <button className="btn accent" type="button" onClick={next}>
            {draft.step >= stepIndexes.length - 1 ? 'Completa sessione' : 'Avanti'}
          </button>
        </div>
        <button
          className="btn secondary small"
          type="button"
          onClick={() => {
            if (window.confirm('Vuoi sostituire la bozza in corso? I suoi appunti verranno eliminati.')) abandonSession()
          }}
        >
          Inizia una nuova sessione
        </button>
      </section>
    </div>
  )
}
