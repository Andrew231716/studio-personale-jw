import { useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, ChevronDown, ListCollapse, Plus, Search } from 'lucide-react'
import { extractBibleCode, parseScriptureLabel } from '../lib/bibleRefs'
import { SUGGESTED_TOPICS, searchJw, searchJwDeep } from '../lib/jwApi'
import { buildJwLibraryShareLink, resolveOpenLinks } from '../lib/jwLibrary'
import { SECTION_LABELS, groupResultsBySection } from '../lib/jwSections'
import { useAppStore } from '../store/useAppStore'
import { JwOpenButtons } from './JwOpenButtons'
import type { ContentKind, JwResult, JwResultSection, StudyResource } from '../types'
import { uid } from '../lib/id'

interface Props {
  language?: string
  onAddResource?: (resource: StudyResource) => void
  onPickQuery?: (query: string) => void
  /** Mostra “Salva per dopo” (raccolta Da studiare). Default: true. */
  enableSaveForLater?: boolean
  /** Avvia automaticamente questa ricerca quando cambia. */
  seedQuery?: string
  /** Incrementa per rilanciare anche la stessa query. */
  seedNonce?: number
  compact?: boolean
  /** Se true, dopo la ricerca le sezioni partono ridotte (solo temi). Default: true. */
  startCollapsed?: boolean
}

