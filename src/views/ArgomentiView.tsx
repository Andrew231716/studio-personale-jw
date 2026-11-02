import { useMemo, useState } from 'react'
import { Archive, NotebookPen, PlayCircle, Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { SectionProgress } from '../components/SectionProgress'
import { StudyFlowGuide } from '../components/StudyFlowGuide'
import {
  activeTopics,
  archivedTopics,
  statusLabel,
} from '../lib/studyFlow'
import {
  buildStudyStructureFromMaterial,
  mergeStudyStructureIntoTopic,
} from '../lib/studyStructureAi'
import { useAppStore } from '../store/useAppStore'

export function ArgomentiView() {
  const topics = useAppStore((s) => s.topics)
  const createTopic = useAppStore((s) => s.createTopic)
  const removeTopic = useAppStore((s) => s.removeTopic)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const startSession = useAppStore((s) => s.startSession)
  const archiveTopic = useAppStore((s) => s.archiveTopic)
  const reopenTopic = useAppStore((s) => s.reopenTopic)
  const language = useAppStore((s) => s.settings.language)
  const [title, setTitle] = useState('')
  const [interest, setInterest] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [structureMsg, setStructureMsg] = useState('')

  function confirmRemove(id: string, name: string) {
    if (
      window.confirm(
        `Eliminare l’argomento «${name}»? Quaderno e collegamenti andranno persi. Le sessioni nel Diario restano.`,
      )
    ) {
      removeTopic(id)
    }
  }

  const openTopics = useMemo(() => activeTopics(topics), [topics])
  const closedTopics = useMemo(() => archivedTopics(topics), [topics])

  function create(open: 'sessione' | 'quaderno') {
    if (!title.trim()) return
    const id = createTopic(title, interest)
    setTitle('')
    setInterest('')
    if (open === 'sessione') startSession(id)
    else setActiveTopic(id)
  }

  return (
    <div className="stack">
      <StudyFlowGuide current="argomenti" />
      <SectionProgress section="argomenti" />
      <div className="split">
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">1 · Argomenti</p>
              <h2>Cosa vuoi studiare</h2>
              <p className="lede">
                Qui crei l’argomento. Poi lo studi in Sessione, lo annoti nel Quaderno e le
                sessioni finite restano nel Diario. Quando hai finito, archivialo.
              </p>
            </div>
          </div>

          <div className="field">
            <label htmlFor="topic-title">Nuovo argomento</label>
            <input
              id="topic-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Rafforzare la preghiera"
            />
          </div>
          <ExpandableField
            label="Perché ti interessa"
            value={interest}
            onChange={setInterest}
            placeholder="Cosa vorresti capire o migliorare?"
          />
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              className="btn accent"
              type="button"
              disabled={!title.trim()}
              onClick={() => create('sessione')}
            >
              <PlayCircle size={16} /> Crea e inizia sessione
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={!title.trim()}
              onClick={() => create('quaderno')}
            >
              <NotebookPen size={16} /> Crea e apri Quaderno
            </button>
          </div>

          <div className="list" style={{ marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem' }}>Attivi</h3>
            {openTopics.length === 0 && (
              <div className="empty">
                Nessun argomento attivo. Creane uno qui o da un suggerimento jw.org.
              </div>
            )}
            {openTopics.map((t) => (
              <div className="list-item" key={t.id}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                  {renameId === t.id ? (
                    <div className="row" style={{ flex: 1, flexWrap: 'wrap', gap: 8 }}>
                      <input
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        aria-label="Nuovo titolo"
                        style={{ flex: 1, minWidth: 140 }}
                        autoFocus
                      />
                      <button
                        className="btn accent small"
                        type="button"
                        disabled={!renameDraft.trim()}
                        onClick={() => {
                          updateTopic(t.id, { title: renameDraft.trim() })
                          setRenameId(null)
                        }}
                      >
                        Salva
                      </button>
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => setRenameId(null)}
                      >
                        Annulla
                      </button>
                    </div>
                  ) : (
                    <strong>{t.title}</strong>
                  )}
                  <span className="badge">{statusLabel(t.status)}</span>
                </div>
                {t.interest && (
                  <p className="muted" style={{ margin: 0 }}>
                    {t.interest}
                  </p>
                )}
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <select
                    value={t.status}
                    onChange={(e) =>
                      updateTopic(t.id, {
                        status: e.target.value as typeof t.status,
                      })
                    }
                  >
                    <option value="da_iniziare">Da iniziare</option>
                    <option value="in_corso">In corso</option>
                    <option value="approfondire">Da approfondire</option>
                    <option value="completato">Archiviato</option>
                  </select>
                  <button
                    className="btn accent small"
                    type="button"
                    onClick={() => startSession(t.id)}
                  >
                    <PlayCircle size={14} /> Sessione
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => setActiveTopic(t.id)}
                  >
                    <NotebookPen size={14} /> Quaderno
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => {
                      setRenameId(t.id)
                      setRenameDraft(t.title)
                    }}
                  >
                    Rinomina
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={() => archiveTopic(t.id)}
                  >
                    <Archive size={14} /> Archivia
                  </button>
                  <button
                    className="btn danger small"
                    type="button"
                    onClick={() => confirmRemove(t.id, t.title)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {closedTopics.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <button
                className="btn ghost"
                type="button"
                style={{ color: 'inherit', paddingLeft: 0 }}
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? 'Nascondi' : 'Mostra'} archiviati ({closedTopics.length})
              </button>
              {showArchived && (
                <div className="list" style={{ marginTop: '0.5rem' }}>
                  {closedTopics.map((t) => (
                    <div className="list-item" key={t.id}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <strong>{t.title}</strong>
                        <span className="badge">Archiviato</span>
                      </div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                        <button
                          className="btn secondary small"
                          type="button"
                          onClick={() => {
                            reopenTopic(t.id)
                            setActiveTopic(t.id)
                          }}
                        >
                          Riapri nel Quaderno
                        </button>
                        <button
                          className="btn danger small"
                          type="button"
                          onClick={() => confirmRemove(t.id, t.title)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-head">
            <div>
              <p className="section-kicker">jw.org</p>
              <h2>Suggerimenti</h2>
              <p className="lede">
                Cerca articoli e video, poi crea un argomento dal titolo che ti colpisce
              </p>
            </div>
          </div>
          <JwSearch
            language={language}
            onPickQuery={(q) => {
              if (!title) setTitle(q)
            }}
            onAddResource={(res) => {
              const id = createTopic(res.title, res.notes || 'Trovato su jw.org')
              const topic = useAppStore.getState().topics.find((t) => t.id === id)
              if (topic) {
                useAppStore.getState().updateTopic(id, {
                  resources: [...topic.resources, res],
                  status: 'in_corso',
                })
              }
              setActiveTopic(id)
              setStructureMsg('Argomento creato. Creo obiettivi, riflessioni, domande e pratiche…')
              void (async () => {
                try {
                  const structure = await buildStudyStructureFromMaterial({
                    title: res.title,
                    notes: res.notes,
                    kind: res.kind,
                  })
                  const latest = useAppStore.getState().topics.find((t) => t.id === id)
                  if (!latest) return
                  const patch = mergeStudyStructureIntoTopic(latest, structure)
                  updateTopic(id, patch)
                  setStructureMsg(
                    `«${res.title}»: struttura AI inserita nel Quaderno.`,
                  )
                } catch (e) {
                  setStructureMsg(
                    e instanceof Error
                      ? `Argomento creato; struttura AI non completata: ${e.message}`
                      : 'Argomento creato; struttura AI non disponibile.',
                  )
                }
              })()
            }}
          />
          {structureMsg && (
            <p className="muted" style={{ margin: '0.65rem 0 0' }}>
              {structureMsg}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
