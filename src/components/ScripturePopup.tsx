import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, ChevronRight, X } from 'lucide-react'
import type { ScriptureVerseResult } from '../lib/bibleText'

interface Props {
  verse: ScriptureVerseResult | null
  loading?: boolean
  error?: string
  language?: string
  onClose: () => void
  onInsert?: (text: string) => void
  /** Posizione iniziale opzionale (es. vicino al click). */
  anchor?: { x: number; y: number } | null
}

/**
 * Popup stile BIBLIOTECA ONLINE Watchtower:
 * «Brano biblico citato», link blu, testo TNM, chiudibile e trascinabile.
 */
export function ScripturePopup({
  verse,
  loading,
  error,
  onClose,
  onInsert,
  anchor,
}: Props) {
  const [pos, setPos] = useState({ x: 24, y: 96 })
  const drag = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function place(nx: number, ny: number) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 400
      const h = typeof window !== 'undefined' ? window.innerHeight : 600
      const panelW = Math.min(352, Math.max(200, w - 24))
      const panelH = 200
      return {
        x: Math.min(Math.max(8, nx), Math.max(8, w - panelW - 8)),
        y: Math.min(Math.max(8, ny), Math.max(8, h - Math.min(panelH, h - 16))),
      }
    }
    if (anchor) {
      setPos(place(anchor.x, anchor.y))
      return
    }
    if (verse || loading || error) {
      setPos((p) => (p.x === 24 && p.y === 96 ? place(24, 96) : place(p.x, p.y)))
    }
  }, [verse?.bible, verse?.verse, loading, error, anchor?.x, anchor?.y])

  useEffect(() => {
    function clamp(nx: number, ny: number) {
      const w = typeof window !== 'undefined' ? window.innerWidth : 400
      const h = typeof window !== 'undefined' ? window.innerHeight : 600
      const panelW = panelRef.current?.offsetWidth || 340
      const panelH = panelRef.current?.offsetHeight || 200
      return {
        x: Math.min(Math.max(8, nx), Math.max(8, w - Math.min(panelW, w - 16))),
        y: Math.min(Math.max(8, ny), Math.max(8, h - Math.min(80, panelH))),
      }
    }
    function onMove(e: PointerEvent) {
      if (!drag.current) return
      setPos(clamp(e.clientX - drag.current.ox, e.clientY - drag.current.oy))
    }
    function onUp() {
      drag.current = null
    }
    function onResize() {
      setPos((p) => clamp(p.x, p.y))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  if (!verse && !loading && !error) return null

  const translation =
    'Traduzione del Nuovo Mondo delle Sacre Scritture (edizione per lo studio)'

  const verseNum = verse?.verse
  const verseBody = verse?.text?.replace(/^\d+\s*/, '') || ''

  const node = (
    <aside
      ref={panelRef}
      className="wol-popup"
      role="dialog"
      aria-label="Brano biblico citato"
      style={{ left: pos.x, top: pos.y }}
    >
      <header
        className="wol-popup-bar"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return
          drag.current = {
            ox: e.clientX - pos.x,
            oy: e.clientY - pos.y,
            px: pos.x,
            py: pos.y,
          }
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
      >
        <span>Brano biblico citato</span>
        <button type="button" className="wol-popup-close" aria-label="Chiudi" onClick={onClose}>
          <X size={14} strokeWidth={2.2} />
        </button>
      </header>

      <div className="wol-popup-body">
        {loading && <p className="wol-popup-muted">Cerco il versetto…</p>}
        {error && !loading && <p className="wol-popup-muted">{error}</p>}

        {verse && !loading && (
          <>
            <a
              className="wol-popup-source"
              href={verse.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="wol-popup-icon" aria-hidden>
                <BookOpen size={18} strokeWidth={1.8} />
              </span>
              <span className="wol-popup-source-text">
                <span className="wol-popup-ref">{verse.label}</span>
                <span className="wol-popup-pub">{translation}</span>
              </span>
              <ChevronRight size={16} className="wol-popup-chevron" aria-hidden />
            </a>

            <div className="wol-popup-verse">
              {verse.before && verse.verse > 1 && (
                <p className="wol-popup-neighbor">
                  <span className="wol-vnum">{verse.verse - 1}</span> {verse.before}
                </p>
              )}
              <p>
                <span className="wol-vnum">{verseNum}</span> {verseBody}
              </p>
              {verse.after && (
                <p className="wol-popup-neighbor">
                  <span className="wol-vnum">{(verse.verseEnd || verse.verse) + 1}</span>{' '}
                  {verse.after}
                </p>
              )}
            </div>

            {onInsert && (
              <div className="wol-popup-actions">
                <button
                  type="button"
                  className="wol-popup-insert"
                  onClick={() => onInsert(`«${verse.text}» (${verse.label})`)}
                >
                  Inserisci nel discorso
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  )

  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}
