import { useMemo, useState } from 'react'
import { BookmarkPlus, NotebookPen, Trash2 } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { JwSearch } from '../components/JwSearch'
import { useAppStore } from '../store/useAppStore'
import type { ContentKind, SavedResource } from '../types'

function kindLabel(kind: ContentKind) {
  switch (kind) {
    case 'video':
      return 'Video'
    case 'audio':
      return 'Audio'
    case 'article':
      return 'Articolo'
    case 'book':
      return 'Libro'
    case 'brochure':
      return 'Opuscolo'
    case 'bible':
      return 'Bibbia'
    case 'index':
      return 'Indice'
    default:
      return 'jw.org'
  }
}

export function SalvatiView() {
  const language = useAppStore((s) => s.settings.language)
  const topics = useAppStore((s) => s.topics)
  const savedResources = useAppStore((s) => s.savedResources)
  const savedSearches = useAppStore((s) => s.savedSearches)
  const removeSavedResource = useAppStore((s) => s.removeSavedResource)
  const removeSavedSearch = useAppStore((s) => s.removeSavedSearch)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)

  const [selected, setSelected] = useState<string[]>([])
  const [targetTopicId, setTargetTopicId] = useState('')
  const [newTopicTitle, setNewTopicTitle] = useState('')
  const [seedQuery, setSeedQuery] = useState<string | undefined>()
  const [seedNonce, setSeedNonce] = useState(0)
  const [hint, setHint] = useState('')

  const selectedItems = useMemo(
    () => savedResources.filter((r) => selected.includes(r.id)),
    [savedResources, selected],
  )

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function attachToTopic(topicId: string, items: SavedResource[]) {
    if (!topicId || !items.length) return
    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return
    const existingKeys = new Set(
      topic.resources.map((r) => `${r.url}|${r.lank || ''}|${r.docid || ''}`),
    )
    const toAdd = items
      .filter((r) => !existingKeys.has(`${r.url}|${r.lank || ''}|${r.docid || ''}`))
      .map(({ savedAt: _s, sourceQuery: _q, ...rest }) => rest)
    updateTopic(topicId, { resources: [...topic.resources, ...toAdd] })
    setActiveTopic(topicId)
    setHint(`Aggiunti ${toAdd.length} materiali allo studio “${topic.title}”.`)
    setSelected([])
  }

  function createStudyFromSelected() {
    const items = selectedItems
    if (!items.length) return
    const title =
      newTopicTitle.trim() ||
      (items.length === 1 ? items[0].title : `Studio da ${items.length} materiali salvati`)
    const id = addTopic(title, items.map((i) => i.title).join('; '))
    updateTopic(id, {
      resources: items.map(({ savedAt: _s, sourceQuery: _q, ...rest }) => rest),
      status: 'da_iniziare',
    })
    setSelected([])
    setNewTopicTitle('')
    setView('studio')
  }

  return (
    <div className="split">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Da studiare</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Salva articoli, video e ricerche per uno studio successivo. Poi crei un argomento o li
              aggiungi a uno già aperto.
            </p>
          </div>
        </div>

        <JwSearch
          language={language}
          enableSaveForLater
          seedQuery={seedQuery}
          seedNonce={seedNonce}
          onPickQuery={() => setHint('')}
        />
        {hint && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            {hint}
          </p>
        )}
      </section>

      <section className="panel">
        <h3>Materiale salvato ({savedResources.length})</h3>
        <div className="list">
          {savedResources.length === 0 && (
            <div className="empty">
              Nessun articolo o video salvato. Usa “Salva per dopo” nei risultati di ricerca.
            </div>
          )}
          {savedResources.map((r) => (
            <div className="list-item" key={r.id}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggle(r.id)}
                    style={{ marginTop: 4 }}
                  />
                  <span>
                    <strong>{r.title}</strong>
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {kindLabel(r.kind)}
                    </span>
                  </span>
                </label>
                <button
                  className="btn secondary"
                  type="button"
                  aria-label="Rimuovi"
                  onClick={() => removeSavedResource(r.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {r.notes && (
                <p className="muted" style={{ margin: 0 }}>
                  {r.notes}
                </p>
              )}
              {r.sourceQuery && (
                <p className="muted result-context" style={{ margin: 0 }}>
                  Da ricerca: «{r.sourceQuery}»
                </p>
              )}
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

        {selected.length > 0 && (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <p className="muted" style={{ margin: 0 }}>
              {selected.length} selezionati
            </p>
            <div className="field">
              <label>Nuovo studio da selezione</label>
              <div className="row">
                <input
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  placeholder="Titolo dello studio"
                  style={{ flex: 1, minWidth: 160 }}
                />
                <button className="btn" type="button" onClick={createStudyFromSelected}>
                  <span className="row" style={{ gap: 6 }}>
                    <NotebookPen size={14} /> Crea studio
                  </span>
                </button>
              </div>
            </div>
            {topics.length > 0 && (
              <div className="field">
                <label>Oppure aggiungi a uno studio esistente</label>
                <div className="row">
                  <select
                    value={targetTopicId}
                    onChange={(e) => setTargetTopicId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Scegli argomento…</option>
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={!targetTopicId}
                    onClick={() => {
                      attachToTopic(targetTopicId, selectedItems)
                      setView('studio')
                    }}
                  >
                    <span className="row" style={{ gap: 6 }}>
                      <BookmarkPlus size={14} /> Aggiungi
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <h3 style={{ marginTop: '1.4rem' }}>Ricerche salvate ({savedSearches.length})</h3>
        <div className="list">
          {savedSearches.length === 0 && (
            <div className="empty">Nessuna ricerca salvata.</div>
          )}
          {savedSearches.map((s) => (
            <div className="list-item" key={s.id}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>«{s.query}»</strong>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => removeSavedSearch(s.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {s.note && (
                <p className="muted" style={{ margin: 0 }}>
                  {s.note}
                </p>
              )}
              <p className="muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                {new Date(s.createdAt).toLocaleString('it-IT', {
                  timeZone: 'Europe/Rome',
                })}{' '}
                (Europe/Rome)
                {typeof s.resultCount === 'number' ? ` · ${s.resultCount} risultati` : ''}
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSeedQuery(s.query)
                  setSeedNonce((n) => n + 1)
                  setHint(`Rilancio la ricerca «${s.query}» a sinistra.`)
                }}
              >
                Usa di nuovo
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
