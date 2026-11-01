import { useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { ExpandableField } from './ExpandableField'
import { extractGoalsFromPlan, goalsFromTitles, mergeGoals } from '../lib/decisionGoals'
import { normalizeJwItalian } from '../lib/jwItalianTerms'
import { uid } from '../lib/id'
import type { DecisionGoal, DecisionItem } from '../types'

interface Props {
  decision: DecisionItem
  onChange: (goals: DecisionGoal[]) => void
  /** Se true, stile più evidenziato (decisione chiusa). */
  highlighted?: boolean
}

function dueClass(dueDate?: string, done?: boolean): string {
  if (!dueDate || done) return ''
  const today = new Date().toISOString().slice(0, 10)
  if (dueDate < today) return 'goal-due-overdue'
  if (dueDate === today) return 'goal-due-today'
  return ''
}

export function DecisionGoalsPanel({ decision, onChange, highlighted }: Props) {
  const goals = decision.goals || []
  const [draft, setDraft] = useState('')
  const [draftDue, setDraftDue] = useState('')
  const doneCount = goals.filter((g) => g.done).length

  function addGoal(title: string) {
    const text = normalizeJwItalian(title.trim())
    if (!text) return
    onChange([
      ...goals,
      {
        id: uid('goal'),
        title: text,
        done: false,
        notes: '',
        dueDate: draftDue || undefined,
        createdAt: new Date().toISOString(),
      },
    ])
    setDraft('')
    setDraftDue('')
  }

  function importFromPlan() {
    const titles = extractGoalsFromPlan(decision.nextStepsPlan || '')
    if (!titles.length) return
    onChange(mergeGoals(goals, goalsFromTitles(titles)))
  }

  return (
    <section
      className={`panel ${highlighted ? 'decision-final-panel' : ''}`}
      id="decision-goals"
    >
      <div className="section-head">
        <div>
          <p className="section-kicker">Obiettivi</p>
          <h3>Obiettivi dopo la decisione</h3>
          <p className="lede">
            Lista pratica da spuntare: aggiungi, modifica, elimina e segna il progresso.
            {goals.length > 0 ? ` ${doneCount}/${goals.length} fatti.` : ''}
          </p>
        </div>
        {(decision.nextStepsPlan || '').trim() && (
          <button className="btn secondary" type="button" onClick={importFromPlan}>
            Importa dal piano
          </button>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="empty">Nessun obiettivo ancora. Aggiungine uno o importali dal piano.</div>
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
                      onChange(
                        goals.map((x) =>
                          x.id === g.id ? { ...x, done: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <span className={g.done ? 'goal-done-label' : undefined}>
                    {g.done ? (
                      <>
                        <CheckCircle2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
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
                  onClick={() => onChange(goals.filter((x) => x.id !== g.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <ExpandableField
                label={`Obiettivo ${idx + 1}`}
                value={g.title}
                onChange={(value) =>
                  onChange(
                    goals.map((x) =>
                      x.id === g.id ? { ...x, title: normalizeJwItalian(value) } : x,
                    ),
                  )
                }
                rows={2}
              />
              <div className="field">
                <label htmlFor={`goal-due-${g.id}`}>Scadenza</label>
                <input
                  id={`goal-due-${g.id}`}
                  type="date"
                  value={g.dueDate || ''}
                  onChange={(e) =>
                    onChange(
                      goals.map((x) =>
                        x.id === g.id
                          ? { ...x, dueDate: e.target.value || undefined }
                          : x,
                      ),
                    )
                  }
                />
                {g.dueDate && !g.done && (
                  <p className={`muted ${dueClass(g.dueDate, g.done)}`} style={{ margin: '0.35rem 0 0' }}>
                    {g.dueDate < new Date().toISOString().slice(0, 10)
                      ? 'Scaduto'
                      : g.dueDate === new Date().toISOString().slice(0, 10)
                        ? 'Scade oggi'
                        : `Entro il ${g.dueDate}`}
                  </p>
                )}
              </div>
              <ExpandableField
                label={`Note obiettivo ${idx + 1}`}
                value={g.notes || ''}
                placeholder="Appunti / progresso…"
                onChange={(value) =>
                  onChange(
                    goals.map((x) => (x.id === g.id ? { ...x, notes: value } : x)),
                  )
                }
                rows={2}
              />
            </div>
          ))}
        </div>
      )}

      <div className="stack" style={{ marginTop: '0.85rem' }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nuovo obiettivo…"
            onKeyDown={(e) => e.key === 'Enter' && addGoal(draft)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <input
            type="date"
            value={draftDue}
            onChange={(e) => setDraftDue(e.target.value)}
            aria-label="Scadenza nuovo obiettivo"
            title="Scadenza"
          />
          <button
            className="btn"
            type="button"
            disabled={!draft.trim()}
            onClick={() => addGoal(draft)}
          >
            <Plus size={16} /> Aggiungi
          </button>
        </div>
      </div>
    </section>
  )
}
