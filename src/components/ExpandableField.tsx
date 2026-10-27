import { useEffect, useId, useState } from 'react'
import { Maximize2, X } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Props {
  label: string
  value: string
  onChange?: (value: string) => void
  placeholder?: string
  /** Anteprima multilinea (default true). */
  multiline?: boolean
  rows?: number
  readOnly?: boolean
  className?: string
}

/**
 * Campo di testo con anteprima e popup a schermo intero (mobile-friendly)
 * per leggere e modificare frasi lunghe senza troncamenti.
 */
export function ExpandableField({
  label,
  value,
  onChange,
  placeholder = '',
  multiline = true,
  rows = 3,
  readOnly = false,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const titleId = useId()

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  function commitAndClose() {
    if (!readOnly && onChange && draft !== value) onChange(draft)
    setOpen(false)
  }

  const preview = value.trim() || placeholder

  return (
    <div className={`field expandable-field ${className}`.trim()}>
      <div className="expandable-field-head">
        <label>{label}</label>
        <button
          type="button"
          className="expandable-open"
          onClick={() => setOpen(true)}
          aria-label={`Apri ${label}`}
        >
          <Maximize2 size={15} />
          <span>Apri</span>
        </button>
      </div>

      <button
        type="button"
        className={`expandable-preview ${!value.trim() ? 'is-placeholder' : ''}`}
        onClick={() => setOpen(true)}
      >
        {preview}
      </button>

      {open &&
        createPortal(
          <div
            className="expandable-modal-backdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
          >
            <div
              className="expandable-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="expandable-modal-head">
                <h3 id={titleId}>{label}</h3>
                <button
                  type="button"
                  className="btn secondary small"
                  aria-label="Chiudi"
                  onClick={commitAndClose}
                >
                  <X size={16} />
                </button>
              </div>
              {readOnly || !onChange ? (
                <div className="expandable-modal-body readonly">{value || '—'}</div>
              ) : multiline ? (
                <textarea
                  className="expandable-modal-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={placeholder}
                  rows={Math.max(rows, 8)}
                  autoFocus
                />
              ) : (
                <input
                  className="expandable-modal-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={placeholder}
                  autoFocus
                />
              )}
              <div className="expandable-modal-actions">
                <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                  Annulla
                </button>
                <button type="button" className="btn" onClick={commitAndClose}>
                  {readOnly || !onChange ? 'Chiudi' : 'Salva'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
