import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookMarked,
  FileText,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
  WifiOff,
  NotebookPen,
  Download,
  ListTree,
  Subtitles,
} from 'lucide-react'
import {
  ScriptureAssist,
  type ScriptureAssistHandle,
} from '../components/ScriptureAssist'
import { ScriptureLinkedText } from '../components/ScriptureLinkedText'
import { SectionProgress } from '../components/SectionProgress'
import {
  TOTAL_BIBLE_CHAPTERS,
  downloadFullOfflineBible,
  downloadOfflineBiblePack,
  getCachedChapterCount,
  getCachedVerseCount,
  getOfflineBibleStats,
} from '../lib/bibleText'
import { polishDiscourseText, structureDiscourseWithAi } from '../lib/discourseAi'
import {
  downloadDiscourseText,
  exportDiscourseEpub,
  exportDiscoursePdf,
} from '../lib/exportDiscourse'
import { reviseDiscourseForExport } from '../lib/exportRevise'
import {
  SECTION_KIND_LABEL,
  ensureSections,
  flattenSectionBodies,
  joinSections,
  sectionDurationSeconds,
  sectionIndexForElapsed,
  totalMinutes,
} from '../lib/discourseStructure'
import { createDiscourseCapture } from '../lib/discourseCapture'
import {
  deleteDiscourseRecording,
  formatRecordingDuration,
  getDiscourseRecordingBlob,
  listDiscourseRecordings,
  mediaRecorderSupported,
  updateDiscourseRecording,
  type DiscourseRecordingMeta,
} from '../lib/discourseRecordings'
import { transcribeDiscourseAudio } from '../lib/discourseTranscribe'
import {
  appendDictatedChunk,
  speechDictationSupportNote,
  speechDictationSupported,
} from '../lib/speechDictation'
import { uid } from '../lib/id'
import type { DiscourseSection, DiscourseSectionKind } from '../types'
import { useAppStore } from '../store/useAppStore'

