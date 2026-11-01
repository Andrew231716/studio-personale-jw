import { CheckCircle2, Compass, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { SectionProgress } from '../components/SectionProgress'
import { decisionStatusLabel } from '../lib/studyMethod'
import { normalizeJwItalian } from '../lib/jwItalianTerms'
import { useAppStore } from '../store/useAppStore'

export function ObiettiviDecisioniView() {
  const decisions = useAppStore((s) => s.decisions)
  const updateDecision = useAppStore((s) => s.updateDecision)
  const setActiveDecision = useAppStore((s) => s.setActiveDecision)
  const setView = useAppStore((s) => s.setView)

  const rows = decisions
    .map((d) => ({
      decision: d,
      goals: d.goals || [],
    }))
    .filter((r) => r.goals.length > 0 || r.decision.status === 'decisa')

  const totalGoals = rows.reduce((n, r) => n + r.goals.length, 0)
  const doneGoals = rows.reduce((n, r) => n + r.goals.filter((g) => g.done).length, 0)

  return (
    <div className="stack">
      <SectionProgress section="obiettiviDecisioni" />
      <section className="panel">
        <p className="section-kicker">Collegato a Decisioni</p>
        <h2>Obiettivi delle decisioni</h2>
        <p className="lede">
          Qui gestisci progresso, modifiche ed eliminazioni degli obiettivi nati dalle decisioni.
          {totalGoals > 0 ? ` ${doneGoals}/${totalGoals} completati.` : ''}
        </p>
      </section>

      {rows.length === 0 ? (
        <section className="panel empty">
          Nessun obiettivo ancora. Apri Decisioni, genera i passi o aggiungi obiettivi a una
          decisione.
          <div style={{ marginTop: '0.85rem' }}>
            <button className="btn" type="button" onClick={() => setView('decisioni')}>
              <Compass size={16} /> Vai a Decisioni
            </button>
          </div>
        </section>
      ) : (
        rows.map(({ decision, goals }) => (
          <section className="panel" key={decision.id}>
            <div className="section-head">
              <div>
                <h3>{decision.title}</h3>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  {decisionStatusLabel(decision.status)}
                  {(decision.chosenDecision || '').trim()
                    ? ` · ${decision.chosenDecision!.trim().slice(0, 120)}`
                    : ''}
                </p>
              </div>
              <button
                className="btn secondary small"
                type="button"
                onClick={() => {
                  setActiveDecision(decision.id)
                  setView('decisioni')
                }}
              >
                Apri decisione
              </button>
            </div>

            {goals.length === 0 ? (
              <div className="empty">Nessun obiettivo su questa decisione.</div>
            ) : (
              <div className="list">
                {goals.map((g, idx) => (
                  <div className="list-item" key={g.id}>
                    <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <label className="row" style={{ gap: 8, cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={g.done}
                          onChange={(e) =>
                            updateDecision(decision.id, {
                              goals: goals.map((x) =>
                                x.id === g.id ? { ...x, done: e.target.checked } : x,
                              ),
                            })
                          }
                        />
                        <span className={g.done ? 'goal-done-label' : undefined}>
                          {g.done ? (
                            <>
                              <CheckCircle2
                                size={14}
                                style={{ marginRight: 4, verticalAlign: 'middle' }}
                              />
                              Fatto
                            </>
                          ) : (
                            'Da fare'
                          )}
                        </span>
                      </label>
                      <button
                        className="btn secondary small"
                        type="button"
                        aria-label={`Elimina obiettivo ${idx + 1}`}
                        onClick={() =>
                          updateDecision(decision.id, {
                            goals: goals.filter((x) => x.id !== g.id),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <ExpandableField
                      label={`Obiettivo ${idx + 1}`}
                      value={g.title}
                      onChange={(value) =>
                        updateDecision(decision.id, {
                          goals: goals.map((x) =>
                            x.id === g.id
                              ? { ...x, title: normalizeJwItalian(value) }
                              : x,
                          ),
                        })
                      }
                      rows={2}
                    />
                    <ExpandableField
                      label={`Note ${idx + 1}`}
                      value={g.notes || ''}
                      placeholder="Appunti…"
                      onChange={(value) =>
                        updateDecision(decision.id, {
                          goals: goals.map((x) =>
                            x.id === g.id ? { ...x, notes: value } : x,
                          ),
                        })
                      }
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}
