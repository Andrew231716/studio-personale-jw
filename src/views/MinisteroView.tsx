import { useEffect, useState } from 'react'
import {
  BookmarkPlus,
  Clapperboard,
  Link2,
  MessagesSquare,
  NotebookPen,
  Search,
  Trash2,
} from 'lucide-react'
import { ExpandableField } from '../components/ExpandableField'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { SectionProgress } from '../components/SectionProgress'
import {
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

  const [kind, setKind] = useState<MinistryAssistKind>('schema')
  const [topic, setTopic] = useState('')
  const [linkPaste, setLinkPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [videoBusy, setVideoBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('aiuto')
  const [videoCat, setVideoCat] = useState<string>(MINISTRY_VIDEO_CATEGORIES[0].key)
  const [videos, setVideos] = useState<LatestMediaItem[]>([])
  const [articles, setArticles] = useState<JwResult[]>([])

  const active = notes.find((n) => n.id === activeId) || notes[0] || null

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

  function goTab(next: Tab) {
    setError('')
    setHint('')
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
              Ti prepara una <strong>scheda pronta da usare</strong> (testo da leggere o dire).
              Non apre app e non registra visite: la usi tu.
            </p>
          </div>
        </div>

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
            <label>1. Cosa ti serve?</label>
            <div className="list" style={{ gap: '0.55rem' }}>
              {MINISTRY_KIND_ORDER.map((k) => {
                const selected = kind === k
                return (
                  <button
                    key={k}
                    type="button"
                    className={`list-item ${selected ? 'active' : ''}`}
                    onClick={() => setKind(k)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      width: '100%',
                      border: selected
                        ? '1px solid color-mix(in srgb, var(--accent) 65%, var(--line))'
                        : undefined,
                    }}
                  >
                    <strong>{MINISTRY_KIND_LABELS[k]}</strong>
                    <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.88rem' }}>
                      {MINISTRY_KIND_HELP[k]}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="min-topic">
            {tab === 'articoli' ? 'Cerca articoli su' : '2. Tema (o lascia vuoto se usi un link)'}
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
                {busy ? 'Preparo…' : `Prepara: ${MINISTRY_KIND_LABELS[kind]}`}
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
        <div className="split split-main-first">
          <section className="panel">
            {busy && (
              <p className="muted">
                Preparo la scheda «{MINISTRY_KIND_LABELS[kind]}» con materiale jw.org…
              </p>
            )}
            {!busy && active ? (
              <div className="stack">
                <div className="section-head">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span className="badge">
                      {MINISTRY_KIND_LABELS[active.kind] || active.kind}
                    </span>
                    <h3
                      style={{
                        margin: '0.4rem 0 0',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      {ministryDisplayTitle(active.title, active.topic || 'Scheda')}
                    </h3>
                    <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.88rem' }}>
                      {MINISTRY_KIND_HELP[active.kind] ||
                        'Scheda modificabile: leggila, ritoccala e usala.'}
                    </p>
                    {active.sourceTitle && (
                      <p
                        className="muted"
                        style={{
                          margin: '0.35rem 0 0',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                        }}
                      >
                        Da: {ministryDisplayTitle(active.sourceTitle)}
                      </p>
                    )}
                  </div>
                </div>
                <ExpandableField
                  label="Titolo scheda"
                  value={active.title}
                  onChange={(value) => updateNote(active.id, { title: value })}
                  rows={2}
                />
                <ExpandableField
                  label="Testo pronto da usare (modificabile)"
                  value={active.content}
                  onChange={(value) => updateNote(active.id, { content: value })}
                  rows={16}
                  narrate
                />
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Usa così: leggilo ad alta voce, ritocca le frasi «Tu dici», poi se vuoi
                  salvalo o aprilo in Discorso.
                </p>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn" type="button" onClick={saveAsStudy}>
                    <NotebookPen size={14} /> Salva nel Quaderno
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
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

          <section className="panel">
            <h3>Articoli / video usati</h3>
            <div className="list">
              {(active?.resources || []).map((r) => (
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
              {!active?.resources.length && (
                <div className="empty">Qui vedrai gli articoli e i video usati per lo schema.</div>
              )}
            </div>

            <h3 style={{ marginTop: '1.25rem' }}>Schede salvate ({notes.length})</h3>
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
          </section>
        </div>
      )}

      {tab === 'articoli' && (
        <section className="panel">
          <h3>Articoli su jw.org</h3>
          <p className="muted">
            Scegli un articolo e crea subito una scheda «{MINISTRY_KIND_LABELS[kind]}».
          </p>
          {searchBusy && <p className="muted">Cerco su jw.org…</p>}
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
