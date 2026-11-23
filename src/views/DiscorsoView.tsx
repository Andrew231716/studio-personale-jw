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
  Save,
  Sparkles,
  Timer,
  Trash2,
  WifiOff,
  NotebookPen,
  Download,
  ListTree,
  Subtitles,
  CloudUpload,
  CloudDownload,
  Cloud,
} from 'lucide-react'
import {
  ScriptureAssist,
  type ScriptureAssistHandle,
} from '../components/ScriptureAssist'
import { DiscourseLivePreview } from '../components/DiscourseLivePreview'
import { SectionProgress } from '../components/SectionProgress'
import {
  TOTAL_BIBLE_CHAPTERS,
  chaptersForBook,
  findScriptureRefsInText,
  downloadFullOfflineBible,
  downloadOfflineBiblePack,
  getCachedChapterCount,
  getCachedVerseCount,
  getOfflineBibleStats,
} from '../lib/bibleText'
import { polishDiscourseText, structureDiscourseWithAi } from '../lib/discourseAi'
import { askAi } from '../lib/ai'
import {
  downloadDiscoursePreachOutline,
  downloadDiscourseText,
  exportDiscourseEpub,
  exportDiscoursePdf,
} from '../lib/exportDiscourse'
import { createLivePolishController, type LivePolishController } from '../lib/discourseLivePolish'
import {
  alignPracticeTexts,
  missingWordsPreview,
} from '../lib/discoursePracticeAlign'
import {
  enqueueTranscription,
  listPendingTranscriptions,
  processTranscriptionQueue,
} from '../lib/discourseOfflineQueue'
import { detectSpokenSectionCue } from '../lib/jwSpeechLexicon'
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
  countSectionRecordings,
  deleteDiscourseRecording,
  formatRecordingDuration,
  getDiscourseRecordingBlob,
  listDiscourseRecordings,
  mediaRecorderSupported,
  saveDiscourseRecording,
  sumSectionRecordingDurationMs,
  updateDiscourseRecording,
  type DiscourseRecordingMeta,
} from '../lib/discourseRecordings'
import {
  deleteICloudDiscourseRecording,
  downloadICloudDiscourseAudio,
  iCloudAudioAvailable,
  mergeLocalAndICloudRecordings,
  syncDiscourseRecordingsToICloud,
  uploadDiscourseRecordingToICloud,
} from '../lib/icloud'
import { transcribeDiscourseAudio, type TranscriptSegment } from '../lib/discourseTranscribe'
import { refineDiscourseSpeechText } from '../lib/discourseTextRefine'
import {
  appendDictatedChunk,
  speechDictationSupportNote,
  speechDictationSupported,
} from '../lib/speechDictation'
import { uid } from '../lib/id'
import type { DiscourseSection, DiscourseSectionKind } from '../types'
import { useAppStore } from '../store/useAppStore'

const discourseTabs = ['Originale', 'Revisione AI', 'Trascrizione'] as const