export function DiscorsoView() {
  const language = useAppStore((s) => s.settings.language)
  const notes = useAppStore((s) => s.discourseNotes)
  const activeId = useAppStore((s) => s.activeDiscourseId)
  const ministryNotes = useAppStore((s) => s.ministryNotes)
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
  const [sections, setSections] = useState<DiscourseSection[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [listening, setListening] = useState(false)
  const [captureSectionId, setCaptureSectionId] = useState<string | null>(null)
  const [captureSaving, setCaptureSaving] = useState(false)
  const [partial, setPartial] = useState('')
  const [micError, setMicError] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const [polishBusy, setPolishBusy] = useState(false)
  const [polishHint, setPolishHint] = useState('')
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [practiceOn, setPracticeOn] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [packBusy, setPackBusy] = useState(false)
  const [packMsg, setPackMsg] = useState('')
  const [fullBusy, setFullBusy] = useState(false)
  const [offlineChapters, setOfflineChapters] = useState(0)
  const fullAbortRef = useRef<AbortController | null>(null)
  const [exportBusy, setExportBusy] = useState<string | null>(null)
  const [recordings, setRecordings] = useState<DiscourseRecordingMeta[]>([])
  const [playUrl, setPlayUrl] = useState<string | null>(null)
  const [playId, setPlayId] = useState<string | null>(null)
  const [recHint, setRecHint] = useState('')
  const [structureBusy, setStructureBusy] = useState(false)
  const [transcribeBusyId, setTranscribeBusyId] = useState<string | null>(null)

  const capture = useRef(createDiscourseCapture(language === 'E' ? 'en-US' : 'it-IT'))
  const editorRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const scriptureAssistRef = useRef<ScriptureAssistHandle | null>(null)
  const practiceStarted = useRef<number | null>(null)
  const sectionsRef = useRef(sections)
  const activeSectionIdRef = useRef(activeSectionId)
  const visibleNoteId = useRef(note?.id)
  visibleNoteId.current = note?.id
  const playUrlRef = useRef<string | null>(null)
  sectionsRef.current = sections
  activeSectionIdRef.current = activeSectionId

  const micOk = speechDictationSupported()
  const canRecord = mediaRecorderSupported()
  const supportNote = speechDictationSupportNote()
  const captureOk = canRecord

  const bodyJoined = useMemo(
    () =>
      sections
        .map((s) => s.body)
        .filter(Boolean)
        .join('\n\n'),
    [sections],
  )

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    )
  }, [notes, search])

  const practiceIndex = practiceOn
    ? sectionIndexForElapsed(sections, elapsed)
    : -1

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
    void getOfflineBibleStats(language).then((s) => setOfflineChapters(s.chaptersIndexed))
  }, [language, packMsg])

  useEffect(() => {
    if (!activeId && notes[0]?.id) {
      setActive(notes[0].id)
    }
  }, [activeId, notes, setActive])

  useEffect(() => {
    if (!note) {
      setTitleDraft('')
      setSections([])
      setActiveSectionId(null)
      return
    }
    setTitleDraft(note.title)
    const secs = ensureSections(note)
    setSections(secs)
    setActiveSectionId(secs[0]?.id || null)
  }, [note?.id])

  useEffect(() => {
    return () => {
      capture.current.stop()
      if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!note?.id) {
      setRecordings([])
      return
    }
    let active = true
    setRecordings([])
    if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current)
    playUrlRef.current = null
    setPlayId(null)
    setPlayUrl(null)
    void listDiscourseRecordings(note.id).then((items) => {
      if (active) setRecordings((current) => [
        ...current,
        ...items.filter((item) => !current.some((saved) => saved.id === item.id)),
      ])
    })
    return () => { active = false }
  }, [note?.id])

  useEffect(() => {
    if (!practiceOn) return
    if (practiceStarted.current == null) {
      practiceStarted.current = Date.now() - elapsed * 1000
    }
    const id = window.setInterval(() => {
      if (practiceStarted.current == null) return
      setElapsed(Math.floor((Date.now() - practiceStarted.current) / 1000))
    }, 250)
    return () => window.clearInterval(id)
  }, [practiceOn])

  function persistSections(next: DiscourseSection[]) {
    if (!note) return
    sectionsRef.current = next
    setSections(next)
    updateNote(note.id, { sections: next })
  }

  function patchSavedSection(noteId: string, id: string, patch: Partial<DiscourseSection>) {
    const latest = visibleNoteId.current === noteId
      ? sectionsRef.current
      : useAppStore.getState().discourseNotes.find((item) => item.id === noteId)?.sections
    if (!latest?.some((section) => section.id === id)) return
    const next = latest.map((section) => section.id === id ? { ...section, ...patch } : section)
    if (visibleNoteId.current === noteId) {
      sectionsRef.current = next
      setSections(next)
    }
    updateNote(noteId, { sections: next })
  }

  function patchSection(id: string, patch: Partial<DiscourseSection>) {
    if (note) patchSavedSection(note.id, id, patch)
  }

  async function runPolish() {
    if (!note || polishBusy) return
    const noteId = note.id
    const latest = new Map<string, DiscourseRecordingMeta>()
    for (const recording of recordings) {
      if (recording.sectionId && !latest.has(recording.sectionId)) {
        latest.set(recording.sectionId, recording)
      }
    }
    const candidates = sections.filter((section) => section.body.trim() || latest.has(section.id))
    if (!candidates.length) {
      setPolishHint('Scrivi o registra almeno un blocco.')
      return
    }
    setPolishBusy(true)
    setPolishHint('')
    let failed = 0
    try {
      for (const section of candidates) {
        const recording = latest.get(section.id)
        try {
          const input = recording
            ? recording.transcript || await readRecordingTranscript(recording.id)
            : section.body
          const result = await polishDiscourseText(input, { forceLocal: !online })
          patchSavedSection(noteId, section.id, {
            revision: { ...result, recordingId: recording?.id },
          })
        } catch {
          failed++
        }
      }
      setPolishHint(failed
        ? `${failed} blocchi da riprovare. Controlla la connessione e la disponibilità della trascrizione AI.`
        : 'Revisioni pronte nei riquadri dei blocchi.')
    } finally {
      setPolishBusy(false)
    }
  }

  function appendDictation(noteId: string, sid: string, chunk: string) {
    const current = sectionsRef.current.find((section) => section.id === sid)?.body || ''
    if (visibleNoteId.current !== noteId) return
    const next = appendDictatedChunk(current, chunk)
    if (next === current) return
    patchSavedSection(noteId, sid, { body: next })
    requestAnimationFrame(() => {
      const ta = editorRefs.current[sid]
      if (ta) {
        // Mantieni visibile la fine del testo mentre detta
        ta.scrollTop = ta.scrollHeight
      }
    })
  }

  function toggleMic(sectionId: string) {
    setMicError('')
    setRecHint('')
    if (listening) {
      setCaptureSaving(true)
      capture.current.stop()
      setListening(false)
      setPartial('')
      setMicLevel(0)
      return
    }
    if (!note) {
      setMicError('Crea o apri un discorso prima di dettare.')
      return
    }
    if (!captureOk) {
      setMicError(
        supportNote ||
          'Microfono non disponibile. Serve un browser con registrazione audio (Chrome/Safari/Edge).',
      )
      return
    }
    const section = sectionsRef.current.find((item) => item.id === sectionId)
    if (!section || captureSaving) return
    const noteId = note.id
    setCaptureSectionId(section.id)
    setActiveSectionId(section.id)
    capture.current = createDiscourseCapture(language === 'E' ? 'en-US' : 'it-IT')
    void capture.current.start({
      discourseId: noteId,
      sectionId,
      title: section.title.trim() || titleDraft.trim() || undefined,
    }, {
      onPartial: (t) => setPartial(t),
      onFinal: (t) => {
        appendDictation(noteId, sectionId, t)
        setPartial('')
      },
      onLevel: setMicLevel,
      onError: (msg) => {
        // Errori fatali microfono: chiudi sessione
        setMicError(msg)
        setListening(false)
        setMicLevel(0)
      },
      onWarning: (msg) => setRecHint(msg),
      onEnd: () => {
        setCaptureSaving(false)
        setCaptureSectionId(null)
        setListening(false)
        setPartial('')
        setMicLevel(0)
      },
      onDuration: (durationMs) => patchSavedSection(noteId, sectionId, { recordedDurationMs: durationMs }),
      onRecordingSaved: (meta) => {
        if (visibleNoteId.current !== noteId) return
        setRecordings((prev) => [meta, ...prev.filter((r) => r.id !== meta.id)])
        setRecHint(
          online
            ? 'Registrazione salvata nel blocco.'
            : 'Registrazione offline salvata su questo dispositivo. Riascoltala quando vuoi; la trascrizione automatica richiede rete.',
        )
      },
      onRecordingError: (msg) => setRecHint(msg),
    })
    setListening(true)
    if (!online) {
      setRecHint(
        'Modalità offline: registro l’audio in locale. Il testo automatico riprende online.',
      )
    }
  }

  async function playRecording(id: string) {
    const noteId = visibleNoteId.current
    if (playUrlRef.current) {
      URL.revokeObjectURL(playUrlRef.current)
      playUrlRef.current = null
    }
    if (playId === id) {
      setPlayId(null)
      setPlayUrl(null)
      return
    }
    const blob = await getDiscourseRecordingBlob(id)
    if (visibleNoteId.current !== noteId) return
    if (!blob) {
      setRecHint('Registrazione non trovata su questo dispositivo.')
      return
    }
    const url = URL.createObjectURL(blob)
    playUrlRef.current = url
    setPlayUrl(url)
    setPlayId(id)
  }

  async function removeRecording(id: string) {
    await deleteDiscourseRecording(id)
    setRecordings((prev) => prev.filter((r) => r.id !== id))
    if (playId === id) {
      if (playUrlRef.current) URL.revokeObjectURL(playUrlRef.current)
      playUrlRef.current = null
      setPlayId(null)
      setPlayUrl(null)
    }
  }

  async function downloadRecording(id: string) {
    const blob = await getDiscourseRecordingBlob(id)
    if (!blob) return
    const meta = recordings.find((r) => r.id === id)
    const mime = meta?.mimeType || blob.type
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
    const a = document.createElement('a')
    const url = URL.createObjectURL(blob)
    a.href = url
    const name = meta?.title?.replace(/[\\/:*?"<>|]/g, '-').trim() || `discorso-${(meta?.createdAt || id).slice(0, 19).replace(/[:T]/g, '-')}`
    a.download = `${name}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  function addSection(kind: DiscourseSectionKind = 'libera') {
    const next: DiscourseSection = {
      id: uid('dsec'),
      kind: 'libera',
      title: kind === 'libera' ? '' : SECTION_KIND_LABEL[kind],
      body: '',
      minutes: 5,
    }
    persistSections([...sections, next])
    setActiveSectionId(next.id)
  }

  async function runStructureAnalyze() {
    const startingSections = sectionsRef.current
    const full = flattenSectionBodies(sections) || joinSections(sections)
    if (!full.trim()) {
      setPolishHint('Scrivi o detta qualcosa prima di analizzare la struttura.')
      return
    }
    if (structureBusy) return
    setStructureBusy(true)
    setPolishHint('Analizzo la struttura (introduzione, punti, conclusione)…')
    try {
      const { sections: next, source } = await structureDiscourseWithAi(full, {
        forceLocal: !online,
      })
        if (visibleNoteId.current !== note?.id || sectionsRef.current !== startingSections) {
        setPolishHint('La bozza è cambiata. Avvia di nuovo l’analisi.')
        return
      }
      persistSections(next)
      setActiveSectionId(next[0]?.id || null)
      setPolishHint(
        source === 'ai'
          ? 'Struttura applicata con AI. Il contenuto è stato conservato.'
          : online
            ? 'Struttura locale applicata (contenuto conservato).'
            : 'Offline: struttura locale. Contenuto conservato.',
      )
    } catch (e) {
      setPolishHint(e instanceof Error ? e.message : 'Analisi non riuscita')
    } finally {
      setStructureBusy(false)
    }
  }

  async function readRecordingTranscript(id: string) {
    const blob = await getDiscourseRecordingBlob(id)
    if (!blob) throw new Error('Registrazione non trovata su questo dispositivo.')
    const { text } = await transcribeDiscourseAudio(blob, { language })
    const saved = await updateDiscourseRecording(id, { transcript: text })
    if (saved) setRecordings((current) => current.map((item) => item.id === id ? saved : item))
    return text
  }

  async function transcribeRecording(id: string) {
    if (transcribeBusyId) return
    setTranscribeBusyId(id)
    setRecHint('Trascrivo la registrazione…')
    try {
      await readRecordingTranscript(id)
      setRecHint('Trascrizione salvata nel riquadro della registrazione.')
    } catch (e) {
      setRecHint(e instanceof Error ? e.message : 'Trascrizione non riuscita')
    } finally {
      setTranscribeBusyId(null)
    }
  }

  async function linkRecording(id: string, sectionId: string) {
    try {
      const saved = await updateDiscourseRecording(id, { sectionId })
      if (!saved) return
      setRecordings((current) => current.map((item) => item.id === id ? saved : item))
      if (saved.durationMs != null) {
        patchSavedSection(saved.discourseId, sectionId, { recordedDurationMs: saved.durationMs })
      }
    } catch {
      setRecHint('Impossibile collegare la registrazione al blocco.')
    }
  }

  function renderRecording(recording: DiscourseRecordingMeta, unlinked: boolean) {
    return (
      <div className="stack list-item" key={recording.id}>
        <strong>{recording.title || new Date(recording.createdAt).toLocaleString('it-IT')}</strong>
        <small>{formatRecordingDuration(recording.durationMs)}</small>
        {unlinked && (
          <select aria-label="Collega registrazione a un blocco" value=""
            onChange={(event) => void linkRecording(recording.id, event.target.value)}>
            <option value="" disabled>Collega a un blocco…</option>
            {sections.map((section, index) => (
              <option key={section.id} value={section.id}>{section.title.trim() || `Blocco ${index + 1}`}</option>
            ))}
          </select>
        )}
        <div className="row discourse-recording-actions">
          <button className="btn secondary small" type="button" onClick={() => void playRecording(recording.id)}>
            <Play size={14} /> {playId === recording.id ? 'Chiudi' : 'Ascolta'}
          </button>
          <button className="btn secondary small" type="button"
            disabled={!online || !!transcribeBusyId || polishBusy}
            onClick={() => void transcribeRecording(recording.id)}>
            <Subtitles size={14} />
            {transcribeBusyId === recording.id ? 'Trascrivo…' : recording.transcript ? 'Ritrascrivi' : 'Trascrivi'}
          </button>
          <button className="btn secondary small" type="button" aria-label="Scarica registrazione"
            onClick={() => void downloadRecording(recording.id)}>
            <Download size={14} />
          </button>
          <button className="btn secondary small" type="button" aria-label="Elimina registrazione"
            disabled={polishBusy || transcribeBusyId === recording.id}
            onClick={() => void removeRecording(recording.id)}>
            <Trash2 size={14} />
          </button>
        </div>
        {playId === recording.id && playUrl && <audio src={playUrl} controls autoPlay />}
        {recording.transcript && <p>{recording.transcript}</p>}
      </div>
    )
  }

  function removeSection(id: string) {
    if (sections.length <= 1) return
    const updated = sections.filter((s) => s.id !== id)
    persistSections(updated)
    if (activeSectionId === id) setActiveSectionId(updated[0]?.id || null)
  }

  function createNew() {
    const id = addNote('Nuovo discorso')
    setActive(id)
    setPolishHint('')
  }

  function fromMinistry(id: string) {
    const m = ministryNotes.find((x) => x.id === id)
    if (!m || captureSectionId) return
    addNote(m.title || 'Discorso da Ministero', {
      body: m.content,
      sourceMinistryNoteId: m.id,
    })
  }

  function saveToQuaderno() {
    if (!note) return
    const body = joinSections(sections) || bodyJoined
    const id = addTopic(note.title || 'Discorso', 'Appunti discorso')
    updateTopic(id, {
      interest: body.slice(0, 1200),
      reflections: [
        { id: uid('ref'), prompt: 'Bozza discorso', response: body },
      ],
      status: 'da_iniziare',
    })
    setView('studio')
  }

  async function runExport(kind: 'pdf' | 'epub' | 'txt') {
    if (!note) return
    setExportBusy(kind)
    setPolishHint('Revisiono il documento prima dell’export…')
    try {
      const draft = {
        ...note,
        sections,
        body: joinSections(sections),
        estimatedMinutes: totalMinutes(sections),
      }
      const { note: revised, meta } = await reviseDiscourseForExport(draft, language)
      updateNote(revised.id, {
        title: revised.title,
        sections: revised.sections,
        body: revised.body,
        estimatedMinutes: revised.estimatedMinutes,
      })
      if (kind === 'pdf') await exportDiscoursePdf(revised)
      else if (kind === 'epub') await exportDiscourseEpub(revised, { language })
      else downloadDiscourseText(revised)
      setPolishHint(`${meta.message} File ${kind.toUpperCase()} scaricato.`)
    } catch (e) {
      setPolishHint(e instanceof Error ? e.message : 'Esportazione non riuscita')
    } finally {
      setExportBusy(null)
    }
  }

  async function downloadPack() {
    if (!online) {
      setPackMsg('Serve connessione per scaricare il pacchetto.')
      return
    }
    setPackBusy(true)
    setPackMsg('Scarico capitoli frequenti…')
    try {
      const { chapters } = await downloadOfflineBiblePack({
        language,
        maxChaptersPerBook: 8,
        onProgress: (r, label) =>
          setPackMsg(`${Math.round(r * 100)}% · ${label}`),
      })
      const stats = await getOfflineBibleStats(language)
      setOfflineChapters(stats.chaptersIndexed)
      setPackMsg(
        `Pacchetto pronto: ${chapters} capitoli. Offline: ${stats.chaptersIndexed}/${TOTAL_BIBLE_CHAPTERS} · cache ${getCachedChapterCount()} cap. · ${getCachedVerseCount()} versetti.`,
      )
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : 'Download non riuscito')
    } finally {
      setPackBusy(false)
    }
  }

  async function downloadFullBible() {
    if (!online) {
      setPackMsg('Serve connessione per scaricare tutta la Bibbia da wol.jw.org.')
      return
    }
    const ctrl = new AbortController()
    fullAbortRef.current = ctrl
    setFullBusy(true)
    setPackMsg('Scarico tutta la Bibbia da wol.jw.org…')
    try {
      const result = await downloadFullOfflineBible({
        language,
        concurrency: 2,
        signal: ctrl.signal,
        onProgress: (info) =>
          setPackMsg(
            `${Math.round(info.ratio * 100)}% · ${info.done}/${info.total} · ${info.label}`,
          ),
      })
      const stats = await getOfflineBibleStats(language)
      setOfflineChapters(stats.chaptersIndexed)
      setPackMsg(
        ctrl.signal.aborted
          ? `Interrotto · offline ${stats.chaptersIndexed}/${TOTAL_BIBLE_CHAPTERS}`
          : `Bibbia salvata: ${result.chapters} nuovi · ${result.skipped} già presenti · ${stats.chaptersIndexed}/${TOTAL_BIBLE_CHAPTERS} capitoli.`,
      )
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : 'Download non riuscito')
    } finally {
      fullAbortRef.current = null
      setFullBusy(false)
    }
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="stack discourse-page">
      <SectionProgress section="discorso" />

      <div className="discourse-layout">
        <section className="panel discourse-editor-panel">
          <div className="discourse-toolbar">
            <div className="discourse-toolbar-copy">
              <p className="section-kicker">Discorso</p>
              <h2>Bozza libera, dettatura e scritture</h2>
            </div>
            <button className="btn accent" type="button" onClick={createNew} disabled={captureSectionId != null}>
              <Plus size={16} /> Nuovo
            </button>
          </div>

          {!online && (
            <p className="muted" style={{ margin: '0 0 0.75rem' }}>
              <WifiOff size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Offline: bozza e sezioni ok. AI remota no; versetti solo da cache/pacchetto.
            </p>
          )}
          {supportNote && !micOk && <p className="muted">{supportNote}</p>}

          {!note ? (
            <div className="empty">
              Nessun discorso ancora.
              <div style={{ marginTop: '0.75rem' }}>
                <button className="btn" type="button" onClick={createNew} disabled={captureSectionId != null}>
                  <Plus size={16} /> Crea il primo
                </button>
              </div>
            </div>
          ) : (
            <div className="stack discourse-editor-stack">
              <div className="field">
                <label htmlFor="discorso-title">Titolo</label>
                <input
                  id="discorso-title"
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value)
                    updateNote(note.id, { title: e.target.value })
                  }}
                  placeholder="Es. Rafforzare la fede come Abramo"
                />
              </div>

              <div className="row discourse-meta-row">
                <strong>Durata totale · {formatTime(sections.reduce((sum, section) => sum + sectionDurationSeconds(section), 0))}</strong>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn secondary small" type="button" onClick={() => addSection('libera')}>
                    <Plus size={14} /> Blocco
                  </button>
                  <button
                    className="btn secondary small"
                    type="button"
                    disabled={structureBusy || polishBusy || listening || captureSaving || recordings.some((item) => item.sectionId) || sections.some((section) => section.recordedDurationMs != null || section.revision)}
                    title="Disponibile prima di registrare o revisionare i blocchi"
                    onClick={() => void runStructureAnalyze()}
                  >
                    <ListTree size={14} />{' '}
                    {structureBusy ? 'Analizzo…' : 'Analizza struttura AI'}
                  </button>
                  <button
                    className={`btn ${practiceOn ? 'danger' : 'secondary'} small`}
                    type="button"
                    onClick={() => {
                      if (practiceOn) {
                        setPracticeOn(false)
                        practiceStarted.current = null
                      } else {
                        setElapsed(0)
                        practiceStarted.current = Date.now()
                        setPracticeOn(true)
                      }
                    }}
                  >
                    {practiceOn ? <Pause size={14} /> : <Play size={14} />}
                    {practiceOn ? 'Stop prova' : 'Prova a tempo'}
                  </button>
                  {practiceOn && (
                    <span className="discourse-timer">
                      <Timer size={16} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                      {formatTime(elapsed)}
                    </span>
                  )}
                  {practiceOn && (
                    <button
                      className="btn secondary small"
                      type="button"
                      onClick={() => {
                        practiceStarted.current = Date.now()
                        setElapsed(0)
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              </div>

              {sections.map((s, idx) => (
                <div
                  key={s.id}
                  className={`discourse-section ${practiceIndex === idx ? 'is-active-practice' : ''}`}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div className="row" style={{ gap: 8, flex: 1, flexWrap: 'wrap' }}>
                      {s.kind !== 'libera' && (
                        <span className="badge">{SECTION_KIND_LABEL[s.kind]}</span>
                      )}
                      <input
                        value={s.title}
                        onChange={(e) => patchSection(s.id, { title: e.target.value })}
                        aria-label="Titolo blocco"
                        placeholder={
                          s.kind === 'libera' ? 'Titolo opzionale…' : SECTION_KIND_LABEL[s.kind]
                        }
                        style={{ flex: 1, minWidth: 120 }}
                      />
                      {s.recordedDurationMs != null ? (
                        <span><Timer size={14} /> {formatRecordingDuration(s.recordedDurationMs)}</span>
                      ) : <label className="row" style={{ gap: 4 }}>
                        <span className="muted">min</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={s.minutes}
                          onChange={(e) =>
                            patchSection(s.id, { minutes: Number(e.target.value) || 1 })
                          }
                          style={{ width: 64 }}
                        />
                      </label>}
                    </div>
                    <button
                      className="btn secondary small"
                      type="button"
                      disabled={sections.length <= 1 || captureSectionId === s.id}
                      onClick={() => removeSection(s.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <button
                    className={`btn small ${captureSectionId === s.id && listening ? 'danger' : 'secondary'}`}
                    type="button"
                    disabled={!captureOk || captureSaving || structureBusy || (listening && captureSectionId !== s.id)}
                    onClick={() => toggleMic(s.id)}
                  >
                    {listening && captureSectionId === s.id
                      ? <><MicOff size={16} /> Ferma</>
                      : <><Mic size={16} /> {captureSaving && captureSectionId === s.id ? 'Salvo…' : 'Detta e registra'}</>}
                  </button>
                  {listening && captureSectionId === s.id && (
                    <>
                      {partial && <p className="muted discourse-partial">In corso · {partial}</p>}
                      <div className="mic-level" aria-hidden>
                        <span style={{ width: `${Math.round(micLevel * 100)}%` }} />
                      </div>
                    </>
                  )}
                  <div className="discourse-comparison">
                    <div className="stack">
                      <strong>Testo originale</strong>
                      <textarea
                        ref={(el) => {
                          editorRefs.current[s.id] = el
                        }}
                        className="discourse-editor"
                        value={s.body}
                        aria-label="Testo originale"
                        rows={idx === 0 ? 8 : 6}
                        placeholder={
                          s.kind === 'libera'
                            ? 'Scrivi o detta liberamente… poi «Analizza struttura AI» per intro / punti / conclusione.'
                            : s.kind === 'introduzione'
                              ? 'Apri con una domanda o una scrittura… es. Pr 14:12'
                              : 'Scrivi o detta qui…'
                        }
                        onFocus={() => setActiveSectionId(s.id)}
                        onChange={(e) => {
                          setActiveSectionId(s.id)
                          patchSection(s.id, { body: e.target.value })
                        }}
                      />
                    </div>
                    <div className="stack discourse-comparison-result">
                      <strong>{s.revision?.source === 'local' ? 'Revisione locale' : 'Versione sistemata con AI'}</strong>
                      <p>{s.revision?.text || 'Premi «Sistema ora» per confrontare la revisione.'}</p>
                      {s.revision?.recordingId && <small>{recordings.find((item) => item.id === s.revision?.recordingId)?.title}</small>}
                    </div>
                    <div className="stack discourse-comparison-result">
                      <strong>Trascrizione audio</strong>
                      {recordings.filter((item) => item.sectionId === s.id).map((item) =>
                        renderRecording(item, false),
                      )}
                      {!recordings.some((item) => item.sectionId === s.id) && (
                        <p className="muted">Registra in questo blocco per trascrivere l’audio.</p>
                      )}
                    </div>
                  </div>
                  {/\d\s*:\s*\d/.test(s.body) && (
                    <div className="discourse-scripture-preview">
                      <p className="muted" style={{ margin: '0.45rem 0 0.25rem' }}>
                        Anteprima — clicca una scrittura per aprire o riaprire il popup
                      </p>
                      <ScriptureLinkedText
                        text={s.body}
                        onOpenRef={(ref, anchor) => {
                          scriptureAssistRef.current?.openRef(ref, anchor)
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={polishBusy || listening || captureSaving || !!transcribeBusyId || structureBusy}
                  onClick={() => void runPolish()}
                >
                  <Sparkles size={16} />{' '}
                  {polishBusy ? 'Sistemo…' : 'Sistema ora'}
                </button>
                <button className="btn secondary" type="button" onClick={saveToQuaderno}>
                  <NotebookPen size={16} /> Quaderno
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => void runExport('pdf')}
                >
                  <FileText size={16} /> PDF
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={!!exportBusy}
                  title="I popup dei versetti funzionano meglio in lettori come Apple Books o Thorium; altri possono ignorare lo script."
                  onClick={() => void runExport('epub')}
                >
                  <BookMarked size={16} /> EPUB
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={!!exportBusy}
                  onClick={() => void runExport('txt')}
                >
                  <Download size={16} /> TXT
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (captureSectionId) return
                    if (window.confirm(`Eliminare «${note.title || 'discorso'}»?`)) {
                      removeNote(note.id)
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {micError && <p className="error-text">{micError}</p>}
              {recHint && <p className="muted">{recHint}</p>}
              <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                EPUB: i popup dei versetti funzionano meglio in Apple Books o Thorium; altri
                lettori possono mostrare solo il testo senza interazione.
              </p>
              {listening && supportNote && micOk && (
                <p className="muted">{supportNote}</p>
              )}
              {polishHint && <p className="muted">{polishHint}</p>}
              {listening && (
                <p className="muted">
                  {online
                    ? 'Microfono attivo: testo in automatico nella sezione selezionata; audio salvato in locale.'
                    : 'Offline: sto registrando l’audio in locale. Al termine riascoltalo o attendi la rete per trascrivere.'}
                </p>
              )}

              {recordings.some((item) => !sections.some((section) => section.id === item.sectionId)) && (
                <div className="stack">
                  <h3>Registrazioni da collegare</h3>
                  {recordings.filter((item) => !sections.some((section) => section.id === item.sectionId)).map((item) =>
                    renderRecording(item, true),
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="stack discourse-rail">
          <section className="panel">
            <h3>I tuoi discorsi ({notes.length})</h3>
            <div className="field">
              <label htmlFor="discorso-search">Cerca</label>
              <input
                id="discorso-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titolo o testo…"
              />
            </div>
            <div className="list">
              {filteredNotes.length === 0 && (
                <div className="empty">Nessuna bozza trovata.</div>
              )}
              {filteredNotes.map((n) => (
                <div
                  className={`list-item ${note?.id === n.id ? 'active' : ''}`}
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!captureSectionId) setActive(n.id) }}
                  onKeyDown={(e) => e.key === 'Enter' && !captureSectionId && setActive(n.id)}
                >
                  <strong>{n.title || 'Senza titolo'}</strong>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {formatTime(Math.round((n.estimatedMinutes ?? totalMinutes(ensureSections(n))) * 60))} ·{' '}
                    {(() => {
                      const preview = ensureSections(n)
                        .map((s) => s.body.trim())
                        .filter(Boolean)
                        .join(' · ')
                      return preview
                        ? `${preview.slice(0, 90)}${preview.length > 90 ? '…' : ''}`
                        : 'Vuoto'
                    })()}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {note && (
            <ScriptureAssist
              ref={scriptureAssistRef}
              text={bodyJoined}
              language={language}
              resetKey={note.id}
              onInsert={(snippet) => {
                const sid = activeSectionIdRef.current || sectionsRef.current[0]?.id
                if (!sid) return
                const cur = sectionsRef.current.find((s) => s.id === sid)?.body || ''
                const next = cur.trim() ? `${cur.trim()}\n\n${snippet}\n` : `${snippet}\n`
                patchSection(sid, { body: next })
              }}
            />
          )}

          {ministryNotes.length > 0 && (
            <section className="panel discourse-side-compact">
              <h3>Da Ministero</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                Crea una bozza da una scheda già preparata.
              </p>
              <div className="list">
                {ministryNotes.slice(0, 8).map((m) => (
                  <div className="list-item" key={m.id}>
                    <strong>{m.title}</strong>
                    <button
                      className="btn secondary small"
                      type="button"
                      style={{ marginTop: 6 }}
                      onClick={() => fromMinistry(m.id)}
                    >
                      Usa come discorso
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel discourse-side-compact">
            <h3>Bibbia offline</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {offlineChapters}/{TOTAL_BIBLE_CHAPTERS} capitoli · cache{' '}
              {getCachedChapterCount()} · {getCachedVerseCount()} versetti.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button
                className="btn accent"
                type="button"
                disabled={packBusy || fullBusy || !online}
                onClick={() => void downloadFullBible()}
              >
                <Download size={16} />{' '}
                {fullBusy ? 'Scarico tutta…' : 'Scarica tutta la Bibbia'}
              </button>
              {fullBusy && (
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => fullAbortRef.current?.abort()}
                >
                  Interrompi
                </button>
              )}
              <button
                className="btn secondary"
                type="button"
                disabled={packBusy || fullBusy || !online}
                onClick={() => void downloadPack()}
              >
                <Download size={16} /> {packBusy ? 'Scarico…' : 'Solo pacchetto'}
              </button>
            </div>
            {!online && (
              <p className="network-need-hint" style={{ marginTop: '0.65rem' }}>
                Questa azione richiede internet (wol.jw.org).
              </p>
            )}
            {packMsg && <p className="muted">{packMsg}</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}
