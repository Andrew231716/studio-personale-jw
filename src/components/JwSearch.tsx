import { useState } from 'react'
import { Search, Plus } from 'lucide-react'
import { SUGGESTED_TOPICS, searchJw, searchJwDeep } from '../lib/jwApi'
import { buildJwLibraryShareLink, resolveOpenLinks } from '../lib/jwLibrary'
import { SECTION_LABELS, groupResultsBySection } from '../lib/jwSections'
import { JwOpenButtons } from './JwOpenButtons'
import type { ContentKind, JwResult, JwResultSection, StudyResource } from '../types'
import { uid } from '../lib/id'

interface Props {
  language?: string
  onAddResource?: (resource: StudyResource) => void
  onPickQuery?: (query: string) => void
  compact?: boolean
}

export function JwSearch({ language = 'I', onAddResource, onPickQuery, compact }: Props) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'deep' | 'all' | 'publications' | 'videos' | 'indexes' | 'audio' | 'bible'>(
    'deep',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sections, setSections] = useState<JwResultSection[]>([])
  const [queriesUsed, setQueriesUsed] = useState<string[]>([])

  async function runSearch(q = query) {
    if (!q.trim()) return
    setLoading(true)
    setError('')
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
      onPickQuery?.(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di ricerca')
      setSections([])
      setQueriesUsed([])
    } finally {
      setLoading(false)
    }
  }

  function add(result: JwResult) {
    const open = resolveOpenLinks({
      url: result.url,
      wolUrl: result.wolUrl,
      lank: result.lank,
      docid: result.docid,
      language,
    })
    onAddResource?.({
      id: uid('res'),
      title: result.title,
      url: result.url,
      kind: result.kind,
      notes: [result.context, result.snippet].filter(Boolean).join(' — '),
      lank: result.lank,
      docid: result.docid,
      libraryUrl:
        open.libraryOpenUrl ||
        buildJwLibraryShareLink(
          { lank: result.lank, docid: result.docid, wtlocale: language },
          language,
        ) ||
        undefined,
    })
  }

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="jw-q">Cerca su jw.org / JW Library</label>
        <div className="row">
          <input
            id="jw-q"
            value={query}
            placeholder="Descrivi il tema, non solo una parola… es. tornare alla congregazione del territorio"
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

      {error && <p className="muted">{error}</p>}

      {queriesUsed.length > 1 && (
        <p className="muted search-meta">
          Ricerche tematiche: {queriesUsed.map((q) => `«${q}»`).join(' · ')}
        </p>
      )}

      <div className="search-sections">
        {sections.map((sec) => (
          <section key={sec.id} className="search-section">
            <header className="search-section-head">
              <h3>{sec.label || SECTION_LABELS[sec.id]}</h3>
              <span className="badge">{sec.items.length}</span>
            </header>
            <div className="list">
              {sec.items.map((r) => (
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
                    language={language}
                    compact={compact}
                  />
                  {onAddResource && (
                    <button className="btn" type="button" onClick={() => add(r)}>
                      <span className="row" style={{ gap: 6 }}>
                        <Plus size={14} /> Aggiungi allo studio
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        {!loading && sections.length === 0 && query && !error && (
          <div className="empty">Nessun risultato. Prova a descrivere meglio il tema.</div>
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
