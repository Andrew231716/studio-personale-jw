import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { findStudies, indexStudies, type StudySearchKind, type StudySearchResult } from '../lib/studySearch'
import { useAppStore } from '../store/useAppStore'

const LABELS: Record<StudySearchKind, string> = {
  quaderno: 'Argomento del Quaderno',
  sessione: 'Sessione del Diario',
  materiale: 'Materiale da studiare',
  ricerca: 'Ricerca salvata',
}
const PAGE_SIZE = 30

export function StudySearch({ onOpenResult }: { onOpenResult: (result: StudySearchResult) => void }) {
  const topics = useAppStore((state) => state.topics)
  const sessions = useAppStore((state) => state.sessionLogs)
  const resources = useAppStore((state) => state.savedResources)
  const searches = useAppStore((state) => state.savedSearches)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<StudySearchKind | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const deferredQuery = useDeferredValue(query)
  const focusQuery = useCallback((node: HTMLInputElement | null) => { node?.focus() }, [])
  const index = useMemo(
    () => open ? indexStudies({ topics, sessions, resources, searches }) : [],
    [open, topics, sessions, resources, searches],
  )
  const datesInvalid = Boolean(from && to && from > to)
  const results = useMemo(
    () => datesInvalid ? [] : findStudies(index, { query: deferredQuery, kind, from, to }),
    [datesInvalid, deferredQuery, from, index, kind, to],
  )

  return (
    <div className="stack study-search">
      <div>
        <button
          className="btn secondary small"
          type="button"
          aria-expanded={open}
          aria-controls={open ? "study-search-panel" : undefined}
          onClick={() => setOpen(!open)}
        >
          <Search size={16} /> {open ? 'Chiudi ricerca' : 'Cerca negli studi salvati'}
        </button>
      </div>
      {open && (
        <section className="panel stack" id="study-search-panel" aria-label="Ricerca negli studi salvati">
          <div className="field">
            <label htmlFor="study-search-query">Parola, argomento o scrittura</label>
            <input
              id="study-search-query"
              type="search"
              placeholder="Es. preghiera, Genesi 12:1"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE_SIZE) }}
              ref={focusQuery}
            />
          </div>
          <div className="study-search-filters">
            <div className="field">
              <label htmlFor="study-search-kind">Tipo di contenuto</label>
              <select id="study-search-kind" value={kind} onChange={(e) => {
                setKind(e.target.value as StudySearchKind | '')
                setLimit(PAGE_SIZE)
              }}>
                <option value="">Tutti i tipi</option>
                {Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="study-search-from">Dal giorno</label>
              <input id="study-search-from" type="date" value={from} onChange={(e) => {
                setFrom(e.target.value)
                setLimit(PAGE_SIZE)
              }} />
            </div>
            <div className="field">
              <label htmlFor="study-search-to">Al giorno</label>
              <input id="study-search-to" type="date" value={to} onChange={(e) => {
                setTo(e.target.value)
                setLimit(PAGE_SIZE)
              }} />
            </div>
          </div>
          <p className="muted" role="status">
            {datesInvalid ? 'La data iniziale deve precedere quella finale.' :
              results.length ? `${results.length} ${results.length === 1 ? 'risultato' : 'risultati'}` :
              'Nessuno studio corrisponde alla ricerca.'}
          </p>
          <div className="list">
            {results.slice(0, limit).map((item) => (
              <button
                key={`${item.kind}:${item.id}`}
                className="list-item study-search-result"
                type="button"
                onClick={() => { setOpen(false); onOpenResult(item) }}
              >
                <strong>{item.title}</strong>
                <span className="muted">{LABELS[item.kind]}{item.date ? ` · ${new Date(item.date).toLocaleDateString('it-IT')}` : ''}</span>
                {item.preview && <span>{item.preview}</span>}
              </button>
            ))}
          </div>
          {limit < results.length && (
            <button className="btn secondary" type="button" onClick={() => setLimit(limit + PAGE_SIZE)}>
              Mostra altri risultati
            </button>
          )}
        </section>
      )}
    </div>
  )
}
