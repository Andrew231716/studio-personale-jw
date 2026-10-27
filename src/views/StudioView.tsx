import { useMemo, useState } from 'react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { askAi, buildStudyContext, createMessage } from '../lib/ai'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'

export function StudioView() {
  const topics = useAppStore((s) => s.topics)
  const activeTopicId = useAppStore((s) => s.activeTopicId)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const settings = useAppStore((s) => s.settings)
  const pushAiMessage = useAppStore((s) => s.pushAiMessage)
  const setView = useAppStore((s) => s.setView)
  const startSession = useAppStore((s) => s.startSession)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiHint, setAiHint] = useState('')

  const topic = useMemo(
    () => topics.find((t) => t.id === activeTopicId) || topics[0] || null,
    [topics, activeTopicId],
  )

  if (!topic) {
    return (
      <div className="panel empty">
        Nessuno studio attivo. Aggiungi un argomento per iniziare.
        <div style={{ marginTop: '0.8rem' }}>
          <button className="btn" type="button" onClick={() => setView('argomenti')}>
            Vai agli argomenti
          </button>
        </div>
      </div>
    )
  }

  async function helpElaborate(kind: 'riflessione' | 'risposte' | 'pratiche') {
    setAiBusy(true)
    setAiHint('')
    const prompt =
      kind === 'riflessione'
        ? 'Aiutami a elaborare i miei punti di riflessione in modo più profondo e pratico, restando fedele ai materiali di jw.org.'
        : kind === 'risposte'
          ? 'Aiutami a elaborare le mie risposte alle domande di studio con chiarezza e applicazione personale.'
          : 'Suggerisci azioni pratiche concrete da provare questa settimana, basate sul metodo di studio di jw.org.'
    const context = buildStudyContext(topic)
    try {
      const answer = await askAi({ prompt, context })
      setAiHint(answer)
      pushAiMessage(createMessage('user', prompt))
      pushAiMessage(createMessage('assistant', answer))
    } catch (e) {
      setAiHint(e instanceof Error ? e.message : 'Assistente non disponibile')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Quaderno: {topic.title}</h2>
          </div>
          <div className="row">
            <button className="btn accent" type="button" onClick={() => startSession(topic.id)}>
              Sessione guidata
            </button>
            <select
              value={topic.id}
              onChange={(e) => setActiveTopic(e.target.value)}
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: '0.85rem' }}>
          <ExpandableField
            label="Perché mi interessa / note"
            value={topic.interest}
            placeholder="Studio personale"
            onChange={(value) => updateTopic(topic.id, { interest: value })}
          />
        </div>

        {topic.transcript && (
          <div style={{ marginTop: '0.35rem' }}>
            <ExpandableField
              label={
                topic.transcriptMeta?.videoTitle
                  ? `Trascrizione video · ${topic.transcriptMeta.videoTitle}`
                  : 'Trascrizione video'
              }
              value={topic.transcript}
              readOnly
            />
          </div>
        )}

        {settings.features.schedule && topic.schedule && (
          <div className="grid-2">
            <div className="field">
              <label>Giorni previsti</label>
              <input
                value={topic.schedule.days.join(', ')}
                onChange={(e) =>
                  updateTopic(topic.id, {
                    schedule: {
                      ...topic.schedule!,
                      days: e.target.value.split(',').map((d) => d.trim()).filter(Boolean),
                    },
                  })
                }
                placeholder="lun, mer, ven"
              />
            </div>
            <div className="field">
              <label>Minuti per sessione</label>
              <input
                type="number"
                min={5}
                max={180}
                value={topic.schedule.minutesPerSession}
                onChange={(e) =>
                  updateTopic(topic.id, {
                    schedule: {
                      ...topic.schedule!,
                      minutesPerSession: Number(e.target.value) || 25,
                    },
                  })
                }
              />
            </div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h3>Obiettivi</h3>
          <div className="stack">
            {topic.objectives.map((obj, idx) => (
              <ExpandableField
                key={`obj-${idx}`}
                label={`Obiettivo ${idx + 1}`}
                value={obj}
                placeholder="Scrivi l’obiettivo…"
                onChange={(value) => {
                  const objectives = [...topic.objectives]
                  objectives[idx] = value
                  updateTopic(topic.id, { objectives })
                }}
              />
            ))}
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                updateTopic(topic.id, {
                  objectives: [...topic.objectives, ''],
                })
              }
            >
              Aggiungi obiettivo
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h3>Materiale jw.org</h3>
          </div>
          <div className="list">
            {topic.resources.map((r) => (
              <div className="list-item" key={r.id}>
                <strong>{r.title}</strong>
                <JwOpenButtons
                  url={r.url}
                  lank={r.lank}
                  docid={r.docid}
                  language={settings.language}
                  compact
                />
              </div>
            ))}
            {topic.resources.length === 0 && (
              <div className="empty">Aggiungi articoli o video dalla ricerca.</div>
            )}
          </div>
          <div style={{ marginTop: '0.8rem' }}>
            <JwSearch
              compact
              language={settings.language}
              onAddResource={(res) =>
                updateTopic(topic.id, {
                  resources: [...topic.resources, res],
                  status: 'in_corso',
                })
              }
            />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h3>Punti di riflessione</h3>
          <button className="btn secondary" type="button" disabled={aiBusy} onClick={() => helpElaborate('riflessione')}>
            {aiBusy ? 'Elaboro…' : 'AI: elabora riflessioni'}
          </button>
        </div>
        <div className="stack">
          {topic.reflections.map((r, idx) => (
            <div key={r.id} className="stack">
              <ExpandableField
                label={`Riflessione ${idx + 1} — domanda`}
                value={r.prompt}
                placeholder="Domanda di riflessione…"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    reflections: topic.reflections.map((x) =>
                      x.id === r.id ? { ...x, prompt: value } : x,
                    ),
                  })
                }
              />
              <ExpandableField
                label={`Riflessione ${idx + 1} — i tuoi pensieri`}
                value={r.response}
                placeholder="Scrivi i tuoi pensieri…"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    reflections: topic.reflections.map((x) =>
                      x.id === r.id ? { ...x, response: value } : x,
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
              updateTopic(topic.id, {
                reflections: [
                  ...topic.reflections,
                  { id: uid('ref'), prompt: 'Nuovo punto di riflessione', response: '' },
                ],
              })
            }
          >
            Aggiungi riflessione
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h3>Domande</h3>
          <button className="btn secondary" type="button" disabled={aiBusy} onClick={() => helpElaborate('risposte')}>
            {aiBusy ? 'Elaboro…' : 'AI: elabora risposte'}
          </button>
        </div>
        <div className="stack">
          {topic.questions.map((q, idx) => (
            <div key={q.id} className="stack">
              <ExpandableField
                label={`Domanda ${idx + 1}`}
                value={q.question}
                placeholder="Scrivi la domanda…"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    questions: topic.questions.map((x) =>
                      x.id === q.id ? { ...x, question: value } : x,
                    ),
                  })
                }
              />
              <ExpandableField
                label={`Risposta ${idx + 1}`}
                value={q.answer}
                placeholder="La tua risposta…"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    questions: topic.questions.map((x) =>
                      x.id === q.id ? { ...x, answer: value } : x,
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
              updateTopic(topic.id, {
                questions: [
                  ...topic.questions,
                  { id: uid('q'), question: '', answer: '' },
                ],
              })
            }
          >
            Aggiungi domanda
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h3>Cose pratiche da provare</h3>
          <button className="btn secondary" type="button" disabled={aiBusy} onClick={() => helpElaborate('pratiche')}>
            {aiBusy ? 'Elaboro…' : 'AI: suggerisci pratiche'}
          </button>
        </div>
        <div className="stack">
          {topic.practices.map((p, idx) => (
            <div className="list-item" key={p.id}>
              <label className="row">
                <input
                  type="checkbox"
                  checked={p.tried}
                  onChange={(e) =>
                    updateTopic(topic.id, {
                      practices: topic.practices.map((x) =>
                        x.id === p.id ? { ...x, tried: e.target.checked } : x,
                      ),
                    })
                  }
                />
                <span className="muted">Provata</span>
              </label>
              <ExpandableField
                label={`Pratica ${idx + 1}`}
                value={p.action}
                placeholder="Cosa vuoi provare…"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    practices: topic.practices.map((x) =>
                      x.id === p.id ? { ...x, action: value } : x,
                    ),
                  })
                }
              />
              <ExpandableField
                label={`Esito pratica ${idx + 1}`}
                value={p.outcome}
                placeholder="Esito / cosa ho notato"
                onChange={(value) =>
                  updateTopic(topic.id, {
                    practices: topic.practices.map((x) =>
                      x.id === p.id ? { ...x, outcome: value } : x,
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
              updateTopic(topic.id, {
                practices: [
                  ...topic.practices,
                  { id: uid('prac'), action: '', tried: false, outcome: '' },
                ],
              })
            }
          >
            Aggiungi pratica
          </button>
        </div>
      </section>

      {aiHint && (
        <section className="panel">
          <h3>Suggerimento dell’assistente</h3>
          <pre className="bubble assistant" style={{ maxWidth: '100%', whiteSpace: 'pre-wrap', margin: 0 }}>
            {aiHint}
          </pre>
        </section>
      )}
    </div>
  )
}
