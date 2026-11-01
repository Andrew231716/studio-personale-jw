import { useState } from 'react'
import { CheckCircle2, Compass, Plus, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { SectionProgress } from '../components/SectionProgress'
import { uid } from '../lib/id'
import { decisionStatusLabel } from '../lib/studyMethod'
import { normalizeJwItalian } from '../lib/jwItalianTerms'
import { useAppStore } from '../store/useAppStore'

export function ObiettiviDecisioniView() {
  const decisions = useAppStore((s) => s.decisions)
  const updateDecision = useAppStore((s) => s.updateDecision)
  const setActiveDecision = useAppStore((s) => s.setActiveDecision)
  const setView = useAppStore((s) => s.setView)

  const [filter, setFilter] = useState<'tutti' | 'da_fare' | 'fatti' | 'scadenza'>('tutti')
  const [newGoalFor, setNewGoalFor] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDue, setDraftDue] = useState('')
  const [pickDecisionId, setPickDecisionId] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const rows = decisions
    .map((d) => ({
      decision: d,
      goals: d.goals || [],
    }))
    .filter((r) => r.goals.length > 0 || r.decision.status === 'decisa')

  const totalGoals = rows.reduce((n, r) => n + r.goals.length, 0)
  const doneGoals = rows.reduce((n, r) => n + r.goals.filter((g) => g.done).length, 0)

  function addGoal(decisionId: string, title: string, dueDate?: string) {
    const text = normalizeJwItalian(title.trim())
    if (!text) return
    const decision = decisions.find((d) => d.id === decisionId)
    if (!decision) return
    updateDecision(decisionId, {
      goals: [
        ...(decision.goals || []),
        {
          id: uid('goal'),
          title: text,
          done: false,
          notes: '',
          dueDate: dueDate || draftDue || undefined,
          createdAt: new Date().toISOString(),
        },
      ],
    })
    setDraftTitle('')
    setDraftDue('')
    setNewGoalFor(null)
    setPickDecisionId('')
  }

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
        {totalGoals > 0 && (
          <div className="chip-row" style={{ marginTop: '0.65rem' }}>
            {(
              [
                ['tutti', 'Tutti'],
                ['da_fare', 'Da fare'],
                ['scadenza', 'In scadenza'],
                ['fatti', 'Completati'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`chip ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Aggiungi obiettivo</h3>
        {decisions.length === 0 ? (
          <div className="empty">
            Nessuna decisione ancora.
            <div style={{ marginTop: '0.75rem' }}>
              <button className="btn" type="button" onClick={() => setView('decisioni')}>
                <Compass size={16} /> Vai a Decisioni
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <div className="field">
              <label htmlFor="goal-decision">Decisione</label>
              <select
                id="goal-decision"
                value={pickDecisionId}
                onChange={(e) => setPickDecisionId(e.target.value)}
              >
                <option value="">Scegli…</option>
                {decisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="goal-title">Nuovo obiettivo</label>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <input
                  id="goal-title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Es. Parlare con l’anziano questa settimana"
                  style={{ flex: 1, minWidth: 160 }}
                />
                <input
                  type="date"
                  value={draftDue}
                  onChange={(e) => setDraftDue(e.target.value)}
                  aria-label="Scadenza"
                  title="Scadenza"
                />
                <button
                  className="btn accent"
                  type="button"
                  disabled={!pickDecisionId || !draftTitle.trim()}
                  onClick={() => addGoal(pickDecisionId, draftTitle)}
                >
                  <Plus size={16} /> Aggiungi
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <section className="panel empty">
          Nessun obiettivo ancora. Aggiungine uno sopra, oppure apri Decisioni e genera i passi.
          <div style={{ marginTop: '0.85rem' }}>
            <button className="btn" type="button" onClick={() => setView('decisioni')}>
              <Compass size={16} /> Vai a Decisioni
            </button>
          </div>
        </section>
      ) : (
        rows.map(({ decision, goals }) => {
          const visible = goals.filter((g) => {
            if (filter === 'da_fare') return !g.done
            if (filter === 'fatti') return g.done
            if (filter === 'scadenza') {
              return !g.done && !!g.dueDate && g.dueDate <= today
            }
            return true
          })
          if (filter !== 'tutti' && visible.length === 0 && goals.length > 0) return null
          return (
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
                <div className="empty">
                  Nessun obiettivo su questa decisione.
                  <div style={{ marginTop: '0.65rem' }}>
                    {newGoalFor === decision.id ? (
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          placeholder="Scrivi l’obiettivo…"
                          style={{ flex: 1, minWidth: 140 }}
                        />
                        <button
                          className="btn accent small"
                          type="button"
                          disabled={!draftTitle.trim()}
                          onClick={() => addGoal(decision.id, draftTitle)}
                        >
                          Salva
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => {
                          setNewGoalFor(decision.id)
                          setDraftTitle('')
                        }}
                      >
                        <Plus size={14} /> Aggiungi obiettivo
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="list">
                  {visible.map((g, idx) => (
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
                      <div className="field">
                        <label htmlFor={`obj-due-${g.id}`}>Scadenza</label>
                        <input
                          id={`obj-due-${g.id}`}
                          type="date"
                          value={g.dueDate || ''}
                          onChange={(e) =>
                            updateDecision(decision.id, {
                              goals: goals.map((x) =>
                                x.id === g.id
                                  ? { ...x, dueDate: e.target.value || undefined }
                                  : x,
                              ),
                            })
                          }
                        />
                        {g.dueDate && !g.done && (
                          <p
                            className={`muted ${
                              g.dueDate < today
                                ? 'goal-due-overdue'
                                : g.dueDate === today
                                  ? 'goal-due-today'
                                  : ''
                            }`}
                            style={{ margin: '0.35rem 0 0' }}
                          >
                            {g.dueDate < today
                              ? 'Scaduto'
                              : g.dueDate === today
                                ? 'Scade oggi'
                                : `Entro il ${g.dueDate}`}
                          </p>
                        )}
                      </div>
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
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => {
                      setNewGoalFor(decision.id)
                      setPickDecisionId(decision.id)
                      setDraftTitle('')
                    }}
                  >
                    <Plus size={14} /> Aggiungi obiettivo a questa decisione
                  </button>
                  {newGoalFor === decision.id && (
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                      <input
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Scrivi l’obiettivo…"
                        style={{ flex: 1, minWidth: 140 }}
                        autoFocus
                      />
                      <button
                        className="btn accent small"
                        type="button"
                        disabled={!draftTitle.trim()}
                        onClick={() => addGoal(decision.id, draftTitle)}
                      >
                        Salva
                      </button>
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => setNewGoalFor(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })
      )}

    </div>
  )
}
