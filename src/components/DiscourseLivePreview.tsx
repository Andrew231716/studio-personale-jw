import { useMemo } from 'react'
import { findScriptureRefsInText, type ParsedScriptureRef } from '../lib/bibleText'
import { findUncertainSpans } from '../lib/jwSpeechLexicon'

type Props = {
  text: string
  onOpenRef: (ref: ParsedScriptureRef, anchor: { x: number; y: number }) => void
  emptyLabel?: string
}

type Part =
  | { type: 'text'; value: string }
  | { type: 'ref'; value: string; ref: ParsedScriptureRef }
  | { type: 'uncertain'; value: string; reason: string }

/**
 * Anteprima live: scritture cliccabili + parole incerte evidenziate.
 */
export function DiscourseLivePreview({
  text,
  onOpenRef,
  emptyLabel = 'Nessun testo ancora.',
}: Props) {
  const parts = useMemo(() => buildParts(text || ''), [text])
  const uncertainCount = parts.filter((p) => p.type === 'uncertain').length
  const refCount = parts.filter((p) => p.type === 'ref').length

  if (!text.trim()) {
    return <p className="muted">{emptyLabel}</p>
  }

  return (
    <div className="discourse-live-preview">
      <p className="muted discourse-scripture-live-label">
        Anteprima live
        {refCount ? ` · ${refCount} scritture` : ''}
        {uncertainCount ? ` · ${uncertainCount} da rivedere` : ''}
        {' '}· clicca una scrittura per il popup
      </p>
      <div className="scripture-linked-text">
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return <span key={i}>{renderNewlines(part.value)}</span>
          }
          if (part.type === 'uncertain') {
            return (
              <mark key={i} className="discourse-uncertain" title={part.reason}>
                {part.value}
              </mark>
            )
          }
          return (
            <button
              key={i}
              type="button"
              className="wol-inline-ref"
              onClick={(e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                onOpenRef(part.ref, { x: rect.left, y: rect.bottom + 8 })
              }}
            >
              {part.value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function buildParts(text: string): Part[] {
  const refs = findScriptureRefsInText(text)
  const uncertain = findUncertainSpans(text)
  type Mark = { start: number; end: number; kind: 'ref' | 'uncertain'; ref?: ParsedScriptureRef; reason?: string }
  const marks: Mark[] = []
  for (const ref of refs) {
    if (!ref.matched) continue
    marks.push({
      start: ref.index,
      end: ref.index + ref.matched.length,
      kind: 'ref',
      ref,
    })
  }
  for (const u of uncertain) {
    marks.push({ start: u.start, end: u.end, kind: 'uncertain', reason: u.reason })
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end)

  const parts: Part[] = []
  let cursor = 0
  for (const mark of marks) {
    if (mark.start < cursor) continue
    if (mark.start > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, mark.start) })
    }
    const value = text.slice(mark.start, mark.end)
    if (mark.kind === 'ref' && mark.ref) {
      parts.push({ type: 'ref', value, ref: mark.ref })
    } else {
      parts.push({ type: 'uncertain', value, reason: mark.reason || 'da rivedere' })
    }
    cursor = mark.end
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) })
  return parts
}

function renderNewlines(value: string) {
  const chunks = value.split('\n')
  return chunks.map((line, i) => (
    <span key={i}>
      {line}
      {i < chunks.length - 1 ? <br /> : null}
    </span>
  ))
}
