import { useMemo } from 'react'
import {
  findScriptureRefsInText,
  type ParsedScriptureRef,
} from '../lib/bibleText'

interface Props {
  text: string
  onOpenRef: (ref: ParsedScriptureRef, anchor: { x: number; y: number }) => void
  className?: string
  /** Se vuoto, mostra un placeholder. */
  emptyLabel?: string
}

/**
 * Renderizza il testo del discorso con le scritture come link blu (stile WOL).
 * Cliccando si riapre il popup del versetto.
 */
export function ScriptureLinkedText({
  text,
  onOpenRef,
  className = '',
  emptyLabel = 'Nessun testo ancora.',
}: Props) {
  const parts = useMemo(() => buildLinkedParts(text || ''), [text])

  if (!text.trim()) {
    return <p className={`muted ${className}`.trim()}>{emptyLabel}</p>
  }

  return (
    <div className={`scripture-linked-text ${className}`.trim()}>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <span key={i}>{renderNewlines(part.value)}</span>
        }
        return (
          <button
            key={i}
            type="button"
            className="wol-inline-ref"
            onClick={(e) => {
              const rect = (e.target as HTMLElement).getBoundingClientRect()
              onOpenRef(part.ref, {
                x: rect.left,
                y: rect.bottom + 8,
              })
            }}
          >
            {part.value}
          </button>
        )
      })}
    </div>
  )
}

type Part =
  | { type: 'text'; value: string }
  | { type: 'ref'; value: string; ref: ParsedScriptureRef }

function buildLinkedParts(text: string): Part[] {
  const refs = findScriptureRefsInText(text)
  if (!refs.length) return [{ type: 'text', value: text }]

  const parts: Part[] = []
  let cursor = 0
  for (const ref of refs) {
    const start = ref.index
    const end = start + (ref.matched?.length || ref.label.length)
    if (start > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, start) })
    }
    const raw = text.slice(start, end) || ref.matched || ref.label
    parts.push({ type: 'ref', value: raw, ref })
    cursor = end
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
