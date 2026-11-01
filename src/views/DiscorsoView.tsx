import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Mic,
  MicOff,
  Sparkles,
  Trash2,
  Plus,
  NotebookPen,
  WifiOff,
} from 'lucide-react'
import { ScripturePopup } from '../components/ScripturePopup'
import { SectionProgress } from '../components/SectionProgress'
import {
  fetchScriptureVerse,
  latestScriptureNearEnd,
  type ScriptureVerseResult,
} from '../lib/bibleText'
import { polishDiscourseText } from '../lib/discourseAi'
import { createDictation, speechDictationSupported } from '../lib/speechDictation'
import { uid } from '../lib/id'
import { useAppStore } from '../store/useAppStore'

export function DiscorsoView() {
  const language = useAppStore((s) => s.settings.language)
  const notes = useAppStore((s) => s.discourseNotes)
  const activeId = useAppStore((s) => s.activeDiscourseId)
  const addNote = useAppStore((s) => s.addDiscourseNote)
  const updateNote = useAppStore((s) => s.updateDiscourseNote)
  const removeNote = useAppStore((s) => s.removeDiscourseNote)
  const setActive = useAppStore((s) => s.setActiveDiscourse)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)

  const note = useMemo(
    () => notes.find((n) => n.id === activeId) || notes[0] || null,
    [notes, activeId],
  )

  const [titleDraft, setTitleDraft] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [partial, setPartial] = useState('')
  const [micError, setMicError] = useState('')
  const [polishBusy, setPolishBusy] = useState(false)
  const [polishHint, setPolishHint] = useState('')
  const [autoPolish, setAutoPolish] = useState(true)
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  const [verse, setVerse] = useState<ScriptureVerseResult | null>(null)
  const [verseLoading, setVerseLoading] = useState(false)
  const [verseError, setVerseError] = useState('')
  const lastRefKey = useRef('')

  const dictation = useRef(createDictation(language === 'E' ? 'en-US' : 'it-IT'))
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const polishTimer = useRef<number | null>(null)
  const verseTimer = useRef<number | null>(null)
  const skipNextPolish = useRef(false)

  const micOk = speechDictationSupported()

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!note) {
      setTitleDraft('')
      setBodyDraft('')
      return
    }
    setTitleDraft(note.title)
    setBodyDraft(note.body)
    skipNextPolish.current = true
  }, [note?.id])

  useEffect(() => {
    return () => {
      dictation.current.stop()
      if (polishTimer.current) window.clearTimeout(polishTimer.current)
      if (verseTimer.current) window.clearTimeout(verseTimer.current)
    }
  }, [])

  function persist(patch: { title?: string; body?: string }) {
    if (!note) return
    updateNote(note.id, patch)
  }

  function onTitleChange(value: string) {
    setTitleDraft(value)
    persist({ title: value })
  }

  function scheduleVerseLookup(text: string) {
    if (verseTimer.current) window.clearTimeout(verseTimer.current)
    verseTimer.current = window.setTimeout(() => {
      void lookupVerse(text)
    }, 350)
  }

  async function lookupVerse(text: string) {
    const ref = latestScriptureNearEnd(text)
    if (!ref) return
    const key = `${ref.bible}:${ref.verseEnd || ref.verse}`
    if (key === lastRefKey.current && verse) return
    lastRefKey.current = key
    setVerseLoading(true)
    setVerseError('')
    try {
      const result = await fetchScriptureVerse({
        bookNum: ref.bookNum,
        bookName: ref.bookName,
        chapter: ref.chapter,
        verse: ref.verse,
        verseEnd: ref.verseEnd,
        language,
      })
      setVerse(result)
    } catch (e) {
      if (!navigator.onLine) {
        setVerseError('Offline: versetto non in cache. Riconnettiti per caricarlo da jw.org.')
      } else {
        setVerseError(e instanceof Error ? e.message : 'Versetto non trovato')
      }
      setVerse(null)
    } finally {
      setVerseLoading(false)
    }
  }

  function scheduleAutoPolish(text: string) {
    if (!autoPolish) return
    if (skipNextPolish.current) {
      skipNextPolish.current = false
      return
    }
    if (polishTimer.current) window.clearTimeout(polishTimer.current)
    polishTimer.current = window.setTimeout(() => {
      void runPolish(text, true)
    }, 1800)
  }

  function onBodyChange(value: string) {
    setBodyDraft(value)
    persist({ body: value })
    scheduleVerseLookup(value)
    scheduleAutoPolish(value)
  }

  async function runPolish(source?: string, silent = false) {
    const text = (source ?? bodyDraft).trim()
    if (!text || polishBusy) return
    setPolishBusy(true)
    if (!silent) setPolishHint('')
    try {
      const result = await polishDiscourseText(text, { forceLocal: !online })
      if (result.text && result.text !== text) {
        skipNextPolish.current = true
        setBodyDraft(result.text)
        persist({ body: result.text })
        setPolishHint(
          result.source === 'ai'
            ? 'Sintassi sistemata con AI.'
            : online
              ? 'Correzione locale applicata.'
              : 'Offline: correzione locale applicata.',
        )
      } else if (!silent) {
        setPolishHint('Nessuna modifica necessaria.')
      }
    } catch (e) {
      setPolishHint(e instanceof Error ? e.message : 'Correzione non riuscita')
    } finally {
      setPolishBusy(false)
    }
  }

  function appendDictation(chunk: string, isFinal: boolean) {
    const piece = chunk.trim()
    if (!piece) return
    setBodyDraft((prev) => {
      const base = prev.replace(/\s+$/, '')
      const next = base ? `${base} ${piece}` : piece
      const withSpace = isFinal ? `${next} ` : next
      persist({ body: withSpace })
      scheduleVerseLookup(withSpace)
      if (isFinal) scheduleAutoPolish(withSpace)
      return withSpace
    })
    if (isFinal) setPartial('')
  }

  function toggleMic() {
    setMicError('')
    if (listening) {
      dictation.current.stop()
      setListening(false)
      setPartial('')
      return
    }
    if (!micOk) {
      setMicError('Questo browser non supporta la dettatura. Usa Chrome o Safari.')
      return
    }
    dictation.current = createDictation(language === 'E' ? 'en-US' : 'it-IT')
    dictation.current.start({
      onPartial: (t) => setPartial(t),
      onFinal: (t) => appendDictation(t, true),
      onError: (msg) => {
        setMicError(msg)
        setListening(false)
      },
      onEnd: () => {
        setListening(false)
        setPartial('')
      },
    })
    setListening(true)
  }

  function createNew() {
    const id = addNote('Nuovo discorso')
    setActive(id)
    setVerse(null)
    setPolishHint('')
  }

  function saveToQuaderno() {
    if (!note) return
    const id = addTopic(note.title || 'Discorso', 'Appunti discorso')
    updateTopic(id, {
      interest: note.body.slice(0, 1200),
      reflections: [
        {
          id: uid('ref'),
          prompt: 'Bozza discorso',
          response: note.body,
        },
      ],
      status: 'da_iniziare',
    })
    setView('studio')
  }

  return (
    <div className="stack">
      <SectionProgress section="discorso" />
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="section-kicker">Discorso</p>
            <h2>Appunti e bozza</h2>
            <p className="lede">
              Scrivi a mano o detta col microfono. L’AI sistema la sintassi; le scritture
              (es. Proverbi 14:12) aprono subito il testo da jw.org.
            </p>
          </div>
          <button className="btn accent" type="button" onClick={createNew}>
            <Plus size={16} /> Nuovo
          </button>
        </div>

        {!online && (
          <p className="muted" style={{ margin: '0 0 0.75rem' }}>
            <WifiOff size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Offline: puoi scrivere e dettare. Correzione locale attiva; versetti solo se già in
            cache.
          </p>
        )}

        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoPolish}
              onChange={(e) => setAutoPolish(e.target.checked)}
            />
            Sistema sintassi in tempo reale
          </label>
        </div>
      </section>

      <div className="split">
        <section className="panel">
          {!note ? (
            <div className="empty">
              Nessun discorso ancora.
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn" type="button" onClick={createNew}>
                  <Plus size={16} /> Crea il primo
                </button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <div className="field">
                <label htmlFor="discorso-title">Titolo</label>
                <input
                  id="discorso-title"
                  value={titleDraft}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Es. Rafforzare la fede come Abramo"
                />
              </div>

              <div className="field">
                <label htmlFor="discorso-body">Bozza</label>
                <textarea
                  id="discorso-body"
                  ref={bodyRef}
                  className="discourse-editor"
                  value={bodyDraft}
                  onChange={(e) => onBodyChange(e.target.value)}
                  placeholder="Scrivi o detta il discorso…&#10;Prova: Proverbi 14:12"
                  rows={16}
                />
                {listening && partial && (
                  <p className="muted discourse-partial">…{partial}</p>
                )}
              </div>

              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className={`btn ${listening ? 'danger' : 'accent'}`}
                  type="button"
                  onClick={toggleMic}
                >
                  {listening ? (
                    <>
                      <MicOff size={16} /> Ferma microfono
                    </>
                  ) : (
                    <>
                      <Mic size={16} /> Dettatura
                    </>
                  )}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={polishBusy || !bodyDraft.trim()}
                  onClick={() => void runPolish()}
                >
                  <Sparkles size={16} />{' '}
                  {polishBusy ? 'Sistemo…' : online ? 'Sistema sintassi (AI)' : 'Sistema (locale)'}
                </button>
                <button className="btn secondary" type="button" onClick={saveToQuaderno}>
                  <NotebookPen size={16} /> Salva nel Quaderno
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Eliminare «${note.title || 'discorso'}»?`,
                      )
                    ) {
                      removeNote(note.id)
                      setVerse(null)
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {micError && <p className="muted">{micError}</p>}
              {polishHint && <p className="muted">{polishHint}</p>}
              {listening && (
                <p className="muted">
                  Microfono attivo — parla pure. Tocca «Ferma» quando hai finito.
                </p>
              )}
            </div>
          )}
        </section>

        <div className="stack">
          <ScripturePopup
            verse={verse}
            loading={verseLoading}
            error={verseError}
            language={language}
            onClose={() => {
              setVerse(null)
              setVerseError('')
              lastRefKey.current = ''
            }}
            onInsert={(snippet) => {
              const next = bodyDraft.trim() ? `${bodyDraft.trim()}\n\n${snippet}\n` : `${snippet}\n`
              skipNextPolish.current = true
              setBodyDraft(next)
              persist({ body: next })
            }}
          />

          <section className="panel">
            <h3>I tuoi discorsi ({notes.length})</h3>
            <div className="list">
              {notes.length === 0 && <div className="empty">Nessuna bozza salvata.</div>}
              {notes.map((n) => (
                <div
                  className={`list-item ${note?.id === n.id ? 'active' : ''}`}
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActive(n.id)}
                  onKeyDown={(e) => e.key === 'Enter' && setActive(n.id)}
                >
                  <strong>{n.title || 'Senza titolo'}</strong>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {n.body.slice(0, 100) || 'Vuoto'}
                    {n.body.length > 100 ? '…' : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
