import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  /**
   * Se true, apre automaticamente quando digiti un riferimento completo.
   * Il riaprire resta sempre possibile dalla lista / testo collegato.
   */
  autoOpenOnType?: boolean
}

export type ScriptureAssistHandle = {
  openRef: (
    ref: ParsedScriptureRef,
    anchor?: { x: number; y: number },
  ) => void
}

export const ScriptureAssist = forwardRef<ScriptureAssistHandle, Props>(
  function ScriptureAssist(
    { text, language = 'I', onInsert, compact, autoOpenOnType = true },
    ref,
  ) {
    const [verse, setVerse] = useState<ScriptureVerseResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
    const lastKey = useRef('')
    const preloadKey = useRef('')
    const timer = useRef<number | null>(null)

    const refs = useMemo(() => findScriptureRefsInText(text || ''), [text])

    async function openRef(
      parsed: ParsedScriptureRef,
      nextAnchor?: { x: number; y: number },
    ) {
      const key = `${parsed.bible}:${parsed.verseEnd || parsed.verse}`
      lastKey.current = key
      if (nextAnchor) setAnchor(nextAnchor)
      setLoading(true)
      setError('')
      try {
        const result = await fetchScriptureVerse({
          bookNum: parsed.bookNum,
          bookName: parsed.bookName,
          chapter: parsed.chapter,
          verse: parsed.verse,
          verseEnd: parsed.verseEnd,
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

    useImperativeHandle(ref, () => ({
      openRef: (parsed, nextAnchor) => {
        void openRef(parsed, nextAnchor)
      },
    }))

    useEffect(() => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        void runPreload(text)
        if (autoOpenOnType) void runLookup(text)
      }, 380)
      return () => {
        if (timer.current) window.clearTimeout(timer.current)
      }
    }, [text, language, autoOpenOnType])

    async function runPreload(value: string) {
      const hint = latestChapterHint(value)
      if (!hint) return
      const key = `${language}:${hint.bookNum}:${hint.chapter}`
      if (key === preloadKey.current) return
      preloadKey.current = key
      try {
        await preloadChapter({
          bookNum: hint.bookNum,
          chapter: hint.chapter,
          language,
        })
      } catch {
        /* offline / rete */
      }
    }

    async function runLookup(value: string) {
      const parsed = latestScriptureNearEnd(value)
      if (!parsed) return
      const key = `${parsed.bible}:${parsed.verseEnd || parsed.verse}`
      // Solo al primo riconoscimento: dopo chiusura si riapre cliccando la scrittura
      if (key === lastKey.current) return
      await openRef(parsed)
    }

    const showList = !compact && refs.length > 0

    return (
      <>
        <ScripturePopup
          verse={verse}
          loading={loading}
          error={error}
          language={language}
          anchor={anchor}
          onClose={() => {
            setVerse(null)
            setError('')
            setAnchor(null)
          }}
          onInsert={onInsert}
        />

        {showList && (
          <section className="panel scripture-assist">
            <h3>Scritture nel testo ({refs.length})</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Clicca per aprire o riaprire il popup (trascinabile dalla barra
              «Brano biblico citato»).
            </p>
            <div className="list">
              {refs.map((r) => (
                <button
                  key={`${r.index}-${r.label}`}
                  type="button"
                  className={`list-item scripture-ref-btn ${
                    verse?.label === r.label ? 'active' : ''
                  }`}
                  onClick={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect()
                    void openRef(r, { x: rect.left, y: rect.bottom + 8 })
                  }}
                >
                  <strong
                    className="wol-inline-ref"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                  >
                    {r.label}
                  </strong>
                  <span className="muted" style={{ display: 'block', marginTop: 2 }}>
                    {r.matched}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </>
    )
  },
)

/** Esporta helper per aprire un ref da fuori (testo collegato nel discorso). */
export type ScriptureOpenHandler = (
  ref: ParsedScriptureRef,
  anchor?: { x: number; y: number },
) => void
