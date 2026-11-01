import { useMemo, useState } from 'react'
import { Archive, BookMarked, FileText, PlayCircle, RotateCcw, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { SectionProgress } from '../components/SectionProgress'
import { StudyFlowGuide } from '../components/StudyFlowGuide'
import { askAi, buildStudyContext, createMessage } from '../lib/ai'
import { exportSummaryEpub, exportSummaryPdf } from '../lib/exportStudy'
import { uid } from '../lib/id'
import {
  activeTopics,
  statusLabel,
  topicHasUpcomingSchedule,
} from '../lib/studyFlow'
import { buildTopicOnlySummary } from '../lib/studySummary'
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
  const archiveTopic = useAppStore((s) => s.archiveTopic)
  const reopenTopic = useAppStore((s) => s.reopenTopic)
  const sessionLogs = useAppStore((s) => s.sessionLogs)
  const schedules = useAppStore((s) => s.schedules)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiHint, setAiHint] = useState('')
  const [aiHintKind, setAiHintKind] = useState<'riflessione' | 'risposte' | 'pratiche' | null>(
    null,
  )
  const [archiveMsg, setArchiveMsg] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [exportBusy, setExportBusy] = useState<'pdf' | 'epub' | null>(null)

  const openList = useMemo(() => activeTopics(topics), [topics])
  const topic = useMemo(() => {
    const preferred =
      topics.find((t) => t.id === activeTopicId) ||
      openList[0] ||
      topics[0] ||
      null
    return preferred
  }, [topics, activeTopicId, openList])

  const topicSessions = useMemo(
    () => (topic ? sessionLogs.filter((s) => s.topicId === topic.id) : []),
    [sessionLogs, topic],
  )
  const hasUpcoming = topicHasUpcomingSchedule(topic?.id, schedules)

  if (!topic) {
    return (
      <div className="stack">
        <StudyFlowGuide current="studio" />
        <SectionProgress section="studio" />
        <div className="panel empty">
          Nessuno studio attivo. Aggiungi un argomento per iniziare.
          <div style={{ marginTop: '0.8rem' }}>
            <button className="btn" type="button" onClick={() => setView('argomenti')}>
              Vai agli argomenti
            </button>
          </div>
        </div>
      </div>
    )
  }

  async function helpElaborate(kind: 'riflessione' | 'risposte' | 'pratiche') {
    setAiBusy(true)
    setAiHint('')
    setAiHintKind(kind)
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
      setAiHintKind(null)
    } finally {
      setAiBusy(false)
    }
  }

  async function exportTopic(kind: 'pdf' | 'epub') {
    if (!topic) return
    setExportBusy(kind)
    setArchiveMsg('')
    try {
      const summary = buildTopicOnlySummary(topic, sessionLogs)
      if (kind === 'pdf') await exportSummaryPdf(summary)
      else await exportSummaryEpub(summary)
      setArchiveMsg(kind === 'pdf' ? 'PDF dell’argomento scaricato.' : 'EPUB dell’argomento scaricato.')
    } catch (e) {
      setArchiveMsg(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setExportBusy(null)
    }
  }

  function applyAiHint() {
    if (!topic || !aiHint.trim() || !aiHintKind) return
    const text = aiHint.trim()
    if (aiHintKind === 'riflessione') {
      updateTopic(topic.id, {
        reflections: [
          {
            id: uid('ref'),
            prompt: 'Elaborazione AI',
            response: text,
          },
          ...topic.reflections,
        ],
      })
    } else if (aiHintKind === 'risposte') {
      updateTopic(topic.id, {
        questions: [
          {
            id: uid('q'),
            question: 'Elaborazione AI',
            answer: text,
          },
          ...topic.questions,
        ],
      })
    } else {
      const lines = text
        .split(/\n+/)
        .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter((l) => l.length > 8)
        .slice(0, 6)
      const actions = lines.length ? lines : [text.slice(0, 280)]
      updateTopic(topic.id, {
        practices: [
          ...actions.map((action) => ({
            id: uid('prac'),
            action,
            tried: false,
            outcome: '',
          })),
          ...topic.practices,
        ],
      })
    }
    setAiHint('')
    setAiHintKind(null)
    setArchiveMsg('Suggerimento inserito nel Quaderno.')
  }

  return (
    <div className="stack">
      <StudyFlowGuide current="studio" />
      <SectionProgress section="studio" />
      <section className="panel">
        <div className="section-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="section-kicker">3 · Quaderno</p>
            {editingTitle ? (
              <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  aria-label="Titolo argomento"
                  style={{ flex: 1, minWidth: 160 }}
                  autoFocus
                />
                <button
                  className="btn accent small"
                  type="button"
                  disabled={!titleDraft.trim()}
                  onClick={() => {
                    updateTopic(topic.id, { title: titleDraft.trim() })
                    setEditingTitle(false)
                  }}
                >
                  Salva
                </button>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={() => setEditingTitle(false)}
                >
                  Annulla
                </button>
              </div>
            ) : (
              <div className="row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>{topic.title}</h2>
                <button
                  className="btn secondary small"
                  type="button"
                  onClick={() => {
                    setTitleDraft(topic.title)
                    setEditingTitle(true)
                  }}
                >
                  Rinomina
                </button>
              </div>
            )}
            <p className="lede">
              Qui restano appunti, riflessioni e materiali. Le sessioni guidate alimentano questo
              quaderno; le sessioni finite le rivedi nel Diario.
            </p>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="badge">{statusLabel(topic.status)}</span>
            <select
              value={topic.id}
              onChange={(e) => setActiveTopic(e.target.value)}
            >
              {openList.length > 0 && (
                <optgroup label="Attivi">
                  {openList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </optgroup>
              )}
              {topics.some((t) => t.status === 'completato') && (
                <optgroup label="Archiviati">
                  {topics
                    .filter((t) => t.status === 'completato')
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
          <button className="btn accent" type="button" onClick={() => startSession(topic.id)}>
            <PlayCircle size={16} /> Sessione guidata
          </button>
          <button className="btn secondary" type="button" onClick={() => setView('diario')}>
            <BookMarked size={16} /> Diario
            {topicSessions.length > 0 ? ` (${topicSessions.length})` : ''}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!!exportBusy}
            onClick={() => void exportTopic('pdf')}
          >
            <FileText size={16} /> {exportBusy === 'pdf' ? 'PDF…' : 'Esporta PDF'}
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={!!exportBusy}
            onClick={() => void exportTopic('epub')}
          >
            <BookMarked size={16} /> {exportBusy === 'epub' ? 'EPUB…' : 'Esporta EPUB'}
          </button>
          {topic.status === 'completato' ? (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                reopenTopic(topic.id)
                setArchiveMsg('Argomento riaperto: puoi continuare a studiarlo.')
              }}
            >
              <RotateCcw size={16} /> Riapri argomento
            </button>
          ) : (
            <button
              className="btn secondary"
              type="button"
              disabled={hasUpcoming}
              title={
                hasUpcoming
                  ? 'Hai altri giorni programmati: togli gli eventi o lascialo attivo'
                  : undefined
              }
              onClick={() => {
                archiveTopic(topic.id)
                setArchiveMsg(
                  'Argomento archiviato. Lo trovi in Argomenti → Archiviati. Puoi riaprirlo quando vuoi.',
                )
              }}
            >
              <Archive size={16} /> Completa e archivia
            </button>
          )}
        </div>
        {hasUpcoming && topic.status !== 'completato' && (
          <p className="muted" style={{ margin: '0.45rem 0 0' }}>
            Hai altri studi programmati per questo argomento: resta attivo finché non li
            concludi o li rimuovi.
          </p>
        )}
        {archiveMsg && (
          <p className="muted" style={{ margin: '0.45rem 0 0' }}>
            {archiveMsg}
          </p>
        )}

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
              <div key={`obj-${idx}`} className="stack">
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    className="btn secondary small"
                    type="button"
                    aria-label={`Elimina obiettivo ${idx + 1}`}
                    onClick={() =>
                      updateTopic(topic.id, {
                        objectives: topic.objectives.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    Elimina obiettivo
                  </button>
                </div>
                <ExpandableField
                  label={`Obiettivo ${idx + 1}`}
                  value={obj}
                  placeholder="Scrivi l’obiettivo…"
                  onChange={(value) => {
                    const objectives = [...topic.objectives]
                    objectives[idx] = value
                    updateTopic(topic.id, { objectives })
                  }}
                />
              </div>
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
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{r.title}</strong>
                  <button
                    className="btn ghost small"
                    type="button"
                    aria-label={`Rimuovi ${r.title}`}
                    style={{ color: 'inherit', padding: '0.35rem' }}
                    onClick={() =>
                      updateTopic(topic.id, {
                        resources: topic.resources.filter((x) => x.id !== r.id),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {r.notes && (
                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {r.notes}
                  </p>
                )}
                <JwOpenButtons
                  url={r.url}
                  wolUrl={r.wolUrl}
                  lank={r.lank}
                  docid={r.docid}
                  bible={r.bible}
                  pub={r.pub}
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
              onAddResource={(res) => {
                const key = `${res.url}|${res.lank || ''}|${res.docid || ''}`
                const exists = topic.resources.some(
                  (r) => `${r.url}|${r.lank || ''}|${r.docid || ''}` === key,
                )
                if (exists) {
                  setArchiveMsg('Questo materiale è già nel Quaderno.')
                  return
                }
                updateTopic(topic.id, {
                  resources: [...topic.resources, res],
                  status: 'in_corso',
                })
              }}
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
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="btn secondary small"
                  type="button"
                  aria-label={`Elimina riflessione ${idx + 1}`}
                  onClick={() =>
                    updateTopic(topic.id, {
                      reflections: topic.reflections.filter((x) => x.id !== r.id),
                    })
                  }
                >
                  Elimina riflessione
                </button>
              </div>
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
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button
                  className="btn secondary small"
                  type="button"
                  aria-label={`Elimina domanda ${idx + 1}`}
                  onClick={() =>
                    updateTopic(topic.id, {
                      questions: topic.questions.filter((x) => x.id !== q.id),
                    })
                  }
                >
                  Elimina domanda
                </button>
              </div>
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
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
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
                <button
                  className="btn secondary small"
                  type="button"
                  aria-label={`Elimina pratica ${idx + 1}`}
                  onClick={() =>
                    updateTopic(topic.id, {
                      practices: topic.practices.filter((x) => x.id !== p.id),
                    })
                  }
                >
                  Elimina pratica
                </button>
              </div>
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
          <div className="section-head">
            <h3>Suggerimento dell’assistente</h3>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {aiHintKind && (
                <button className="btn accent small" type="button" onClick={applyAiHint}>
                  Inserisci nel Quaderno
                </button>
              )}
              <button
                className="btn secondary small"
                type="button"
                onClick={() => {
                  setAiHint('')
                  setAiHintKind(null)
                }}
              >
                Chiudi
              </button>
            </div>
          </div>
          <pre className="bubble assistant" style={{ maxWidth: '100%', whiteSpace: 'pre-wrap', margin: 0 }}>
            {aiHint}
          </pre>
        </section>
      )}
    </div>
  )
}
