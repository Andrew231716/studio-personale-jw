import { useEffect, useState } from 'react'
import {
  BookmarkPlus,
  Clapperboard,
  MessagesSquare,
  NotebookPen,
  Search,
  Trash2,
} from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import {
  MINISTRY_KIND_LABELS,
  MINISTRY_SUGGESTIONS,
  buildMinistryAssist,
  searchMinistryArticles,
} from '../lib/ministryAssist'
import {
  MINISTRY_VIDEO_CATEGORIES,
  fetchMediaCategory,
  type LatestMediaItem,
} from '../lib/jwApi'
import { useAppStore } from '../store/useAppStore'
import type { JwResult, MinistryAssistKind } from '../types'

export function MinisteroView() {
  const language = useAppStore((s) => s.settings.language)
  const notes = useAppStore((s) => s.ministryNotes)
  const pushNote = useAppStore((s) => s.pushMinistryNote)
  const removeNote = useAppStore((s) => s.removeMinistryNote)
  const saveResource = useAppStore((s) => s.saveResource)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)

  const [kind, setKind] = useState<MinistryAssistKind>('schema')
  const [topic, setTopic] = useState('Regno di Dio')
  const [busy, setBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<'aiuto' | 'articoli' | 'video'>('aiuto')
  const [videoCat, setVideoCat] = useState<string>(MINISTRY_VIDEO_CATEGORIES[0].key)
  const [videos, setVideos] = useState<LatestMediaItem[]>([])
  const [articles, setArticles] = useState<JwResult[]>([])

  const active = notes.find((n) => n.id === activeId) || notes[0] || null

  useEffect(() => {
    let cancelled = false
    setVideoBusy(true)
    fetchMediaCategory(videoCat, language, 36)
      .then((items) => {
        if (!cancelled) setVideos(items)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Video ministero non disponibili')
        }
      })
      .finally(() => {
        if (!cancelled) setVideoBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [videoCat, language])

  async function generate(t = topic, focus?: JwResult) {
    const text = (focus?.title || t).trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    try {
      const note = await buildMinistryAssist({
        kind,
        topic: focus ? topic.trim() || focus.title : text,
        language,
        focus,
      })
      pushNote(note)
      setActiveId(note.id)
      if (!focus) setTopic(text)
      setTab('aiuto')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossibile preparare l’aiuto ministeriale')
    } finally {
      setBusy(false)
    }
  }

  async function runArticleSearch(q = topic) {
    const text = q.trim()
    if (!text || searchBusy) return
    setSearchBusy(true)
    setError('')
    setTab('articoli')
    try {
      const rows = await searchMinistryArticles({ query: text, language })
      setArticles(rows)
      if (!rows.length) setError('Nessun articolo trovato su jw.org.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca articoli non riuscita')
    } finally {
      setSearchBusy(false)
    }
  }

  function saveAsStudy() {
    if (!active) return
    const id = addTopic(active.title, `Ministero · ${active.topic}`)
    updateTopic(id, {
      interest: active.content.slice(0, 800),
      resources: active.resources,
      status: 'da_iniziare',
    })
    setView('studio')
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Ministero</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Video della sezione ministero di jw.org, ricerca articoli e riassunti / schemi per
              conversazioni e presentazioni.
            </p>
          </div>
        </div>

        <div className="chip-row">
          {(
            [
              ['aiuto', 'Aiuto e schemi'],
              ['articoli', 'Cerca articoli'],
              ['video', 'Video ministero'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="min-topic">Tema o articolo</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input
              id="min-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Es. perché esiste la sofferenza, nome di Dio…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runArticleSearch()
              }}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={searchBusy}
              onClick={() => void runArticleSearch()}
            >
              <span className="row" style={{ gap: 6 }}>
                <Search size={16} />
                {searchBusy ? 'Cerco…' : 'Cerca articoli'}
              </span>
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => void generate()}>
              <span className="row" style={{ gap: 6 }}>
                <MessagesSquare size={16} />
                {busy ? 'Preparo…' : 'Prepara aiuto'}
              </span>
            </button>
          </div>
        </div>

        <div className="chip-row">
          {(Object.keys(MINISTRY_KIND_LABELS) as MinistryAssistKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${kind === k ? 'active' : ''}`}
              onClick={() => setKind(k)}
            >
              {MINISTRY_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="chip-row">
          {MINISTRY_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              onClick={() => {
                setTopic(s)
                void runArticleSearch(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {error && <p className="muted">{error}</p>}
      </section>

      {tab === 'video' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>
                <span className="row" style={{ gap: 8 }}>
                  <Clapperboard size={18} /> Video ministero (jw.org)
                </span>
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Categorie ufficiali «Adunanze e ministero».
              </p>
            </div>
          </div>
          <div className="chip-row">
            {MINISTRY_VIDEO_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                className={`chip ${videoCat === c.key ? 'active' : ''}`}
                onClick={() => setVideoCat(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          {videoBusy && <p className="muted">Carico i video…</p>}
          <div className="list">
            {videos.map((v) => (
              <div className="list-item" key={v.guid}>
                <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                  {v.image && (
                    <img
                      src={v.image}
                      alt=""
                      width={88}
                      height={50}
                      style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <strong>{v.title}</strong>
                    {v.description && (
                      <p className="muted" style={{ margin: '0.25rem 0' }}>
                        {v.description.slice(0, 160)}
                      </p>
                    )}
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      {v.duration && <span className="badge">{v.duration}</span>}
                      <JwOpenButtons url={v.url} lank={v.lank} language={language} compact />
                      <button
                        className="chip"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void generate(v.title, {
                            id: v.guid,
                            title: v.title,
                            snippet: v.description,
                            kind: 'video',
                            section: 'video',
                            url: v.url,
                            lank: v.lank,
                          })
                        }
                      >
                        Crea schema
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!videoBusy && videos.length === 0 && (
              <div className="empty">Nessun video in questa categoria.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'articoli' && (
        <section className="panel">
          <h3>Articoli e pubblicazioni jw.org</h3>
          <p className="muted">
            Scegli un articolo e genera riassunto, schema di conversazione o presentazione.
          </p>
          <div className="list">
            {articles.map((a) => (
              <div className="list-item" key={a.id + a.url}>
                <strong>{a.title}</strong>
                {(a.context || a.snippet) && (
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    {[a.context, a.snippet].filter(Boolean).join(' — ').slice(0, 180)}
                  </p>
                )}
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <JwOpenButtons
                    url={a.url}
                    lank={a.lank}
                    docid={a.docid}
                    language={language}
                    compact
                  />
                  <button
                    className="chip"
                    type="button"
                    onClick={() =>
                      saveResource(
                        {
                          id: a.id,
                          title: a.title,
                          url: a.url,
                          kind: a.kind,
                          notes: a.snippet,
                          lank: a.lank,
                          docid: a.docid,
                        },
                        topic,
                      )
                    }
                  >
                    <BookmarkPlus size={14} /> Salva
                  </button>
                  <button
                    className="chip"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setKind('riassunto')
                      void generate(a.title, a)
                    }}
                  >
                    Riassumi
                  </button>
                  <button
                    className="chip"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setKind('schema')
                      void generate(a.title, a)
                    }}
                  >
                    Schema conversazione
                  </button>
                  <button
                    className="chip"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setKind('presentazione')
                      void generate(a.title, a)
                    }}
                  >
                    Schema presentazione
                  </button>
                </div>
              </div>
            ))}
            {articles.length === 0 && (
              <div className="empty">Cerca un tema per vedere gli articoli di jw.org.</div>
            )}
          </div>
        </section>
      )}

      {tab === 'aiuto' && (
        <div className="split">
          <section className="panel">
            {active ? (
              <div className="stack">
                <div className="section-head">
                  <div>
                    <span className="badge">{MINISTRY_KIND_LABELS[active.kind]}</span>
                    <h3 style={{ margin: '0.4rem 0 0' }}>{active.title}</h3>
                    {active.sourceTitle && (
                      <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                        Da: {active.sourceTitle}
                      </p>
                    )}
                  </div>
                </div>
                <pre
                  className="bubble assistant"
                  style={{ maxWidth: '100%', whiteSpace: 'pre-wrap', margin: 0 }}
                >
                  {active.content}
                </pre>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn" type="button" onClick={saveAsStudy}>
                    <span className="row" style={{ gap: 6 }}>
                      <NotebookPen size={14} /> Salva nel Quaderno
                    </span>
                  </button>
                  {active.resources[0] && (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        for (const r of active.resources.slice(0, 5)) {
                          saveResource(r, active.topic)
                        }
                      }}
                    >
                      <span className="row" style={{ gap: 6 }}>
                        <BookmarkPlus size={14} /> Salva materiali
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty">
                Cerca un articolo, apri i video ministero oppure prepara un aiuto sul tema scelto.
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Materiale jw.org collegato</h3>
            <div className="list">
              {(active?.resources || []).map((r) => (
                <div className="list-item" key={r.id}>
                  <strong>{r.title}</strong>
                  {r.notes && (
                    <p className="muted" style={{ margin: 0 }}>
                      {r.notes.slice(0, 160)}
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
              {!active?.resources.length && (
                <div className="empty">I materiali della scheda attiva appariranno qui.</div>
              )}
            </div>

            <h3 style={{ marginTop: '1.25rem' }}>Schede salvate ({notes.length})</h3>
            <div className="list">
              {notes.length === 0 && <div className="empty">Nessuna scheda ancora.</div>}
              {notes.map((n) => (
                <div
                  className={`list-item ${active?.id === n.id ? 'active' : ''}`}
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveId(n.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveId(n.id)}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{n.title}</strong>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeNote(n.id)
                        if (activeId === n.id) setActiveId(null)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <span className="badge">{MINISTRY_KIND_LABELS[n.kind]}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
