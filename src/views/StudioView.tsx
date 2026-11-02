import { useEffect, useMemo, useState } from 'react'
import { Archive, BookMarked, FileText, PlayCircle, RotateCcw, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { ScriptureAssist } from '../components/ScriptureAssist'
import { SectionProgress } from '../components/SectionProgress'
import { StudyFlowGuide } from '../components/StudyFlowGuide'
import { createMessage } from '../lib/ai'
import { exportSummaryEpub, exportSummaryPdf } from '../lib/exportStudy'
import { uid } from '../lib/id'
import {
  activeTopics,
  archivedTopics,
  statusLabel,
  topicHasUpcomingSchedule,
} from '../lib/studyFlow'
import {
  buildStudyStructureFromMaterial,
  elaborateTopicStructure,
  mergeStudyStructureIntoTopic,
  resourceFingerprint,
} from '../lib/studyStructureAi'
import { buildTopicOnlySummary } from '../lib/studySummary'
import { useAppStore } from '../store/useAppStore'
import type { StudyResource, StudyTopic } from '../types'

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
  const removeTopic = useAppStore((s) => s.removeTopic)
  const sessionLogs = useAppStore((s) => s.sessionLogs)
  const schedules = useAppStore((s) => s.schedules)
  const [aiBusy, setAiBusy] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [exportBusy, setExportBusy] = useState<'pdf' | 'epub' | null>(null)

  const openList = useMemo(() => activeTopics(topics), [topics])
  const closedList = useMemo(() => archivedTopics(topics), [topics])
  const topic = useMemo(() => {
    const preferred = openList.find((t) => t.id === activeTopicId) || openList[0] || null
    return preferred
  }, [activeTopicId, openList])

  // Se l’attivo punta a un archiviato, passa al primo argomento aperto (o nessuno).
  useEffect(() => {
    if (!activeTopicId) return
    const current = topics.find((t) => t.id === activeTopicId)
    if (!current || current.status !== 'completato') return
    if (openList[0]) setActiveTopic(openList[0].id)
    else useAppStore.setState({ activeTopicId: null })
  }, [activeTopicId, topics, openList, setActiveTopic])

  const topicSessions = useMemo(
    () => (topic ? sessionLogs.filter((s) => s.topicId === topic.id) : []),
    [sessionLogs, topic],
  )
  const hasUpcoming = topicHasUpcomingSchedule(topic?.id, schedules)

  function deleteTopicById(target: StudyTopic) {
    if (
      !window.confirm(
        `Eliminare l’argomento «${target.title}»? Il Quaderno e i collegamenti andranno persi. Le sessioni nel Diario restano.`,
      )
    ) {
      return
    }
    const wasActive = topic?.id === target.id
    removeTopic(target.id)
    if (!wasActive) return
    const remainingOpen = activeTopics(useAppStore.getState().topics)
    if (remainingOpen[0]) setActiveTopic(remainingOpen[0].id)
    else useAppStore.setState({ activeTopicId: null })
  }

  function deleteEntireTopic() {
    if (!topic) return
    deleteTopicById(topic)
  }

  function completeAndArchive() {
    if (!topic) return
    const id = topic.id
    const next = openList.find((t) => t.id !== id) || null
    archiveTopic(id)
    if (next) setActiveTopic(next.id)
    else useAppStore.setState({ activeTopicId: null })
    setArchiveMsg('Argomento archiviato. Lo trovi sotto in Archiviati.')
    setEditingTitle(false)
  }

  async function helpElaborate(
    kind: 'obiettivi' | 'riflessione' | 'risposte' | 'pratiche' | 'tutto',
  ) {
    if (!topic) return
    setAiBusy(true)
    setArchiveMsg('')
    try {
      const structure = await elaborateTopicStructure(topic, kind)
      const patch = mergeStudyStructureIntoTopic(topic, structure)
      updateTopic(topic.id, { ...patch, status: 'in_corso' })
      pushAiMessage(
        createMessage(
          'assistant',
          `Ho aggiornato «${topic.title}» con punti ancorati al tuo materiale (${kind}), usando terminologia jw.org.`,
        ),
      )
      setArchiveMsg(
        kind === 'tutto'
          ? 'Struttura AI inserita: obiettivi, riflessioni, domande e pratiche basati sul tuo contenuto.'
          : 'Elaborazione AI inserita nel Quaderno, basata sul materiale e sulle note.',
      )
    } catch (e) {
      setArchiveMsg(e instanceof Error ? e.message : 'Assistente non disponibile')
    } finally {
      setAiBusy(false)
    }
  }

  async function addResourceAndStructure(res: StudyResource) {
    if (!topic) return
    const key = resourceFingerprint(res)
    if (topic.resources.some((r) => resourceFingerprint(r) === key)) {
      setArchiveMsg('Questo materiale è già nel Quaderno.')
      return
    }
    updateTopic(topic.id, {
      resources: [...topic.resources, res],
      status: 'in_corso',
    })
    setAiBusy(true)
    setArchiveMsg('Materiale aggiunto. Creo obiettivi e domande sul contenuto…')
    try {
      const structure = await buildStudyStructureFromMaterial({
        title: res.title,
        notes: [res.notes, topic.interest, topic.transcript?.slice(0, 1500)]
          .filter(Boolean)
          .join('\n\n'),
        kind: res.kind,
        extraContext: topic.transcript?.slice(0, 4000),
      })
      const latest = useAppStore.getState().topics.find((t) => t.id === topic.id) || topic
      updateTopic(topic.id, mergeStudyStructureIntoTopic(latest, structure))
      setArchiveMsg(
        `«${res.title}»: struttura AI creata sul contenuto del materiale (non generica).`,
      )
    } catch (e) {
      setArchiveMsg(
        e instanceof Error
          ? `Materiale aggiunto; struttura AI incompleta: ${e.message}`
          : 'Materiale aggiunto; struttura AI non disponibile.',
      )
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

  async function exportArchivedTopic(target: StudyTopic, kind: 'pdf' | 'epub') {
    setExportBusy(kind)
    setArchiveMsg('')
    try {
      const summary = buildTopicOnlySummary(target, sessionLogs)
      if (kind === 'pdf') await exportSummaryPdf(summary)
      else await exportSummaryEpub(summary)
      setArchiveMsg(kind === 'pdf' ? 'PDF dell’argomento scaricato.' : 'EPUB dell’argomento scaricato.')
    } catch (e) {
      setArchiveMsg(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setExportBusy(null)
    }
  }

  const archivedSection =
    closedList.length > 0 ? (
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">Archiviati</p>
            <h3 style={{ margin: 0 }}>Argomenti completati</h3>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Non occupano il Quaderno attivo: aprili solo se vuoi rivederli o riaprirli.
            </p>
          </div>
          <span className="badge">{closedList.length}</span>
        </div>
        <div className="stack" style={{ marginTop: '0.85rem', gap: '0.65rem' }}>
          {closedList.map((t) => {
            const sessions = sessionLogs.filter((s) => s.topicId === t.id).length
            const objectives = t.objectives.filter((o) => o.trim())
            const reflections = t.reflections.filter((r) => r.prompt.trim() || r.response.trim())
            const questions = t.questions.filter((q) => q.question.trim() || q.answer.trim())
            const practices = t.practices.filter((p) => p.action.trim())
            return (
              <details key={t.id} className="decision-fold archive-topic-fold">
                <summary className="decision-fold-summary">
                  <span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{t.title}</span>
                    <span className="badge">Archiviato</span>
                    {sessions > 0 && (
                      <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                        {sessions} sessioni
                      </span>
                    )}
                  </span>
                </summary>
                <div className="decision-fold-body archive-topic-body">
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
                    <button
                      className="btn accent small"
                      type="button"
                      onClick={() => {
                        reopenTopic(t.id)
                        setActiveTopic(t.id)
                        setArchiveMsg(`«${t.title}» riaperto nel Quaderno.`)
                      }}
                    >
                      <RotateCcw size={14} /> Riapri nel Quaderno
                    </button>
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void exportArchivedTopic(t, 'pdf')}
                    >
                      <FileText size={14} /> PDF
                    </button>
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={!!exportBusy}
                      onClick={() => void exportArchivedTopic(t, 'epub')}
                    >
                      <BookMarked size={14} /> EPUB
                    </button>
                    <button
                      className="btn danger small"
                      type="button"
                      onClick={() => deleteTopicById(t)}
                    >
                      <Trash2 size={14} /> Elimina
                    </button>
                  </div>
                  {t.interest.trim() && (
                    <div className="field">
                      <label>Note</label>
                      <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {t.interest}
                      </p>
                    </div>
                  )}
                  {objectives.length > 0 && (
                    <div className="field">
                      <label>Obiettivi</label>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {objectives.map((o, i) => (
                          <li key={`${t.id}-o-${i}`}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {reflections.length > 0 && (
                    <div className="field">
                      <label>Riflessioni</label>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {reflections.map((r) => (
                          <li key={r.id}>
                            <strong>{r.prompt || 'Riflessione'}</strong>
                            {r.response.trim() ? (
                              <p className="muted" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>
                                {r.response}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {questions.length > 0 && (
                    <div className="field">
                      <label>Domande</label>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {questions.map((q) => (
                          <li key={q.id}>
                            <strong>{q.question || 'Domanda'}</strong>
                            {q.answer.trim() ? (
                              <p className="muted" style={{ margin: '0.25rem 0 0', whiteSpace: 'pre-wrap' }}>
                                {q.answer}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {practices.length > 0 && (
                    <div className="field">
                      <label>Pratiche</label>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {practices.map((p) => (
                          <li key={p.id}>
                            {p.action}
                            {p.tried ? ' · provata' : ''}
                            {p.outcome.trim() ? ` — ${p.outcome}` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {t.resources.length > 0 && (
                    <div className="field">
                      <label>Materiale</label>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {t.resources.map((r) => (
                          <li key={r.id}>{r.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!t.interest.trim() &&
                    objectives.length === 0 &&
                    reflections.length === 0 &&
                    questions.length === 0 &&
                    practices.length === 0 &&
                    t.resources.length === 0 && (
                      <p className="muted" style={{ margin: 0 }}>
                        Nessun contenuto salvato in questo Quaderno.
                      </p>
                    )}
                </div>
              </details>
            )
          })}
        </div>
      </section>
    ) : null

  if (!topic) {
    return (
      <div className="stack">
        <StudyFlowGuide current="studio" />
        <SectionProgress section="studio" />
        <div className="panel empty">
          Nessuno studio attivo nel Quaderno.
          <div style={{ marginTop: '0.8rem' }}>
            <button className="btn" type="button" onClick={() => setView('argomenti')}>
              Vai agli argomenti
            </button>
          </div>
        </div>
        {archiveMsg && (
          <p className="muted" style={{ margin: 0 }}>
            {archiveMsg}
          </p>
        )}
        {archivedSection}
      </div>
    )
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
                <button
                  className="btn danger small"
                  type="button"
                  aria-label={`Elimina argomento ${topic.title}`}
                  onClick={deleteEntireTopic}
                >
                  <Trash2 size={14} /> Elimina tutto
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
            {openList.length > 1 && (
              <select
                value={topic.id}
                onChange={(e) => setActiveTopic(e.target.value)}
                aria-label="Argomento attivo"
              >
                {openList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
          <button className="btn accent" type="button" onClick={() => startSession(topic.id)}>
            <PlayCircle size={16} /> Sessione guidata
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={aiBusy}
            onClick={() => void helpElaborate('tutto')}
          >
            {aiBusy ? 'Elaboro…' : 'AI: struttura sul contenuto'}
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
          <button
            className="btn secondary"
            type="button"
            disabled={hasUpcoming}
            title={
              hasUpcoming
                ? 'Hai altri giorni programmati: togli gli eventi o lascialo attivo'
                : undefined
            }
            onClick={completeAndArchive}
          >
            <Archive size={16} /> Completa e archivia
          </button>
          <button className="btn danger" type="button" onClick={deleteEntireTopic}>
            <Trash2 size={16} /> Elimina tutto l’argomento
          </button>
        </div>
        {hasUpcoming && (
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
            placeholder="Studio personale — prova Proverbi 14:12 o Pr 14:12"
            onChange={(value) => updateTopic(topic.id, { interest: value })}
          />
        </div>

        <div style={{ marginTop: '0.65rem' }}>
          <ScriptureAssist
            text={[
              topic.interest,
              ...topic.reflections.map((r) => `${r.prompt}\n${r.response}`),
              ...topic.questions.map((q) => `${q.question}\n${q.answer}`),
            ].join('\n')}
            language={settings.language}
            onInsert={(snippet) =>
              updateTopic(topic.id, {
                interest: topic.interest.trim()
                  ? `${topic.interest.trim()}\n\n${snippet}`
                  : snippet,
              })
            }
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
          <div className="section-head">
            <h3>Obiettivi</h3>
            <button
              className="btn secondary"
              type="button"
              disabled={aiBusy}
              onClick={() => void helpElaborate('obiettivi')}
            >
              {aiBusy ? 'Elaboro…' : 'AI: obiettivi'}
            </button>
          </div>
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
                void addResourceAndStructure(res)
              }}
            />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h3>Punti di riflessione</h3>
          <button
            className="btn secondary"
            type="button"
            disabled={aiBusy}
            onClick={() => void helpElaborate('riflessione')}
          >
            {aiBusy ? 'Elaboro…' : 'AI: riflessioni'}
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
          <button
            className="btn secondary"
            type="button"
            disabled={aiBusy}
            onClick={() => void helpElaborate('risposte')}
          >
            {aiBusy ? 'Elaboro…' : 'AI: domande'}
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
          <button
            className="btn secondary"
            type="button"
            disabled={aiBusy}
            onClick={() => void helpElaborate('pratiche')}
          >
            {aiBusy ? 'Elaboro…' : 'AI: pratiche'}
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

      {archivedSection}
    </div>
  )
}
