import { useEffect, useState } from 'react'
import { Search, ExternalLink, Plus } from 'lucide-react'
import { SUGGESTED_TOPICS, searchJw } from '../lib/jwApi'
import type { ContentKind, JwResult, StudyResource } from '../types'
import { uid } from '../lib/id'

interface Props {
  language?: string
  onAddResource?: (resource: StudyResource) => void
  onPickQuery?: (query: string) => void
  compact?: boolean
}

export function JwSearch({ language = 'I', onAddResource, onPickQuery, compact }: Props) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'publications' | 'videos'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<JwResult[]>([])

  async function runSearch(q = query) {
    if (!q.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await searchJw(q, { language, filter })
      setResults(data)
      onPickQuery?.(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di ricerca')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // no auto-search
  }, [])

  function add(result: JwResult) {
    onAddResource?.({
      id: uid('res'),
      title: result.title,
      url: result.url,
      kind: result.kind,
      notes: result.snippet,
    })
  }

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="jw-q">Cerca su jw.org</label>
        <div className="row">
          <input
            id="jw-q"
            value={query}
            placeholder="Es. preghiera, decisioni, fede…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Tutto</option>
            <option value="publications">Articoli / pubblicazioni</option>
            <option value="videos">Video</option>
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

      <div className="list">
        {results.map((r) => (
          <div className="list-item" key={`${r.id}-${r.url}`}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{r.title}</strong>
              <span className="badge">{kindLabel(r.kind)}</span>
            </div>
            {r.snippet && <p className="muted" style={{ margin: 0 }}>{r.snippet}</p>}
            <div className="row">
              <a className="btn secondary" href={r.url} target="_blank" rel="noreferrer">
                <span className="row" style={{ gap: 6 }}>
                  <ExternalLink size={14} /> Apri su jw.org
                </span>
              </a>
              {onAddResource && (
                <button className="btn accent" type="button" onClick={() => add(r)}>
                  <span className="row" style={{ gap: 6 }}>
                    <Plus size={14} /> Aggiungi allo studio
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && query && !error && (
          <div className="empty">Nessun risultato. Prova un altro termine.</div>
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
    case 'index':
      return 'Indice'
    default:
      return 'jw.org'
  }
}
