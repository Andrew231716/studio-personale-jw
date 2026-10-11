import { useMemo, useState } from 'react'
import { JwSearch } from '../components/JwSearch'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { askAi, buildDecisionContext, createMessage } from '../lib/ai'
import { DECISION_STEPS } from '../lib/studyMethod'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'

export function DecisioniView() {
  const decisions = useAppStore((s) => s.decisions)
  const activeDecisionId = useAppStore((s) => s.activeDecisionId)
  const addDecision = useAppStore((s) => s.addDecision)
  const updateDecision = useAppStore((s) => s.updateDecision)
  const removeDecision = useAppStore((s) => s.removeDecision)
  const setActiveDecision = useAppStore((s) => s.setActiveDecision)
  const recompute = useAppStore((s) => s.recomputeDecisionConclusion)
  const language = useAppStore((s) => s.settings.language)
  const pushAiMessage = useAppStore((s) => s.pushAiMessage)
  const [title, setTitle] = useState('')
  const [scale, setScale] = useState<'piccola' | 'grande'>('piccola')
  const [aiText, setAiText] = useState('')
  const [busy, setBusy] = useState(false)

  const decision = useMemo(
    () => decisions.find((d) => d.id === activeDecisionId) || decisions[0] || null,
    [decisions, activeDecisionId],
  )

  async function askDecisionAi() {
    if (!decision) return
    setBusy(true)
    const prompt =
      'Elabora i miei pensieri su questa decisione. Proponi una lettura dei pro/contro e delle priorità, e una conclusione prudente basata solo sui dati che ho inserito e sui principi tipici insegnati su jw.org. Non inventare articoli specifici.'
    const context = buildDecisionContext(decision)
    try {
      const answer = await askAi({ prompt, context })
      setAiText(answer)
      pushAiMessage(createMessage('user', prompt))
      pushAiMessage(createMessage('assistant', answer))
    } catch (e) {
      setAiText(e instanceof Error ? e.message : 'Errore AI')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="split">
      <div className="stack">
        <section className="panel">
          <h2>Decisioni</h2>
          <p className="muted">Piccole e grandi scelte: priorità, pro/contro e conclusione dai tuoi dati</p>
          <div className="field">
            <label>Nuova decisione</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Es. Accettare un nuovo impegno" />
          </div>
          <div className="field">
            <label>Scala</label>
            <select value={scale} onChange={(e) => setScale(e.target.value as typeof scale)}>
              <option value="piccola">Piccola</option>
              <option value="grande">Grande</option>
            </select>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => {
              if (!title.trim()) return
              addDecision(title, scale)
              setTitle('')
            }}
          >
            Crea
          </button>
          <div className="list" style={{ marginTop: '1rem' }}>
            {decisions.map((d) => (
              <div
                key={d.id}
                className={`list-item ${decision?.id === d.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveDecision(d.id)}
                onKeyDown={(e) => e.key === 'Enter' && setActiveDecision(d.id)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{d.title}</strong>
                  <span className="badge">{d.scale} · {d.status}</span>
                </div>
              </div>
            ))}
            {decisions.length === 0 && <div className="empty">Nessuna decisione ancora.</div>}
          </div>
        </section>

        <section className="panel">
          <h3>Metodo basato su jw.org</h3>
          <div className="steps">
            {DECISION_STEPS.map((s, i) => (
              <div className="step" key={s.id}>
                <div className="step-num">{i + 1}</div>
                <div>
                  <strong>{s.title}</strong>
                  <p className="muted" style={{ margin: '0.2rem 0 0' }}>{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="stack">
        {!decision ? (
          <div className="panel empty">Seleziona o crea una decisione.</div>
        ) : (
          <>
            <section className="panel">
              <div className="section-head">
                <h2>{decision.title}</h2>
                <button className="btn danger" type="button" onClick={() => removeDecision(decision.id)}>
                  Elimina
                </button>
              </div>
              <div className="field">
                <label>Contesto</label>
                <textarea
                  value={decision.context}
                  onChange={(e) => updateDecision(decision.id, { context: e.target.value })}
                  placeholder="Cosa sto decidendo e perché ora?"
                />
              </div>
              <div className="field">
                <label>Appunti di preghiera</label>
                <textarea
                  value={decision.prayerNotes}
                  onChange={(e) => updateDecision(decision.id, { prayerNotes: e.target.value })}
                />
              </div>
              <div className="row">
                <select
                  value={decision.scale}
                  onChange={(e) =>
                    updateDecision(decision.id, { scale: e.target.value as typeof decision.scale })
                  }
                >
                  <option value="piccola">Piccola</option>
                  <option value="grande">Grande</option>
                </select>
                <select
                  value={decision.status}
                  onChange={(e) =>
                    updateDecision(decision.id, { status: e.target.value as typeof decision.status })
                  }
                >
                  <option value="aperta">Aperta</option>
                  <option value="in_valutazione">In valutazione</option>
                  <option value="decisa">Decisa</option>
                </select>
              </div>
            </section>

            <section className="panel">
              <h3>Priorità</h3>
              <div className="stack">
                {decision.priorities.map((p) => (
                  <div className="list-item" key={p.id}>
                    <input
                      value={p.label}
                      onChange={(e) =>
                        updateDecision(decision.id, {
                          priorities: decision.priorities.map((x) =>
                            x.id === p.id ? { ...x, label: e.target.value } : x,
                          ),
                        })
                      }
                    />
                    <div className="slider-row">
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={p.weight}
                        onChange={(e) =>
                          updateDecision(decision.id, {
                            priorities: decision.priorities.map((x) =>
                              x.id === p.id ? { ...x, weight: Number(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                      <strong>{p.weight}/10</strong>
                    </div>
                    <textarea
                      value={p.note}
                      placeholder="Nota"
                      onChange={(e) =>
                        updateDecision(decision.id, {
                          priorities: decision.priorities.map((x) =>
                            x.id === p.id ? { ...x, note: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() =>
                    updateDecision(decision.id, {
                      priorities: [
                        ...decision.priorities,
                        { id: uid('pri'), label: 'Nuova priorità', weight: 5, note: '' },
                      ],
                    })
                  }
                >
                  Aggiungi priorità
                </button>
              </div>
            </section>

            <div className="grid-2">
              <section className="panel">
                <h3>Pro</h3>
                {decision.pros.map((pro, idx) => (
                  <div className="field" key={`pro-${idx}`}>
                    <input
                      value={pro}
                      onChange={(e) => {
                        const pros = [...decision.pros]
                        pros[idx] = e.target.value
                        updateDecision(decision.id, { pros })
                      }}
                    />
                  </div>
                ))}
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => updateDecision(decision.id, { pros: [...decision.pros, ''] })}
                >
                  Aggiungi pro
                </button>
              </section>
              <section className="panel">
                <h3>Contro</h3>
                {decision.cons.map((con, idx) => (
                  <div className="field" key={`con-${idx}`}>
                    <input
                      value={con}
                      onChange={(e) => {
                        const cons = [...decision.cons]
                        cons[idx] = e.target.value
                        updateDecision(decision.id, { cons })
                      }}
                    />
                  </div>
                ))}
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => updateDecision(decision.id, { cons: [...decision.cons, ''] })}
                >
                  Aggiungi contro
                </button>
              </section>
            </div>

            <section className="panel">
              <h3>Cerca principi su jw.org</h3>
              <JwSearch
                compact
                language={language}
                onAddResource={(res) =>
                  updateDecision(decision.id, {
                    relatedResources: [...decision.relatedResources, res],
                  })
                }
              />
              <div className="list" style={{ marginTop: '0.8rem' }}>
                {decision.relatedResources.map((r) => (
                  <div className="list-item" key={r.id}>
                    <strong>{r.title}</strong>
                    <JwOpenButtons
                      url={r.url}
                      lank={r.lank}
                      docid={r.docid}
                      language={language}
                      compact
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="section-head">
                <h3>Conclusione dai dati</h3>
                <div className="row">
                  <button className="btn" type="button" onClick={() => recompute(decision.id)}>
                    Genera conclusione
                  </button>
                  <button className="btn secondary" type="button" disabled={busy} onClick={askDecisionAi}>
                    {busy ? 'AI in corso…' : 'AI: elabora decisione'}
                  </button>
                </div>
              </div>
              <textarea
                value={decision.conclusion}
                onChange={(e) => updateDecision(decision.id, { conclusion: e.target.value })}
                style={{ minHeight: 180 }}
              />
              {aiText && (
                <pre className="bubble assistant" style={{ maxWidth: '100%', marginTop: '0.8rem' }}>
                  {aiText}
                </pre>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
