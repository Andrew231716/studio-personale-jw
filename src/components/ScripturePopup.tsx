import { BookOpen, ExternalLink, X } from 'lucide-react'
import { JwOpenButtons } from './JwOpenButtons'
import type { ScriptureVerseResult } from '../lib/bibleText'

interface Props {
  verse: ScriptureVerseResult | null
  loading?: boolean
  error?: string
  language?: string
  onClose: () => void
  onInsert?: (text: string) => void
}

export function ScripturePopup({
  verse,
  loading,
  error,
  language = 'I',
  onClose,
  onInsert,
}: Props) {
  if (!verse && !loading && !error) return null

  return (
    <aside className="scripture-popup" role="dialog" aria-label="Scrittura da jw.org">
      <div className="scripture-popup-head">
        <p className="section-kicker" style={{ margin: 0 }}>
          <BookOpen size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
          Bibbia · jw.org
        </p>
        <button className="btn secondary small" type="button" aria-label="Chiudi" onClick={onClose}>
          <X size={14} />
        </button>
      </div>

      {loading && <p className="muted">Cerco il versetto…</p>}
      {error && !loading && <p className="muted">{error}</p>}

      {verse && !loading && (
        <>
          <h3 style={{ margin: '0.2rem 0 0.55rem' }}>{verse.label}</h3>
          <p className="scripture-popup-text">{verse.text}</p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
            <JwOpenButtons
              url={verse.url}
              bible={verse.bible}
              language={language}
              compact
              webLabel="Apri su jw.org"
            />
            {onInsert && (
              <button
                className="btn secondary small"
                type="button"
                onClick={() => onInsert(`«${verse.text}» (${verse.label})`)}
              >
                Inserisci nel testo
              </button>
            )}
            <a
              className="btn secondary small"
              href={verse.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
            </a>
          </div>
          {verse.cached && (
            <p className="muted" style={{ margin: '0.55rem 0 0', fontSize: '0.85rem' }}>
              Da cache locale (utile anche offline).
            </p>
          )}
        </>
      )}
    </aside>
  )
}
