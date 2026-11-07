import { useEffect, useState } from 'react'
import {
  BookmarkPlus,
  Check,
  Clapperboard,
  Link2,
  MessagesSquare,
  NotebookPen,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { NarrateButton } from '../components/NarrateButton'
import { SectionProgress } from '../components/SectionProgress'
import {
  MINISTRY_CORE_SOURCES,
  MINISTRY_KIND_HELP,
  MINISTRY_KIND_LABELS,
  MINISTRY_KIND_ORDER,
  MINISTRY_SUGGESTIONS,
  buildMinistryAssist,
  ministryDisplayTitle,
  resolveMinistryLink,
  searchMinistryArticles,
} from '../lib/ministryAssist'
import {
  MINISTRY_VIDEO_CATEGORIES,
  fetchMediaCategory,
  type LatestMediaItem,
} from '../lib/jwApi'
import { useAppStore } from '../store/useAppStore'
import type { JwResult, MinistryAssistKind } from '../types'

type Tab = 'aiuto' | 'articoli' | 'video'

export function MinisteroView() {
  const language = useAppStore((s) => s.settings.language)
  const notes = useAppStore((s) => s.ministryNotes)
  const pushNote = useAppStore((s) => s.pushMinistryNote)
  const updateNote = useAppStore((s) => s.updateMinistryNote)
  const removeNote = useAppStore((s) => s.removeMinistryNote)
  const saveResource = useAppStore((s) => s.saveResource)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const addDiscourseNote = useAppStore((s) => s.addDiscourseNote)
  const setView = useAppStore((s) => s.setView)

  const [kind, setKind] = useState<MinistryAssistKind>('presentazione')
  const [topic, setTopic] = useState('')
  const [linkPaste, setLinkPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [tab, setTab] = useState<Tab>('aiuto')
  const [videoCat, setVideoCat] = useState<string>(MINISTRY_VIDEO_CATEGORIES[0].key)
  const [videos, setVideos] = useState<LatestMediaItem[]>([])
  const [articles, setArticles] = useState<JwResult[]>([])

  const active = notes.find((n) => n.id === activeId) || notes[0] || null

  useEffect(() => {
    setEditing(false)
  }, [active?.id])

  useEffect(() => {
    if (tab !== 'video') return
    let cancelled = false
    setVideoBusy(true)
    setError('')
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
  }, [videoCat, language, tab])

  async function generate(t = topic, focus?: JwResult, forceKind?: MinistryAssistKind) {
    const text = (focus?.title || t).trim()
    if (!text || busy || linkBusy) return
    const useKind = forceKind || kind
    setBusy(true)
    setError('')
    setHint('')
    setTab('aiuto')
    try {
      const note = await buildMinistryAssist({
        kind: useKind,
        topic: focus ? topic.trim() || focus.title : text,
        language,
        focus,
      })
      pushNote(note)
      setActiveId(note.id)
      if (!focus) setTopic(text)
      if (focus) {
        setHint(
          `Creato da «${focus.title}» · ${MINISTRY_KIND_LABELS[useKind] || useKind}.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossibile preparare l’aiuto per il ministero')
    } finally {
      setBusy(false)
    }
  }

  async function createFromLink() {
    const raw = linkPaste.trim()
    if (!raw || busy || linkBusy) return
    setLinkBusy(true)
    setBusy(true)
    setError('')
    setHint('')
    setTab('aiuto')
    try {
      const focus = await resolveMinistryLink(raw, language)
      const useTopic = ministryDisplayTitle(topic, focus.title)
      setTopic(useTopic)
      // Mantieni il link incollato; mostra URL canonico se più chiaro
      if (focus.url && !/finder\?/i.test(raw)) setLinkPaste(focus.url)
      else if (focus.url) setLinkPaste(raw)
      const note = await buildMinistryAssist({
        kind,
        topic: useTopic,
        language,
        focus,
      })
      pushNote(note)
      setActiveId(note.id)
      setHint(`Creato da «${focus.title}» · ${MINISTRY_KIND_LABELS[kind] || kind}.`)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Impossibile usare questo link. Controlla che sia un video o un articolo jw.org.',
      )
    } finally {
      setLinkBusy(false)
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

  function startEdit() {
    if (!active) return
    setEditTitle(active.title)
    setEditContent(active.content)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditTitle('')
    setEditContent('')
  }

  function saveEdit() {
    if (!active) return
    updateNote(active.id, {
      title: editTitle.trim() || active.title,
      content: editContent,
    })
    setEditing(false)
  }

  function goTab(next: Tab) {
    setError('')
    setHint('')
    setEditing(false)
    setTab(next)
  }

  return (
    <div className="stack">
      <SectionProgress section="ministero" />
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Ministero</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Preparazione e analisi sulle <strong>fonti ufficiali</strong> del ministero; la ricerca
              materiale esplora invece <strong>tutto jw.org</strong>.
            </p>
          </div>
        </div>

        <details className="decision-fold archive-topic-fold" style={{ marginBottom: '0.85rem' }}>
          <summary className="decision-fold-summary">
            Fonti per analisi e preparazione ({MINISTRY_CORE_SOURCES.length})
          </summary>
          <div className="decision-fold-body archive-topic-body">
            <p className="muted" style={{ margin: '0 0 0.5rem' }}>
              Usate solo quando prepari o analizzi una scheda. Per trovare materiale apri la scheda
              «Articoli» e cerca su tutto il sito.
            </p>
            <ul className="muted" style={{ margin: 0, paddingLeft: '1.15rem' }}>
              {MINISTRY_CORE_SOURCES.map((s) => (
                <li key={s.id} style={{ margin: '0.35rem 0' }}>
                  <strong style={{ color: 'var(--primary)' }}>{s.title}</strong>
                  {s.pub ? ` · pub=${s.pub}` : ''} — {s.useFor}
                </li>
              ))}
            </ul>
          </div>
        </details>

        <div className="seg-tabs" role="tablist" aria-label="Sezioni ministero">
          {(
            [
              ['aiuto', 'Scheda'],
              ['articoli', 'Articoli'],
              ['video', 'Video'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`chip ${tab === id ? 'active' : ''}`}
              onClick={() => goTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {(tab === 'aiuto' || Boolean(linkPaste.trim())) && (
          <div className="field" style={{ marginBottom: '0.85rem' }}>
            <label htmlFor="min-kind">Cosa vuoi preparare?</label>
            <select id="min-kind" value={kind} onChange={(event) => setKind(event.target.value as MinistryAssistKind)}>
              {MINISTRY_KIND_ORDER.map((item) => (
                <option key={item} value={item}>
                  {item === 'presentazione' ? 'Una conversazione' : MINISTRY_KIND_LABELS[item]}
                </option>
              ))}
            </select>
            <p className="muted">{MINISTRY_KIND_HELP[kind]}</p>
          </div>
        )}

        <div className="field">
          <label htmlFor="min-topic">
            {tab === 'articoli'
              ? 'Cerca materiale su tutto jw.org'
              : 'Di quale tema vuoi parlare?'}
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input
              id="min-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Es. Regno di Dio, sofferenza, nome di Dio…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (tab === 'articoli') void runArticleSearch()
                  else if (tab === 'aiuto') void generate()
                }
              }}
              style={{ flex: 1, minWidth: 160 }}
            />
            {tab === 'articoli' ? (
              <button
                className="btn"
                type="button"
                disabled={searchBusy || !topic.trim()}
                onClick={() => void runArticleSearch()}
              >
                <Search size={16} />
                {searchBusy ? 'Cerco…' : 'Cerca'}
              </button>
            ) : tab === 'aiuto' ? (
              <button
                className="btn"
                type="button"
                disabled={busy || linkBusy || !topic.trim()}
                onClick={() => void generate()}
              >
                <MessagesSquare size={16} />
                {busy ? 'Preparo…' : kind === 'presentazione' ? 'Prepara una conversazione' : 'Prepara la scheda'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="field" style={{ marginBottom: tab === 'aiuto' ? '0.85rem' : 0 }}>
          <label htmlFor="min-link">Oppure link jw.org (video / articolo)</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input
              id="min-link"
              value={linkPaste}
              onChange={(e) => setLinkPaste(e.target.value)}
              placeholder="Incolla URL jw.org oppure codice lank del video…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void createFromLink()
                }
              }}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={linkBusy || busy || !linkPaste.trim()}
              onClick={() => void createFromLink()}
            >
              <Link2 size={16} />
              {linkBusy || busy ? 'Creo…' : `Da link: ${MINISTRY_KIND_LABELS[kind]}`}
            </button>
          </div>
        </div>

        {tab === 'aiuto' && (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Temi rapidi</label>
            <div className="chip-row">
              {MINISTRY_SUGGESTIONS.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  disabled={busy || linkBusy}
                  onClick={() => {
                    setTopic(s)
                    void generate(s)
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {hint && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>
            {hint}
          </p>
        )}
        {error && (
          <p className="error-text" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        )}
      </section>

      {tab === 'aiuto' && (
        <div className="stack">
          <section className="panel">
            {busy && (
              <p className="muted">
                Preparo la scheda «{MINISTRY_KIND_LABELS[kind]}» con le fonti ufficiali del
                ministero…
              </p>
            )}
            {!busy && active ? (
              <div className="stack ministry-sheet">
                <div
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <span className="badge">
                    {MINISTRY_KIND_LABELS[active.kind] || active.kind}
                  </span>
                  <div className="row" style={{ gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                    {!editing && active.content.trim() ? (
                      <NarrateButton text={active.content} compact />
                    ) : null}
                    {!editing ? (
                      <button
                        type="button"
                        className="btn secondary small"
                        onClick={startEdit}
                        aria-label="Modifica scheda"
                      >
                        <Pencil size={14} /> Modifica
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn small"
                          onClick={saveEdit}
                          aria-label="Salva modifiche"
                        >
                          <Check size={14} /> Salva
                        </button>
                        <button
                          type="button"
                          className="btn secondary small"
                          onClick={cancelEdit}
                          aria-label="Annulla modifiche"
                        >
                          <X size={14} /> Annulla
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!editing ? (
                  <h3
                    className="ministry-sheet-title"
                    style={{
                      margin: 0,
                      width: '100%',
                      maxWidth: '100%',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      lineHeight: 1.25,
                    }}
                  >
                    {ministryDisplayTitle(active.title, active.topic || 'Scheda')}
                  </h3>
                ) : (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="min-edit-title">Titolo</label>
                    <input
                      id="min-edit-title"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                )}

                <p
                  className="muted"
                  style={{ margin: 0, fontSize: '0.88rem', maxWidth: '100%' }}
                >
                  {MINISTRY_KIND_HELP[active.kind] || 'Scheda pronta da usare nella predicazione.'}
                </p>
                {active.sourceTitle && (
                  <p
                    className="muted"
                    style={{
                      margin: 0,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      maxWidth: '100%',
                    }}
                  >
                    Da: {ministryDisplayTitle(active.sourceTitle)}
                  </p>
                )}

                {!editing ? (
                  <div className="ministry-sheet-body">
                    {active.content.trim() || '—'}
                  </div>
                ) : (
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor="min-edit-content">Testo scheda</label>
                    <textarea
                      id="min-edit-content"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={Math.max(12, editContent.split('\n').length + 2)}
                      style={{ minHeight: '14rem', whiteSpace: 'pre-wrap' }}
                    />
                  </div>
                )}

                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn" type="button" onClick={saveAsStudy} disabled={editing}>
                    <NotebookPen size={14} /> Salva nel Quaderno
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={editing}
                    onClick={() => {
                      addDiscourseNote(
                        ministryDisplayTitle(active.title, active.topic || 'Discorso'),
                        {
                          body: active.content,
                          sourceMinistryNoteId: active.id,
                        },
                      )
                      setView('discorso')
                    }}
                  >
                    Apri in Discorso
                  </button>
                  {active.resources[0] && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={editing}
                      onClick={() => {
                        for (const r of active.resources.slice(0, 5)) {
                          saveResource(r, active.topic)
                        }
                      }}
                    >
                      <BookmarkPlus size={14} /> Salva materiali
                    </button>
                  )}
                </div>

                <details className="decision-fold archive-topic-fold">
                  <summary className="decision-fold-summary">
                    Materiale jw.org ({active.resources.length})
                  </summary>
                  <div className="decision-fold-body archive-topic-body">
                    <div className="list">
                      {(active.resources || []).map((r) => (
                        <div className="list-item" key={r.id}>
                          <strong style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                            {ministryDisplayTitle(r.title)}
                          </strong>
                          {r.notes && (
                            <p className="muted" style={{ margin: '0.25rem 0' }}>
                              {r.notes.slice(0, 140)}
                            </p>
                          )}
                          <JwOpenButtons
                            url={r.url}
                            wolUrl={r.wolUrl}
                            lank={r.lank}
                            docid={r.docid}
                            bible={r.bible}
                            pub={r.pub}
                            language={language}
                            compact
                          />
                        </div>
                      ))}
                      {!active.resources.length && (
                        <div className="empty">Nessun materiale collegato a questa scheda.</div>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            ) : (
              !busy && (
                <div className="empty">
                  Scegli cosa ti serve, scrivi un tema e tocca{' '}
                  <strong>Prepara: {MINISTRY_KIND_LABELS[kind]}</strong>.
                </div>
              )
            )}
          </section>

          <details className="decision-fold archive-topic-fold panel" style={{ padding: '0.85rem 1rem' }}>
            <summary className="decision-fold-summary">
              Schede salvate ({notes.length})
            </summary>
            <div className="decision-fold-body" style={{ marginTop: '0.75rem' }}>
              <div className="list">
                {notes.length === 0 && <div className="empty">Nessuna scheda ancora.</div>}
                {notes.map((n) => {
                  const cardTitle = ministryDisplayTitle(
                    n.title,
                    ministryDisplayTitle(n.sourceTitle, ministryDisplayTitle(n.topic, 'Scheda')),
                  )
                  return (
                    <div
                      className={`list-item ${active?.id === n.id ? 'active' : ''}`}
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setActiveId(n.id)}
                      onKeyDown={(e) => e.key === 'Enter' && setActiveId(n.id)}
                    >
                      <div
                        className="row"
                        style={{
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'nowrap',
                          gap: 8,
                        }}
                      >
                        <strong
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            lineHeight: 1.35,
                          }}
                        >
                          {cardTitle}
                        </strong>
                        <button
                          className="btn secondary small"
                          type="button"
                          style={{ flexShrink: 0 }}
                          aria-label="Elimina scheda"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeNote(n.id)
                            if (activeId === n.id) setActiveId(null)
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <span className="badge">{MINISTRY_KIND_LABELS[n.kind] || n.kind}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </details>
        </div>
      )}

      {tab === 'articoli' && (
        <section className="panel">
          <h3>Ricerca materiale (tutto jw.org)</h3>
          <p className="muted">
            Cerca in pubblicazioni, video, indici e Bibbia su tutto il sito. Poi, se vuoi, prepara
            una scheda «{MINISTRY_KIND_LABELS[kind]}» (l’analisi userà le fonti ufficiali del
            ministero).
          </p>
          {searchBusy && <p className="muted">Cerco su tutto jw.org…</p>}
          <div className="list">
            {articles.map((a) => (
              <div className="list-item" key={a.id + a.url}>
                <strong>{a.title}</strong>
                {(a.context || a.snippet) && (
                  <p className="muted" style={{ margin: '0.25rem 0' }}>
                    {[a.context, a.snippet].filter(Boolean).join(' — ').slice(0, 160)}
                  </p>
                )}
                <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <JwOpenButtons
                    url={a.url}
                    wolUrl={a.wolUrl}
                    lank={a.lank}
                    docid={a.docid}
                    language={language}
                    compact
                  />
                  <button
                    className="btn small"
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(a.title, a, kind)}
                  >
                    Prepara: {MINISTRY_KIND_LABELS[kind]}
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(a.title, a, 'riassunto')}
                  >
                    Solo riassunto
                  </button>
                </div>
              </div>
            ))}
            {!searchBusy && articles.length === 0 && (
              <div className="empty">
                Scrivi un tema sopra e tocca <strong>Cerca</strong>.
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'video' && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>
                <span className="row" style={{ gap: 8 }}>
                  <Clapperboard size={18} /> Video ministero
                </span>
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Dalla sezione «Adunanze e ministero» di jw.org.
              </p>
            </div>
          </div>
          <div className="chip-row" style={{ marginBottom: '0.75rem' }}>
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
                        {v.description.slice(0, 140)}
                      </p>
                    )}
                    <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      {v.duration && <span className="badge">{v.duration}</span>}
                      <JwOpenButtons url={v.url} lank={v.lank} language={language} compact />
                      <button
                        className="btn small"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void generate(
                            v.title,
                            {
                              id: v.guid,
                              title: v.title,
                              snippet: v.description,
                              kind: 'video',
                              section: 'video',
                              url: v.url,
                              lank: v.lank,
                            },
                            kind,
                          )
                        }
                      >
                        Prepara: {MINISTRY_KIND_LABELS[kind]}
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
    </div>
  )
}
