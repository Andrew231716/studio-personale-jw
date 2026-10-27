import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwSearch } from '../components/JwSearch'
import { useAppStore } from '../store/useAppStore'

export function ArgomentiView() {
  const topics = useAppStore((s) => s.topics)
  const addTopic = useAppStore((s) => s.addTopic)
  const removeTopic = useAppStore((s) => s.removeTopic)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const language = useAppStore((s) => s.settings.language)
  const [title, setTitle] = useState('')
  const [interest, setInterest] = useState('')

  function create() {
    if (!title.trim()) return
    addTopic(title, interest)
    setTitle('')
    setInterest('')
  }

  return (
    <div className="split">
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">Quaderno</p>
            <h2>I tuoi argomenti</h2>
            <p className="lede">
              Inserisci ciò che vuoi studiare e continuare ad approfondire
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
        <button className="btn" type="button" onClick={create}>
          Aggiungi e apri studio
        </button>

        <div className="list" style={{ marginTop: '1rem' }}>
          {topics.length === 0 && (
            <div className="empty">Nessun argomento ancora. Aggiungine uno o parti da un suggerimento jw.org.</div>
          )}
          {topics.map((t) => (
            <div
              key={t.id}
              className="list-item"
              role="button"
              tabIndex={0}
              onClick={() => setActiveTopic(t.id)}
              onKeyDown={(e) => e.key === 'Enter' && setActiveTopic(t.id)}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{t.title}</strong>
                <span className="badge">{statusLabel(t.status)}</span>
              </div>
              {t.interest && <p className="muted" style={{ margin: 0 }}>{t.interest}</p>}
              <div className="row">
                <select
                  value={t.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    updateTopic(t.id, {
                      status: e.target.value as typeof t.status,
                    })
                  }
                >
                  <option value="da_iniziare">Da iniziare</option>
                  <option value="in_corso">In corso</option>
                  <option value="approfondire">Da approfondire</option>
                  <option value="completato">Completato</option>
                </select>
                <button
                  className="btn danger"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTopic(t.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
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
            const id = addTopic(res.title, res.notes || 'Trovato su jw.org')
            const topic = useAppStore.getState().topics.find((t) => t.id === id)
            if (topic) {
              useAppStore.getState().updateTopic(id, {
                resources: [...topic.resources, res],
                status: 'in_corso',
              })
            }
          }}
        />
      </section>
    </div>
  )
}

function statusLabel(status: string) {
  switch (status) {
    case 'in_corso':
      return 'In corso'
    case 'approfondire':
      return 'Approfondire'
    case 'completato':
      return 'Completato'
    default:
      return 'Da iniziare'
  }
}