export function JwSearch({
  language = 'I',
  onAddResource,
  onPickQuery,
  enableSaveForLater = true,
  seedQuery,
  seedNonce = 0,
  compact,
  startCollapsed = true,
}: Props) {
  const saveResource = useAppStore((s) => s.saveResource)
  const saveSearch = useAppStore((s) => s.saveSearch)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'deep' | 'all' | 'publications' | 'videos' | 'indexes' | 'audio' | 'bible'>(
    'deep',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sections, setSections] = useState<JwResultSection[]>([])
  const [queriesUsed, setQueriesUsed] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [reduced, setReduced] = useState(startCollapsed)
  const [openSectionIds, setOpenSectionIds] = useState<string[]>([])

  const totalCount = useMemo(
    () => sections.reduce((n, s) => n + s.items.length, 0),
    [sections],
  )

  async function runSearch(q = query) {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setToast('')
    try {
      if (mode === 'deep') {
        const data = await searchJwDeep(q, { language })
        setSections(data.sections)
        setQueriesUsed(data.queriesUsed)
      } else {
        const data = await searchJw(q, { language, filter: mode })
        setSections(groupResultsBySection(data))
        setQueriesUsed([q.trim()])
      }
      setReduced(startCollapsed)
      setOpenSectionIds([])
      onPickQuery?.(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di ricerca')
      setSections([])
      setQueriesUsed([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!seedQuery?.trim()) return
    setQuery(seedQuery)
    void runSearch(seedQuery)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedQuery, seedNonce])

  function toResource(result: JwResult): StudyResource {
    const bible =
      extractBibleCode(result.url) ||
      extractBibleCode(result.wolUrl) ||
      (result.kind === 'bible' ? parseScriptureLabel(result.title).bible : undefined)
    const open = resolveOpenLinks({
      url: result.url,
      wolUrl: result.wolUrl,
      lank: result.lank,
      docid: result.docid,
      bible,
      language,
    })
    return {
      id: uid('res'),
      title: result.title,
      url: result.url,
      kind: result.kind,
      notes: [result.context, result.snippet].filter(Boolean).join(' — '),
      lank: result.lank,
      docid: result.docid,
      wolUrl: result.wolUrl,
      bible,
      libraryUrl:
        open.libraryOpenUrl ||
        buildJwLibraryShareLink(
          { lank: result.lank, docid: result.docid, bible, wtlocale: language },
          language,
        ) ||
        undefined,
    }
  }

  function add(result: JwResult) {
    onAddResource?.(toResource(result))
  }

  function saveForLater(result: JwResult) {
    const res = toResource(result)
    const saved = saveResource(res, query.trim() || undefined)
    setToast(saved ? `Salvato per dopo: ${result.title}` : 'Già presente in Da studiare')
  }

  function saveCurrentSearch() {
    const q = query.trim()
    if (!q) return
    saveSearch(q, undefined, totalCount || undefined)
    setToast(`Ricerca salvata: «${q}»`)
  }

  function toggleSection(id: string) {
    setOpenSectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function reduceList() {
    setReduced(true)
    setOpenSectionIds([])
  }

  function expandAll() {
    setReduced(false)
    setOpenSectionIds(sections.map((s) => s.id))
  }

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="jw-q">Cerca su jw.org / JW Library</label>
        <div className="row">
          <input
            id="jw-q"
            value={query}
            placeholder="Tema o versetto… es. Proverbi 3:5-6 oppure tornare alla congregazione"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="deep">Ricerca approfondita (per sezioni)</option>
            <option value="all">Tutto (singola query)</option>
            <option value="publications">Pubblicazioni</option>
            <option value="videos">Video</option>
            <option value="indexes">Indici / guida</option>
            <option value="audio">Audio</option>
            <option value="bible">Bibbia</option>
          </select>
          <button className="btn" type="button" onClick={() => runSearch()} disabled={loading}>
            <span className="row" style={{ gap: 6 }}>
              <Search size={16} /> {loading ? 'Cerco…' : 'Cerca'}
            </span>
          </button>
        </div>
      </div>

      {!compact && (
        <div className="chip-row">
          {SUGGESTED_TOPICS.map((t) => (
            <button
              key={t}
              className="chip"
              type="button"
              onClick={() => {
                setQuery(t)
                void runSearch(t)
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {enableSaveForLater && query.trim() && (
        <button className="btn secondary" type="button" onClick={saveCurrentSearch}>
          <span className="row" style={{ gap: 6 }}>
            <BookmarkPlus size={14} /> Salva questa ricerca
          </span>
        </button>
      )}

      {error && <p className="muted">{error}</p>}
      {toast && <p className="muted">{toast}</p>}

      {queriesUsed.length > 1 && (
        <p className="muted search-meta">
          Ricerche tematiche: {queriesUsed.map((q) => `«${q}»`).join(' · ')}
        </p>
      )}

      {sections.length > 0 && (
        <div className="row search-list-tools" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {totalCount} risultati in {sections.length} temi
          </span>
          {reduced ? (
            <button className="btn secondary small" type="button" onClick={expandAll}>
              Espandi tutto
            </button>
          ) : (
            <button className="btn secondary small" type="button" onClick={reduceList}>
              <ListCollapse size={14} /> Riduci elenco
            </button>
          )}
        </div>
      )}

      <div className="search-sections">
        {sections.map((sec) => {
          const label = sec.label || SECTION_LABELS[sec.id]
          const isOpen = !reduced || openSectionIds.includes(sec.id)
          return (
            <section
              key={sec.id}
              className={`search-section ${isOpen ? 'is-open' : 'is-collapsed'}`}
            >
              <button
                type="button"
                className="search-section-head search-section-toggle"
                onClick={() => {
                  if (!reduced) {
                    // In modalità espansa, «Riduci elenco» via toggle singolo
                    setReduced(true)
                    setOpenSectionIds([sec.id])
                    return
                  }
                  toggleSection(sec.id)
                }}
                aria-expanded={isOpen}
              >
                <span className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <ChevronDown
                    size={16}
                    className={`search-chevron ${isOpen ? 'open' : ''}`}
                    aria-hidden
                  />
                  <h3>{label}</h3>
                </span>
                <span className="badge">{sec.items.length}</span>
              </button>
              {isOpen && (
                <div className="list">
                  {sec.items.map((r) => {
                    const bible =
                      extractBibleCode(r.url) ||
                      extractBibleCode(r.wolUrl) ||
                      (r.kind === 'bible' ? parseScriptureLabel(r.title).bible : undefined)
                    return (
                      <div className="list-item" key={`${sec.id}-${r.id}-${r.url}`}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <strong>{r.title}</strong>
                          <span className="badge">{kindLabel(r.kind)}</span>
                        </div>
                        {r.context && (
                          <p className="muted result-context" style={{ margin: 0 }}>
                            {r.context}
                          </p>
                        )}
                        {r.snippet && (
                          <p className="muted" style={{ margin: 0 }}>
                            {r.snippet}
                          </p>
                        )}
                        <JwOpenButtons
                          url={r.url}
                          wolUrl={r.wolUrl}
                          lank={r.lank}
                          docid={r.docid}
                          bible={bible}
                          language={language}
                          compact={compact}
                          webLabel={bible ? r.title : undefined}
                        />
                        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                          {enableSaveForLater && (
                            <button
                              className="btn secondary"
                              type="button"
                              onClick={() => saveForLater(r)}
                            >
                              <span className="row" style={{ gap: 6 }}>
                                <BookmarkPlus size={14} /> Salva per dopo
                              </span>
                            </button>
                          )}
                          {onAddResource && (
                            <button className="btn" type="button" onClick={() => add(r)}>
                              <span className="row" style={{ gap: 6 }}>
                                <Plus size={14} /> Aggiungi allo studio
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
        {!loading && sections.length === 0 && query && !error && (
          <div className="empty">Nessun risultato attinente. Prova un tema più preciso o un versetto.</div>
        )}
      </div>
    </div>
  )
}

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