export function DiscorsoView() {
  const [blockViews, setBlockViews] = useState<Record<string, { tab?: number; compare?: number; collapsed?: boolean }>>(() => {
    try { return JSON.parse(localStorage.getItem('jw-discourse-block-views') || '{}') || {} }
    catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem('jw-discourse-block-views', JSON.stringify(blockViews)) }
    catch { /* Il blocco resta utilizzabile quando lo spazio locale non è disponibile. */ }
  }, [blockViews])
  const [captureSeconds, setCaptureSeconds] = useState(0)
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
  const [saveHint, setSaveHint] = useState('')
  const [livePolishOn, setLivePolishOn] = useState(() => {
    try { return localStorage.getItem('jw-discourse-live-polish') === '1' }
    catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('jw-discourse-live-polish', livePolishOn ? '1' : '0') }
    catch { /* ignore */ }
  }, [livePolishOn])
  const [livePolishBusy, setLivePolishBusy] = useState(false)
  const [practiceDiff, setPracticeDiff] = useState<{
    sectionId: string
    summary: string
    missing: string[]
    items: ReturnType<typeof alignPracticeTexts>['items']
  } | null>(null)
  const [queueCount, setQueueCount] = useState(0)
  const [listening, setListening] = useState(false)
  const livePolishRef = useRef<LivePolishController | null>(null)
  useEffect(() => {
    if (!listening) return
    const started = performance.now()
    setCaptureSeconds(0)
    const timer = window.setInterval(() => setCaptureSeconds(Math.floor((performance.now() - started) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [listening])
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
  const [transcriptLanguage, setTranscriptLanguage] = useState('auto')
  const [importing, setImporting] = useState(false)
  const [audioAnalysis, setAudioAnalysis] = useState<{ id: string; answer: string } | null>(null)
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [timingAdvice, setTimingAdvice] = useState<{ sectionId: string; text: string } | null>(null)
  const playerRef = useRef<HTMLVideoElement | null>(null)
  const requestedPlaybackTime = useRef(0)

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

  /** Testo per popup/evidenziazioni, inclusa la dettatura in corso. */
  const scriptureLiveText = useMemo(() => {
    if (!listening || !captureSectionId || !partial.trim()) return bodyJoined
    return sections
      .map((s) => {
        if (s.id !== captureSectionId) return s.body
        const base = s.body.trimEnd()
        return base ? `${base} ${partial.trim()}` : partial.trim()
      })
      .filter(Boolean)
      .join('\n\n')
  }, [bodyJoined, sections, listening, captureSectionId, partial])

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
    void listDiscourseRecordings(note.id).then(async (items) => {
      const merged = await mergeLocalAndICloudRecordings(note.id, items)
      if (!active) return
      setRecordings(merged)
      const sectionIds = new Set(
        merged.map((item) => item.sectionId).filter((id): id is string => Boolean(id)),
      )
      for (const sectionId of sectionIds) {
        syncSectionRecordedSum(note.id, sectionId, merged)
      }
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
    const next = latest.map((section) => {
      if (section.id !== id) return section
      const merged = { ...section, ...patch }
      if ('recordedDurationMs' in patch && patch.recordedDurationMs == null) {
        delete merged.recordedDurationMs
      }
      return merged
    })
    if (visibleNoteId.current === noteId) {
      sectionsRef.current = next
      setSections(next)
    }
    updateNote(noteId, { sections: next })
  }

  /** Aggiorna solo la somma tempi prova; lascia intatto Obiettivo (min). */
  function syncSectionRecordedSum(
    noteId: string,
    sectionId: string,
    items: DiscourseRecordingMeta[],
  ) {
    const total = sumSectionRecordingDurationMs(items, sectionId)
    patchSavedSection(noteId, sectionId, {
      recordedDurationMs: total > 0 ? total : undefined,
    })
  }

  function patchSection(id: string, patch: Partial<DiscourseSection>) {
    if (note) patchSavedSection(note.id, id, patch)
  }

  async function runPolish(sectionId?: string) {
    if (!note || polishBusy) return
    const noteId = note.id
    const latest = new Map<string, DiscourseRecordingMeta>()
    for (const recording of recordings) {
      if (recording.sectionId && !latest.has(recording.sectionId)) {
        latest.set(recording.sectionId, recording)
      }
    }
    const candidates = sections.filter((section) => (!sectionId || section.id === sectionId)
      && (section.body.trim() || latest.has(section.id)))
    if (!candidates.length) {
      setPolishHint('Scrivi o registra almeno un blocco.')
      return
    }
    setPolishBusy(true)
    setPolishHint('')
    let failed = 0
    try {
      for (let i = 0; i < candidates.length; i++) {
        const section = candidates[i]
        const recording = latest.get(section.id)
        let done = false
        for (let attempt = 0; attempt < 3 && !done; attempt++) {
          try {
            if (i > 0 || attempt > 0) {
              await new Promise((r) => window.setTimeout(r, attempt === 0 ? 900 : 4000 * attempt))
            }
            setPolishHint(
              `Sistemo blocco ${i + 1}/${candidates.length}${attempt ? ` · tentativo ${attempt + 1}` : ''}…`,
            )
            const input = recording
              ? recording.transcript || await readRecordingTranscript(recording.id)
              : section.body
            const result = await polishDiscourseText(input, { forceLocal: !online })
            patchSavedSection(noteId, section.id, {
              revision: { ...result, recordingId: recording?.id },
            })
            done = true
          } catch (e) {
            const msg = e instanceof Error ? e.message : ''
            const quota = /limite|429|quota|riprova/i.test(msg)
            if (!quota || attempt === 2) {
              failed++
              done = true
            }
          }
        }
      }
      setPolishHint(failed
        ? `${failed} blocchi da riprovare. Aggiungi altre chiavi Gemini in Impostazioni o riprova tra poco (fallback automatico attivo).`
        : 'Revisioni pronte nei riquadri dei blocchi.')
    } finally {
      setPolishBusy(false)
    }
  }

  function appendDictation(noteId: string, sid: string, chunk: string) {
    const current = sectionsRef.current.find((section) => section.id === sid)?.body || ''
    if (visibleNoteId.current !== noteId) return
    const cue = detectSpokenSectionCue(chunk)
    if (cue) {
      const section = sectionsRef.current.find((item) => item.id === sid)
      if (section && section.kind === 'libera') {
        patchSavedSection(noteId, sid, {
          kind: cue,
          title: section.title.trim() || SECTION_KIND_LABEL[cue],
        })
        setRecHint(`Rilevato passaggio: ${SECTION_KIND_LABEL[cue]}`)
      }
    }
    const next = appendDictatedChunk(current, chunk)
    if (next === current) return
    patchSavedSection(noteId, sid, { body: next })
    livePolishRef.current?.notify(next)
    requestAnimationFrame(() => {
      const ta = editorRefs.current[sid]
      if (ta) {
        ta.scrollTop = ta.scrollHeight
      }
    })
  }

  function ensureLivePolish(noteId: string, sectionId: string) {
    livePolishRef.current?.cancel()
    livePolishRef.current = createLivePolishController({
      enabled: () => livePolishOn,
      online: () => online,
      onBusy: setLivePolishBusy,
      onHint: setRecHint,
      onResult: (text) => {
        if (visibleNoteId.current !== noteId) return
        patchSavedSection(noteId, sectionId, { body: text })
      },
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
    ensureLivePolish(noteId, sectionId)
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
        setMicError(msg)
        setListening(false)
        setMicLevel(0)
      },
      onWarning: (msg) => setRecHint(msg),
      onEnd: () => {
        void (async () => {
          const current = sectionsRef.current.find((item) => item.id === sectionId)?.body || ''
          let refined = refineDiscourseSpeechText(current)
          if (livePolishOn && online && refined.trim()) {
            setRecHint('Rifinisco punteggiatura e grammatica con AI…')
            try {
              const polished = await polishDiscourseText(refined)
              refined = polished.text || refined
            } catch {
              /* locale già applicato */
            }
          } else {
            await livePolishRef.current?.flush()
          }
          if (refined && visibleNoteId.current === noteId) {
            patchSavedSection(noteId, sectionId, { body: refined })
          }
          livePolishRef.current?.cancel()
          setCaptureSaving(false)
          setCaptureSectionId(null)
          setListening(false)
          setPartial('')
          setMicLevel(0)
          setRecHint(
            'Dettatura terminata: testo raffinato (tono/punteggiatura, termini JW, scritture).',
          )
        })()
      },
      onRecordingSaved: (meta) => {
        if (visibleNoteId.current !== noteId) return
        setRecordings((prev) => {
          const next = [meta, ...prev.filter((r) => r.id !== meta.id)]
          syncSectionRecordedSum(noteId, sectionId, next)
          const count = countSectionRecordings(next, sectionId)
          const sum = sumSectionRecordingDurationMs(next, sectionId)
          setRecHint(
            !online
              ? `Registrazione offline salvata (${count} clip · totale ${formatRecordingDuration(sum)}). Trascrizione in coda.`
              : `Registrazione salvata (${count} clip · totale ${formatRecordingDuration(sum)}). Obiettivo minuti invariato.`,
          )
          return next
        })
        if (!online) {
          enqueueTranscription(meta.id, noteId, 'In attesa di rete')
          setQueueCount(listPendingTranscriptions().length)
        }
      },
      onRecordingError: (msg) => setRecHint(msg),
    })
    setListening(true)
    if (!online) {
      setRecHint(
        'Modalità offline: registro l’audio in locale. Il testo automatico e la trascrizione riprendono online (coda automatica).',
      )
    }
  }

  async function playRecording(id: string, start?: number) {
    if (playId === id && start != null && playerRef.current) {
      playerRef.current.currentTime = start
      void playerRef.current.play().catch(() => {})
      return
    }
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
    requestedPlaybackTime.current = start ?? 0
    playUrlRef.current = url
    setPlayUrl(url)
    setPlayId(id)
  }

  async function removeRecording(id: string) {
    const recording = recordings.find((item) => item.id === id)
    if (recording?.iCloudRecordName && iCloudAudioAvailable()) {
      const alsoCloud = window.confirm(
        'Eliminare anche la copia su iCloud? Annulla per toglierla solo da questo dispositivo.',
      )
      if (alsoCloud) {
        try {
          await deleteICloudDiscourseRecording(recording.iCloudRecordName)
        } catch (e) {
          setRecHint(e instanceof Error ? e.message : 'Eliminazione iCloud non riuscita')
        }
      }
    }
    await deleteDiscourseRecording(id)
    setRecordings((prev) => {
      const next = prev.filter((r) => r.id !== id)
      if (recording?.sectionId && recording.discourseId) {
        syncSectionRecordedSum(recording.discourseId, recording.sectionId, next)
      }
      return next
    })
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
    a.download = meta?.fileName || `${name}.${ext}`
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
    const full =
      flattenSectionBodies(startingSections) || joinSections(startingSections)
    if (!full.trim()) {
      setPolishHint('Scrivi o detta qualcosa prima di analizzare la struttura.')
      return
    }
    if (structureBusy) return
    setStructureBusy(true)
    setPolishHint(
      `Analizzo tutto il testo (${full.trim().split(/\s+/).length} parole) in introduzione, punti e conclusione…`,
    )
    try {
      const { sections: next, source } = await structureDiscourseWithAi(full, {
        forceLocal: !online,
      })
      if (visibleNoteId.current !== note?.id || sectionsRef.current !== startingSections) {
        setPolishHint('Il discorso è cambiato. Avvia di nuovo l’analisi.')
        return
      }
      persistSections(next)
      setActiveSectionId(next[0]?.id || null)
      const outWords = flattenSectionBodies(next).split(/\s+/).filter(Boolean).length
      const inWords = full.trim().split(/\s+/).filter(Boolean).length
      setPolishHint(
        source === 'ai'
          ? `Struttura AI applicata · ${outWords}/${inWords} parole conservate. Puoi modificare i blocchi e premere Salva.`
          : online
            ? `Struttura locale · ${outWords}/${inWords} parole conservate. Puoi modificare e salvare.`
            : 'Offline: struttura locale. Contenuto conservato. Puoi modificare e salvare.',
      )
    } catch (e) {
      setPolishHint(e instanceof Error ? e.message : 'Analisi non riuscita')
    } finally {
      setStructureBusy(false)
    }
  }

  function saveRevision(sectionId: string) {
    const section = sectionsRef.current.find((item) => item.id === sectionId)
    const text = section?.revision?.text?.trim()
    if (!section || !text) {
      setPolishHint('Nessuna revisione da salvare in questo blocco.')
      return
    }
    patchSection(sectionId, {
      body: text,
      revision: { ...section.revision!, text },
    })
    setSaveHint('Revisione salvata nel testo originale del blocco.')
    window.setTimeout(() => setSaveHint(''), 2500)
  }

  async function readRecordingTranscript(id: string) {
    const blob = await getDiscourseRecordingBlob(id)
    if (!blob) throw new Error('Registrazione non trovata su questo dispositivo.')
    const recording = recordings.find((item) => item.id === id)
    const saveProgress = async (progress: NonNullable<DiscourseRecordingMeta['progress']>) => {
      const saved = await updateDiscourseRecording(id, { progress })
      if (!saved) throw new Error('La registrazione è stata rimossa.')
      setRecordings((items) => items.map((item) => item.id === id ? saved : item))
    }
    const selectedLanguage = recording?.progress?.language || transcriptLanguage
    const { text, segments } = await transcribeDiscourseAudio(blob, {
      language: selectedLanguage,
      resume: recording?.progress,
      saveProgress,
      durationMs: recording?.durationMs,
      forceDecode: Boolean(recording?.fileName),
      onProgress: (part, total, info) =>
        setRecHint(
          info
            ? `Trascrivo ${info.doneMin}/${info.totalMin} min (pezzo ${part}/${total})…`
            : `Trascrivo parte ${part} di ${total}…`,
        ),
      onWait: (seconds) =>
        setRecHint(`Limite AI: attendo ${seconds}s poi riprendo (progresso salvato)…`),
    })
    const saved = await updateDiscourseRecording(id, {
      transcript: text, segments, summary: undefined, translation: undefined, progress: undefined,
    })
    if (saved) setRecordings((current) => current.map((item) => item.id === id ? saved : item))
    return text
  }

  async function importRecording(file: File, sectionId: string) {
    if (!note || importing) return
    const noteId = note.id
    setImporting(true)
    try {
      const durationMs = await readMediaDurationMs(file)
      const saved = await saveDiscourseRecording({
        discourseId: noteId, sectionId, blob: file, fileName: file.name,
        title: file.name.replace(/\.[^.]+$/, ''),
        durationMs,
      })
      if (visibleNoteId.current === noteId) {
        setRecordings((items) => {
          const next = [saved, ...items]
          syncSectionRecordedSum(noteId, sectionId, next)
          return next
        })
        setRecHint('File importato. Premi «Trascrivi» per elaborarlo.')
      }
    } catch {
      setRecHint('Impossibile salvare il file su questo dispositivo.')
    } finally {
      setImporting(false)
    }
  }

  function readMediaDurationMs(file: File): Promise<number | undefined> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio')
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        const ms = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined
        URL.revokeObjectURL(url)
        resolve(ms && ms > 0 ? ms : undefined)
      }
      el.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(undefined)
      }
      el.src = url
    })
  }

  function exportTranscript(recording: DiscourseRecordingMeta, format: 'txt' | 'srt' | 'summary') {
    const timecode = (seconds: number) => new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 23).replace('.', ',')
    const segments = recording.segments || []
    const content = format === 'srt'
      ? segments.map((segment, index) => {
          const end = segments[index + 1]?.start ?? Math.max(segment.start + 1, (recording.durationMs ?? 0) / 1000)
          return `${index + 1}\n${timecode(segment.start)} --> ${timecode(end)}\n${segment.speaker}: ${segment.text}`
        }).join('\n\n')
      : format === 'summary' ? recording.summary : recording.transcript
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${(recording.title || 'trascrizione').replace(/[^\p{L}\p{N} _-]/gu, '-')}${format === 'summary' ? '-riassunto' : ''}.${format === 'srt' ? 'srt' : 'txt'}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function analyzeAudio(recording: DiscourseRecordingMeta, prompt: string, field?: 'summary' | 'translation') {
    if (!recording.transcript || analysisBusy) return
    setAnalysisBusy(true)
    setRecHint('')
    try {
      const parts = recording.transcript.match(/[\s\S]{1,14000}(?:\s|$)|[\s\S]{1,14000}/g) || []
      const answers: string[] = []
      for (const context of parts) {
        answers.push(
          await askAi({
            prompt,
            context,
            maxTokens: 2048,
            promptCharLimit: 4000,
            contextCharLimit: 16_000,
            concise: false,
          }),
        )
      }
      const combined = answers.join('\n\n')
      const answer = answers.length === 1 || field === 'translation' || combined.length > 16_000
        ? combined
        : await askAi({
            prompt: `${prompt}\nUnisci i risultati parziali qui sotto ed elimina le ripetizioni.`,
            context: combined,
            maxTokens: 2048,
            promptCharLimit: 4000,
            contextCharLimit: 20_000,
            concise: false,
          })
      if (field) {
        const saved = await updateDiscourseRecording(recording.id, { [field]: answer })
        if (saved) setRecordings((items) => items.map((item) => item.id === saved.id ? saved : item))
      } else {
        setAudioAnalysis({ id: recording.id, answer })
      }
    } catch (error) {
      setRecHint(error instanceof Error ? error.message : 'Analisi non riuscita.')
    } finally {
      setAnalysisBusy(false)
    }
  }

  async function transcribeRecording(id: string) {
    if (transcribeBusyId) return
    setTranscribeBusyId(id)
    setRecHint('Trascrivo la registrazione…')
    try {
      const text = await readRecordingTranscript(id)
      if (text && online) {
        setRecHint('Rifinisco punteggiatura della trascrizione con AI…')
        try {
          const polished = await polishDiscourseText(text)
          const saved = await updateDiscourseRecording(id, { transcript: polished.text })
          if (saved) setRecordings((items) => items.map((item) => (item.id === saved.id ? saved : item)))
        } catch {
          /* testo locale già raffinato in transcribeDiscourseAudio */
        }
      }
      setRecHint(
        'Trascrizione salvata e raffinata (tono/punteggiatura, termini JW, scritture). Modifica e Salva, o confronta con il testo del blocco.',
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Trascrizione non riuscita'
      if (note && (!online || /rete|offline|connessione/i.test(msg))) {
        enqueueTranscription(id, note.id, msg)
        setQueueCount(listPendingTranscriptions().length)
        setRecHint(`${msg} · Aggiunta alla coda: ritento online.`)
      } else {
        setRecHint(msg)
      }
    } finally {
      setTranscribeBusyId(null)
    }
  }

  async function runPracticeCompare(section: DiscourseSection) {
    const recording = recordings.find((item) => item.sectionId === section.id && item.transcript)
    if (!recording?.transcript) {
      setRecHint('Serve una trascrizione collegata a questo blocco per confrontare la prova a voce.')
      return
    }
    const aligned = alignPracticeTexts(section.body, recording.transcript)
    setPracticeDiff({
      sectionId: section.id,
      summary: aligned.summary,
      missing: missingWordsPreview(aligned.items),
      items: aligned.items.slice(0, 80),
    })
    setRecHint(aligned.summary)
  }

  useEffect(() => {
    setQueueCount(listPendingTranscriptions().length)
  }, [note?.id, recordings.length])

  useEffect(() => {
    if (!online || !note) return
    let cancelled = false
    void processTranscriptionQueue({
      online,
      discourseId: note.id,
      onProgress: setRecHint,
      transcribe: async (recordingId) => {
        if (cancelled) return
        await readRecordingTranscript(recordingId)
      },
    }).then((done) => {
      if (cancelled || !done) return
      setQueueCount(listPendingTranscriptions().length)
      setRecHint(`Coda trascrizioni: ${done} completate automaticamente.`)
    })
    return () => { cancelled = true }
  }, [online, note?.id])

  async function linkRecording(id: string, sectionId: string) {
    try {
      const previous = recordings.find((item) => item.id === id)
      const saved = await updateDiscourseRecording(id, { sectionId })
      if (!saved) return
      setRecordings((current) => {
        const next = current.map((item) => (item.id === id ? saved : item))
        syncSectionRecordedSum(saved.discourseId, sectionId, next)
        if (previous?.sectionId && previous.sectionId !== sectionId) {
          syncSectionRecordedSum(saved.discourseId, previous.sectionId, next)
        }
        return next
      })
    } catch {
      setRecHint('Impossibile collegare la registrazione al blocco.')
    }
  }

  async function saveTranscriptEdit(recording: DiscourseRecordingMeta, text: string, segments?: TranscriptSegment[]) {
    try {
      const saved = await updateDiscourseRecording(recording.id, {
        transcript: text, segments, summary: undefined, translation: undefined,
      })
      if (!saved) throw new Error('Registrazione non trovata.')
      setRecordings((items) => items.map((item) => item.id === saved.id ? saved : item))
      setAudioAnalysis((current) => current?.id === saved.id ? null : current)
      setRecHint('Correzione salvata.')
    } catch {
      setRecHint('Impossibile salvare la correzione.')
    }
  }

  function insertTranscriptPassage(recording: DiscourseRecordingMeta, text: string) {
    if (!recording.sectionId) return
    const section = sectionsRef.current.find((item) => item.id === recording.sectionId)
    if (section) patchSavedSection(recording.discourseId, section.id, {
      body: [section.body.trim(), text.trim()].filter(Boolean).join('\n\n'),
    })
  }

  function transcriptScriptures(text: string) {
    return findScriptureRefsInText(text).map((reference) => {
      const doubtful = reference.chapter > chaptersForBook(reference.bookNum)
        || (reference.verseEnd ?? reference.verse) > 176
        || (reference.verseEnd != null && reference.verseEnd < reference.verse)
      return (
        <button
          key={`${reference.index}-${reference.label}-${reference.matched || 'atom'}`}
          type="button"
          className="btn secondary small"
          onClick={() => scriptureAssistRef.current?.openRef(reference)}
        >
          {reference.label}{doubtful ? ' · Da verificare' : ' · Verifica'}
        </button>
      )
    })
  }

  async function suggestTimingCuts(section: DiscourseSection) {
    if (analysisBusy || section.recordedDurationMs == null) return
    const source = section.revision?.text || section.body
    if (!source.trim()) return
    setAnalysisBusy(true)
    try {
      const text = await askAi({
        prompt: `Il blocco dura ${formatRecordingDuration(section.recordedDurationMs)} e l’obiettivo è ${section.minutes} minuti. Indica in italiano quali ripetizioni o frasi accorciare, preservando il senso e le scritture. Cita i passaggi da tagliare.`,
        context: source,
      })
      setTimingAdvice({ sectionId: section.id, text })
    } catch (error) {
      setRecHint(error instanceof Error ? error.message : 'Suggerimenti non disponibili.')
    } finally {
      setAnalysisBusy(false)
    }
  }

  async function uploadRecordingToICloud(recording: DiscourseRecordingMeta) {
    setRecHint('Carico audio su iCloud…')
    try {
      const saved = await uploadDiscourseRecordingToICloud(recording)
      setRecordings((items) => items.map((item) => (item.id === saved.id ? saved : item)))
      setRecHint('Audio salvato su iCloud. Lo ritrovi sugli altri dispositivi con lo stesso Apple ID.')
    } catch (e) {
      setRecHint(e instanceof Error ? e.message : 'Upload iCloud non riuscito')
    }
  }

  async function downloadRecordingFromICloud(recording: DiscourseRecordingMeta) {
    if (!recording.iCloudRecordName) {
      setRecHint('Questa registrazione non ha un riferimento iCloud.')
      return
    }
    setRecHint('Scarico audio da iCloud…')
    try {
      const saved = await downloadICloudDiscourseAudio(recording.iCloudRecordName)
      setRecordings((items) => {
        const without = items.filter((item) => item.id !== saved.id && item.iCloudRecordName !== saved.iCloudRecordName)
        return [saved, ...without]
      })
      setRecHint('Audio scaricato su questo dispositivo.')
    } catch (e) {
      setRecHint(e instanceof Error ? e.message : 'Download iCloud non riuscito')
    }
  }

  async function syncAllRecordingsToICloud() {
    if (!note) return
    setRecHint('Sincronizzo gli audio con iCloud…')
    try {
      const result = await syncDiscourseRecordingsToICloud(recordings, (done, total) => {
        setRecHint(`Carico su iCloud ${done}/${total}…`)
      })
      const local = await listDiscourseRecordings(note.id)
      setRecordings(await mergeLocalAndICloudRecordings(note.id, local))
      setRecHint(result.message)
    } catch (e) {
      setRecHint(e instanceof Error ? e.message : 'Sync audio iCloud non riuscita')
    }
  }

  function renderRecording(recording: DiscourseRecordingMeta, unlinked: boolean) {
    const speakers = [...new Set(recording.segments?.map((segment) => segment.speaker) || [])]
    const transcriptLocked = !!transcribeBusyId || polishBusy || analysisBusy
    const remoteOnly = Boolean(recording.iCloudRemoteOnly)
    const icloudOk = iCloudAudioAvailable()
    return (
      <div className="stack list-item" key={recording.id}>
        <strong>{recording.title || new Date(recording.createdAt).toLocaleString('it-IT')}</strong>
        <small>{formatRecordingDuration(recording.durationMs)}</small>
        {recording.iCloudSyncedAt && !remoteOnly && (
          <small>Su iCloud · {new Date(recording.iCloudSyncedAt).toLocaleString('it-IT')}</small>
        )}
        {remoteOnly && <small>Solo su iCloud — scaricala per ascoltarla qui</small>}
        {recording.progress && <small>Parti salvate {recording.progress.nextPart}/{recording.progress.total}</small>}
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
          {!remoteOnly && (
            <button className="btn secondary small" type="button" onClick={() => void playRecording(recording.id)}>
              <Play size={14} /> {playId === recording.id ? 'Chiudi' : 'Ascolta'}
            </button>
          )}
          {!remoteOnly && (
            <button className="btn secondary small" type="button"
              disabled={!online || !!transcribeBusyId || polishBusy}
              onClick={() => void transcribeRecording(recording.id)}>
              <Subtitles size={14} />
              {transcribeBusyId === recording.id ? 'Trascrivo…' : recording.progress ? 'Riprendi' : recording.transcript ? 'Ritrascrivi' : 'Trascrivi'}
            </button>
          )}
          {icloudOk && remoteOnly && recording.iCloudRecordName && (
            <button className="btn secondary small" type="button"
              onClick={() => void downloadRecordingFromICloud(recording)}>
              <CloudDownload size={14} /> Scarica da iCloud
            </button>
          )}
          {icloudOk && !remoteOnly && !recording.iCloudSyncedAt && (
            <button className="btn secondary small" type="button"
              onClick={() => void uploadRecordingToICloud(recording)}>
              <CloudUpload size={14} /> Salva su iCloud
            </button>
          )}
          {!remoteOnly && (
            <button className="btn secondary small" type="button" aria-label="Scarica registrazione"
              onClick={() => void downloadRecording(recording.id)}>
              <Download size={14} />
            </button>
          )}
          <button className="btn secondary small" type="button" aria-label="Elimina registrazione"
            disabled={polishBusy || transcribeBusyId === recording.id}
            onClick={() => void removeRecording(recording.id)}>
            <Trash2 size={14} />
          </button>
        </div>
        {recording.transcript && (
            <details className="stack" open>
            <summary>Leggi, modifica e analizza la trascrizione</summary>
            <label className="field">
              <span>Velocità di ascolto</span>
              <select value={playbackRate} onChange={(event) => {
                const rate = Number(event.target.value)
                setPlaybackRate(rate)
                if (playerRef.current) playerRef.current.playbackRate = rate
              }}>
                <option value={0.75}>0,75×</option><option value={1}>1×</option><option value={1.25}>1,25×</option>
              </select>
            </label>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault()
                const text = String(new FormData(event.currentTarget).get('fullTranscript')).trim()
                if (!text) return
                // Testo intero modificato: un solo segmento per restare coerenti
                void saveTranscriptEdit(recording, text, [
                  { start: 0, speaker: speakers[0] || 'Relatore 1', text },
                ])
              }}
            >
              <label className="field">
                <span>Trascrizione completa (modificabile)</span>
                <textarea
                  key={`full-${recording.id}-${recording.transcript.length}`}
                  name="fullTranscript"
                  className="discourse-editor"
                  defaultValue={recording.transcript}
                  aria-label="Trascrizione completa"
                  required
                  rows={8}
                />
              </label>
              <div className="row discourse-recording-actions">
                <button className="btn accent small" type="submit" disabled={transcriptLocked}>
                  <Save size={14} /> Salva trascrizione
                </button>
                {!unlinked && (
                  <button
                    type="button"
                    className="btn secondary small"
                    onClick={() => insertTranscriptPassage(recording, recording.transcript || '')}
                  >
                    Usa nel blocco
                  </button>
                )}
              </div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {transcriptScriptures(recording.transcript)}
              </div>
            </form>
            {!!speakers.length && (
              <form className="stack" onSubmit={(event) => {
                event.preventDefault()
                const values = new FormData(event.currentTarget)
                const from = String(values.get('speaker'))
                const to = String(values.get('newName')).trim()
                if (!to || from === to) return
                const segments = recording.segments?.map((segment) =>
                  segment.speaker === from ? { ...segment, speaker: to } : segment)
                void saveTranscriptEdit(recording, recording.transcript || '', segments)
              }}>
                <label>Relatore <select name="speaker">{speakers.map((speaker) => <option key={speaker}>{speaker}</option>)}</select></label>
                <input name="newName" list={`speakers-${recording.id}`} aria-label="Nuovo nome del relatore" required maxLength={60} />
                <datalist id={`speakers-${recording.id}`}>{speakers.map((speaker) => <option key={speaker} value={speaker} />)}</datalist>
                <button className="btn secondary small" disabled={transcriptLocked}>Rinomina o unisci relatore</button>
              </form>
            )}
            {!!recording.segments?.length && recording.segments.length > 1 && (
              <details>
                <summary>Passaggi timed ({recording.segments.length})</summary>
                {recording.segments.map((segment, index) => (
                  <div className="stack" key={`${segment.start}-${index}`}>
                    <button type="button" className="btn secondary small"
                      onClick={() => void playRecording(recording.id, segment.start)}>
                      {formatTime(Math.floor(segment.start))} · {segment.speaker}
                    </button>
                    <form className="stack" onSubmit={(event) => {
                      event.preventDefault()
                      const text = String(new FormData(event.currentTarget).get('passage')).trim()
                      if (!text) return
                      const segments = recording.segments?.map((item, position) =>
                        position === index ? { ...item, text } : item)
                      if (segments) {
                        void saveTranscriptEdit(
                          recording,
                          segments.map((item) => item.text).join('\n'),
                          segments,
                        )
                      }
                    }}>
                      <textarea
                        key={segment.text}
                        name="passage"
                        defaultValue={segment.text}
                        aria-label="Testo del passaggio"
                        required
                        rows={3}
                      />
                      <div className="row discourse-recording-actions">
                        <button className="btn secondary small" disabled={transcriptLocked}>
                          Salva passaggio
                        </button>
                        {!unlinked && (
                          <button
                            type="button"
                            className="btn secondary small"
                            onClick={() => insertTranscriptPassage(recording, segment.text)}
                          >
                            Usa nel blocco
                          </button>
                        )}
                        {transcriptScriptures(segment.text)}
                      </div>
                    </form>
                  </div>
                ))}
              </details>
            )}
            <div className="row discourse-recording-actions">
              <button type="button" className="btn secondary small" onClick={() => exportTranscript(recording, 'txt')}>TXT</button>
              {!!recording.segments?.length && <button type="button" className="btn secondary small" onClick={() => exportTranscript(recording, 'srt')}>SRT</button>}
              <button type="button" className="btn secondary small" disabled={!online || analysisBusy}
                onClick={() => void analyzeAudio(recording, 'Riassumi in italiano la trascrizione fornita. Elenca i punti chiave e i riferimenti biblici citati, se presenti.', 'summary')}>
                Riassunto AI
              </button>
              <button type="button" className="btn secondary small" disabled={!online || analysisBusy}
                onClick={() => void analyzeAudio(recording, `Traduci fedelmente la trascrizione in ${language === 'E' ? 'inglese' : 'italiano'} e restituisci solo la traduzione.`, 'translation')}>
                Traduci in {language === 'E' ? 'inglese' : 'italiano'}
              </button>
            </div>
            {recording.summary && <><h4>Riassunto</h4><p>{recording.summary}</p><button type="button" className="btn secondary small" onClick={() => exportTranscript(recording, 'summary')}>Scarica riassunto</button></>}
            {recording.translation && <><h4>Traduzione</h4><p>{recording.translation}</p></>}
            <form className="stack" onSubmit={(event) => {
              event.preventDefault()
              const question = String(new FormData(event.currentTarget).get('question') || '').trim()
              if (question) void analyzeAudio(recording, `Rispondi in italiano usando solo la trascrizione fornita. Se manca l’informazione, dillo. Domanda: ${question}`)
            }}>
              <input name="question" aria-label="Domanda sulla registrazione" placeholder="Una domanda sulla registrazione" required maxLength={500} />
              <button type="submit" className="btn secondary small" disabled={!online || analysisBusy}>
                {analysisBusy ? 'Elaborazione…' : 'Chiedi all’AI'}
              </button>
            </form>
            {audioAnalysis?.id === recording.id && <p aria-live="polite">{audioAnalysis.answer}</p>}
          </details>
        )}
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
    setSaveHint('')
  }

  function saveDiscourse() {
    if (!note) return
    const title = titleDraft.trim() || 'Nuovo discorso'
    const nextSections = sectionsRef.current
    setTitleDraft(title)
    updateNote(note.id, {
      title,
      sections: nextSections,
      body: joinSections(nextSections),
      estimatedMinutes: totalMinutes(nextSections),
    })
    setSaveHint('Discorso salvato.')
    window.setTimeout(() => setSaveHint(''), 2500)
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
        { id: uid('ref'), prompt: 'Testo discorso', response: body },
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
              <h2>Testo, dettatura e scritture</h2>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {note && (
                <button className="btn accent" type="button" onClick={saveDiscourse} disabled={captureSaving}>
                  <Save size={16} /> Salva
                </button>
              )}
              <button className="btn secondary" type="button" onClick={createNew} disabled={captureSectionId != null}>
                <Plus size={16} /> Nuovo
              </button>
            </div>
          </div>

          {!online && (
            <p className="muted" style={{ margin: '0 0 0.75rem' }}>
              <WifiOff size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              Offline: discorso e blocchi ok. AI remota no; versetti solo da cache/pacchetto.
            </p>
          )}
          {saveHint && <p className="muted" style={{ margin: '0 0 0.75rem' }}>{saveHint}</p>}
          {queueCount > 0 && (
            <p className="muted" style={{ margin: '0 0 0.75rem' }}>
              Coda trascrizioni: {queueCount} in attesa
              {online ? ' · elaborazione automatica attiva' : ' · riprende online'}
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
                <textarea
                  id="discorso-title"
                  className="discourse-title-input"
                  rows={2}
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value)
                    updateNote(note.id, { title: e.target.value })
                  }}
                  placeholder={'Es. Rafforzare la fede\ncome Abramo'}
                />
              </div>

              <div className="row discourse-meta-row">
                <strong>
                  Obiettivo totale · {formatTime(sections.reduce((sum, section) => sum + sectionDurationSeconds(section), 0))}
                  {recordings.some((item) => item.durationMs)
                    ? ` · Registrato ${formatRecordingDuration(recordings.reduce((sum, item) => sum + (item.durationMs || 0), 0))}`
                    : ''}
                </strong>
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
                  <label className="row discourse-auto-label" title="Corregge grammatica e punteggiatura mentre detta">
                    <input
                      type="checkbox"
                      checked={livePolishOn}
                      onChange={(e) => setLivePolishOn(e.target.checked)}
                    />
                    Sistema mentre detta{livePolishBusy ? '…' : ''}
                  </label>
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

              <details className="jw-view-index">
                <summary>Indice dei blocchi</summary>
                <nav aria-label="Blocchi del discorso">
                  {sections.map((section, index) => <button key={section.id} type="button" className="btn secondary small"
                    onClick={() => {
                      setBlockViews((current) => ({ ...current, [section.id]: { ...current[section.id], collapsed: false } }))
                      document.getElementById(`discourse-block-${section.id}`)?.scrollIntoView({ block: 'start' })
                    }}>
                    {section.title || `Blocco ${index + 1}`} · {formatTime(sectionDurationSeconds(section))}
                    {recordings.some((item) => item.sectionId === section.id && item.transcript) && ' · Trascritto'}
                  </button>)}
                </nav>
              </details>
              {sections.map((s, idx) => {
                const view = blockViews[s.id] || {}
                const tab = view.tab ?? 0
                const setView = (patch: typeof view) => setBlockViews((current) => ({
                  ...current, [s.id]: { ...current[s.id], ...patch },
                }))
                return (
                <div
                  key={s.id}
                  id={`discourse-block-${s.id}`}
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
                      <label className="row" style={{ gap: 4 }}>
                        <span className="muted">Obiettivo (min)</span>
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
                      </label>
                      {(() => {
                        const clipCount = countSectionRecordings(recordings, s.id)
                        const recordedMs = sumSectionRecordingDurationMs(recordings, s.id) || s.recordedDurationMs
                        if (!recordedMs) return null
                        return (
                          <span>
                            <Timer size={14} /> Registrato {formatRecordingDuration(recordedMs)}
                            {clipCount > 1 ? ` · ${clipCount} clip` : clipCount === 1 ? ' · 1 clip' : ''}
                            {recordedMs > s.minutes * 60_000
                              ? ` · Oltre obiettivo di ${formatRecordingDuration(recordedMs - s.minutes * 60_000)}`
                              : ` · Obiettivo ${s.minutes} min`}
                          </span>
                        )
                      })()}
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
                  <button type="button" className="btn secondary small" aria-expanded={!view.collapsed}
                    disabled={captureSectionId === s.id && listening}
                    onClick={() => setView({ collapsed: !view.collapsed })}>
                    {view.collapsed ? 'Apri blocco' : 'Comprimi blocco'}
                  </button>
                  <div hidden={view.collapsed} className="stack discourse-block-content">
                  {s.recordedDurationMs != null && s.recordedDurationMs > s.minutes * 60_000 && (
                    <button type="button" className="btn secondary small" disabled={!online || analysisBusy || !(s.revision?.text || s.body).trim()}
                      onClick={() => void suggestTimingCuts(s)}>Suggerisci tagli</button>
                  )}
                  {timingAdvice?.sectionId === s.id && <p>{timingAdvice.text}</p>}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <button
                      className={`btn small ${captureSectionId === s.id && listening ? 'danger' : 'accent'}`}
                      type="button"
                      disabled={!captureOk || captureSaving || structureBusy || (listening && captureSectionId !== s.id)}
                      onClick={() => toggleMic(s.id)}
                    >
                      {listening && captureSectionId === s.id
                        ? <><MicOff size={16} /> Ferma</>
                        : <><Mic size={16} /> {captureSaving && captureSectionId === s.id ? 'Salvo…' : countSectionRecordings(recordings, s.id) ? 'Aggiungi registrazione' : 'Detta e registra'}</>}
                    </button>
                    <button
                      type="button"
                      className="btn secondary small"
                      disabled={!recordings.some((item) => item.sectionId === s.id && item.transcript)}
                      onClick={() => runPracticeCompare(s)}
                    >
                      Confronta prova↔testo
                    </button>
                  </div>
                  {listening && captureSectionId === s.id && (
                    <>
                      {partial && <p className="muted discourse-partial">In corso · {partial}</p>}
                      <div className="mic-level" aria-hidden>
                        <span style={{ width: `${Math.round(micLevel * 100)}%` }} />
                      </div>
                    </>
                  )}
                  {practiceDiff?.sectionId === s.id && (
                    <div className="stack">
                      <p className="muted" style={{ margin: 0 }}>{practiceDiff.summary}</p>
                      {!!practiceDiff.missing.length && (
                        <p className="muted" style={{ margin: 0 }}>
                          Saltate: {practiceDiff.missing.join(', ')}
                          {practiceDiff.missing.length >= 12 ? '…' : ''}
                        </p>
                      )}
                      <div className="discourse-practice-diff" aria-label="Differenze prova">
                        {practiceDiff.items.map((item, index) => (
                          <span key={`${item.type}-${index}`} className={item.type}>
                            {item.type === 'missing' ? item.expected : item.actual || item.expected}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="discourse-version-controls">
                    <div className="discourse-tabs" role="group" aria-label="Versioni del blocco">
                      {discourseTabs.map((label, index) => (
                        <button key={label} type="button" className="btn small" aria-pressed={tab === index}
                          onClick={() => setView({ tab: index, compare: view.compare === index ? undefined : view.compare })}>{label}</button>
                      ))}
                    </div>
                    <label className="discourse-compare-select">Confronta con
                      <select value={view.compare ?? ''} onChange={(event) => setView({ compare: event.target.value === '' ? undefined : Number(event.target.value) })}>
                        <option value="">Una versione</option>
                        {discourseTabs.map((label, index) => index !== tab && <option key={label} value={index}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="discourse-comparison" data-compare={view.compare != null}>
                    <div className="stack discourse-version" data-active={tab === 0} data-paired={view.compare === 0}>
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
                      {(s.body.trim() || (listening && captureSectionId === s.id && partial.trim())) && (
                        <>
                          <DiscourseLivePreview
                            text={
                              listening && captureSectionId === s.id && partial.trim()
                                ? `${s.body.trimEnd()}${s.body.trim() ? ' ' : ''}${partial.trim()}`
                                : s.body
                            }
                            onOpenRef={(ref, anchor) => {
                              setActiveSectionId(s.id)
                              scriptureAssistRef.current?.openRef(ref, anchor)
                            }}
                            emptyLabel=""
                          />
                          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            {transcriptScriptures(
                              listening && captureSectionId === s.id && partial.trim()
                                ? `${s.body.trimEnd()}${s.body.trim() ? ' ' : ''}${partial.trim()}`
                                : s.body,
                            )}
                          </div>
                        </>
                      )}
                      <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
                        <button
                          className="btn accent small"
                          type="button"
                          onClick={saveDiscourse}
                          disabled={captureSaving}
                        >
                          <Save size={14} /> Salva discorso
                        </button>
                      </div>
                    </div>
                    <div className="stack discourse-comparison-result discourse-version" data-active={tab === 1} data-paired={view.compare === 1}>
                      <strong>{s.revision?.source === 'local' ? 'Revisione locale' : 'Versione sistemata con AI'}</strong>
                      {s.revision?.text ? (
                        <>
                          <textarea
                            className="discourse-editor"
                            aria-label="Testo revisione modificabile"
                            rows={idx === 0 ? 8 : 6}
                            value={s.revision.text}
                            onFocus={() => setActiveSectionId(s.id)}
                            onChange={(e) => {
                              setActiveSectionId(s.id)
                              patchSection(s.id, {
                                revision: {
                                  ...s.revision!,
                                  text: e.target.value,
                                },
                              })
                            }}
                          />
                          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                            <button
                              type="button"
                              className="btn accent small"
                              disabled={captureSaving || !s.revision.text.trim()}
                              onClick={() => saveRevision(s.id)}
                            >
                              <Save size={14} /> Salva nel testo originale
                            </button>
                            <button
                              type="button"
                              className="btn secondary small"
                              disabled={polishBusy || listening || captureSaving || !!transcribeBusyId || structureBusy}
                              onClick={() => void runPolish(s.id)}
                            >
                              {polishBusy ? 'Sistemo…' : 'Sistema di nuovo'}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="muted">Premi «Sistema ora» per confrontare la revisione, poi puoi modificarla e salvarla.</p>
                          <button
                            type="button"
                            className="btn secondary small"
                            disabled={polishBusy || listening || captureSaving || !!transcribeBusyId || structureBusy}
                            onClick={() => void runPolish(s.id)}
                          >
                            {polishBusy ? 'Sistemo…' : 'Sistema ora'}
                          </button>
                        </>
                      )}
                      {s.revision?.recordingId && <small>{recordings.find((item) => item.id === s.revision?.recordingId)?.title}</small>}
                    </div>
                    <div className="stack discourse-comparison-result discourse-version" data-active={tab === 2} data-paired={view.compare === 2}>
                      <strong>Trascrizione audio</strong>
                      <details>
                        <summary>Lingua e importazione</summary>
                      <label className="field">
                        <span>Lingua della trascrizione</span>
                        <select value={transcriptLanguage} onChange={(event) => setTranscriptLanguage(event.target.value)}>
                          <option value="auto">Rileva automaticamente</option>
                          <option value="I">Italiano</option><option value="E">Inglese</option>
                          <option value="S">Spagnolo</option><option value="F">Francese</option>
                          <option value="D">Tedesco</option><option value="P">Portoghese</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{importing ? 'Importazione…' : 'Importa audio o video'}</span>
                        <input type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.webm,.ogg,.mov"
                          disabled={importing} onChange={(event) => {
                            const file = event.target.files?.[0]
                            event.target.value = ''
                            if (file) void importRecording(file, s.id)
                          }} />
                      </label>
                      </details>
                      {recordings.filter((item) => item.sectionId === s.id).map((item) =>
                        renderRecording(item, false),
                      )}
                      {!recordings.some((item) => item.sectionId === s.id) && (
                        <p className="muted">Registra in questo blocco per trascrivere l’audio.</p>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              )})}

              {listening && captureSectionId && (
                <div className="discourse-capture-bar" role="region" aria-label="Registrazione in corso">
                  <div><strong>Registrazione · {formatTime(captureSeconds)}</strong>
                    {partial && <p>{partial}</p>}</div>
                  <button type="button" className="btn danger" onClick={() => toggleMic(captureSectionId)}>
                    <MicOff size={16} /> Ferma
                  </button>
                </div>
              )}
              {playId && playUrl && !listening && (
                <div className="discourse-capture-bar" role="region" aria-label="Lettore registrazione">
                  <video key={playUrl} ref={playerRef} src={playUrl} controls autoPlay playsInline
                    onLoadedMetadata={(event) => {
                      event.currentTarget.currentTime = requestedPlaybackTime.current
                      event.currentTarget.playbackRate = playbackRate
                    }}
                    style={{ width: '100%', minWidth: 0, maxHeight: recordings.find((item) => item.id === playId)?.mimeType.startsWith('video/') ? 180 : 54 }} />
                  <button type="button" className="btn secondary small" onClick={() => void playRecording(playId)}>Chiudi</button>
                </div>
              )}

              <details>
                <summary>Azioni del discorso</summary>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={polishBusy || listening || captureSaving || !!transcribeBusyId || structureBusy}
                  onClick={() => void runPolish()}
                >
                  <Sparkles size={16} />{' '}
                  {polishBusy ? 'Sistemo…' : 'Sistema tutti i blocchi'}
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
                  className="btn secondary"
                  type="button"
                  onClick={() => {
                    if (!note) return
                    downloadDiscoursePreachOutline(
                      { ...note, sections, title: titleDraft || note.title },
                      language,
                    )
                    setRecHint('Outline per predicare scaricato (tempi, scritture, checklist).')
                  }}
                >
                  <Download size={16} /> Outline predica
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
              </details>

              {micError && <p className="error-text">{micError}</p>}
              {recHint && <p className="muted">{recHint}</p>}
              {iCloudAudioAvailable() && recordings.some((r) => !r.iCloudSyncedAt && !r.iCloudRemoteOnly) && (
                <div className="row" style={{ marginTop: '0.5rem' }}>
                  <button className="btn secondary small" type="button" onClick={() => void syncAllRecordingsToICloud()}>
                    <Cloud size={14} /> Carica audio locali su iCloud
                  </button>
                </div>
              )}
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
                    ? 'Microfono attivo: testo automatico; pause corte → virgola, pause più lunghe → punto. Audio salvato in locale.'
                    : 'Offline: sto registrando l’audio in locale. Al termine riascoltalo o attendi la rete per trascrivere.'}
                </p>
              )}

              {recordings.some((item) => !sections.some((section) => section.id === item.sectionId)) && (
                <div className="stack">
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>Registrazioni da collegare</h3>
                    {iCloudAudioAvailable() && (
                      <button
                        className="btn secondary small"
                        type="button"
                        onClick={() => void syncAllRecordingsToICloud()}
                      >
                        <Cloud size={14} /> Carica audio su iCloud
                      </button>
                    )}
                  </div>
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
                <div className="empty">Nessun discorso trovato.</div>
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
              text={scriptureLiveText}
              language={language}
              resetKey={note.id}
              autoOpenOnType
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
                Crea un discorso da una scheda già preparata.
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
