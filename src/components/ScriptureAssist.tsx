import { useEffect, useMemo, useRef, useState } from 'react'
import { ScripturePopup } from './ScripturePopup'
import {
  fetchScriptureVerse,
  findScriptureRefsInText,
  latestChapterHint,
  latestScriptureNearEnd,
  preloadChapter,
  type ParsedScriptureRef,
  type ScriptureVerseResult,
} from '../lib/bibleText'

interface Props {
  text: string
  language?: string
  onInsert?: (snippet: string) => void
  /** Compact: solo popup, senza lista. */
  compact?: boolean
}

export function ScriptureAssist({ text, language = 'I', onInsert, compact }: Props) {
  const [verse, setVerse] = useState<ScriptureVerseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const lastKey = useRef('')
  const preloadKey = useRef('')
  const timer = useRef<number | null>(null)

  const refs = useMemo(() => findScriptureRefsInText(text || ''), [text])

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void runLookup(text)
      void runPreload(text)
    }, 320)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [text, language])

  async function runPreload(value: string) {
    const hint = latestChapterHint(value)
    if (!hint) return
    const key = `${language}:${hint.bookNum}:${hint.chapter}`
    if (key === preloadKey.current) return
    preloadKey.current = key
    try {
      await preloadChapter({ bookNum: hint.bookNum, chapter: hint.chapter, language })
    } catch {
      /* offline / rete */
    }
  }

  async function openRef(ref: ParsedScriptureRef) {
    const key = `${ref.bible}:${ref.verseEnd || ref.verse}`
    lastKey.current = key
    setLoading(true)
    setError('')
    try {
      const result = await fetchScriptureVerse({
        bookNum: ref.bookNum,
        bookName: ref.bookName,
        chapter: ref.chapter,
        verse: ref.verse,
        verseEnd: ref.verseEnd,
        language,
        withContext: true,
      })
      setVerse(result)
    } catch (e) {
      setVerse(null)
      setError(
        !navigator.onLine
          ? 'Offline: versetto non in cache. Scarica il pacchetto Bibbia in Discorso/Impostazioni oppure riconnettiti.'
          : e instanceof Error
            ? e.message
            : 'Versetto non trovato',
      )
    } finally {
      setLoading(false)
    }
  }

  async function runLookup(value: string) {
    const ref = latestScriptureNearEnd(value)
    if (!ref) return
    const key = `${ref.bible}:${ref.verseEnd || ref.verse}`
    if (key === lastKey.current && verse) return
    await openRef(ref)
  }

  return (
    <div className="stack scripture-assist">
      <ScripturePopup
        verse={verse}
        loading={loading}
        error={error}
        language={language}
        onClose={() => {
          setVerse(null)
          setError('')
          lastKey.current = ''
        }}
        onInsert={onInsert}
      />

      {!compact && refs.length > 0 && (
        <section className="panel">
          <h3>Scritture nel testo ({refs.length})</h3>
          <div className="list">
            {refs.map((r) => (
              <button
                key={`${r.index}-${r.label}`}
                type="button"
                className={`list-item scripture-ref-btn ${verse?.label === r.label ? 'active' : ''}`}
                onClick={() => void openRef(r)}
              >
                <strong>{r.label}</strong>
                <span className="muted" style={{ display: 'block', marginTop: 2 }}>
                  {r.matched}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
