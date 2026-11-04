import { useEffect, useMemo, useState } from 'react'
import {
  BookmarkPlus,
  Captions,
  Check,
  FolderOpen,
  NotebookPen,
  Pencil,
  PlayCircle,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import { NarrateButton } from '../components/NarrateButton'
import { SectionProgress } from '../components/SectionProgress'
import { TranscriptKaraoke } from '../components/TranscriptKaraoke'
import {
  fetchLatestVideos,
  fetchMediaByLank,
  fetchVideoTranscript,
  searchJw,
  type LatestMediaItem,
} from '../lib/jwApi'
import { uid } from '../lib/id'
import { buildVideoStudyGuide, type VideoStudyGuide } from '../lib/videoStudyGuide'
import {
  buildTranscriptFromCues,
  cueTimeToSeconds,
  cuesDurationSeconds,
  filterCuesByTimeRange,
  formatClock,
  parseTimeInput,
  redistributeTranscriptToCues,
  type VttCue,
} from '../lib/vtt'
import { useAppStore } from '../store/useAppStore'
import type { SavedVideoTranscript } from '../types'

type Phase = 'pick' | 'transcript' | 'guide'

export function VideoStudioView() {
  const language = useAppStore((s) => s.settings.language)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)
  const startSession = useAppStore((s) => s.startSession)
  const saveResource = useAppStore((s) => s.saveResource)
  const savedTranscripts = useAppStore((s) => s.savedVideoTranscripts)
  const saveVideoTranscript = useAppStore((s) => s.saveVideoTranscript)
  const updateVideoTranscript = useAppStore((s) => s.updateVideoTranscript)
  const removeVideoTranscript = useAppStore((s) => s.removeVideoTranscript)

  const [query, setQuery] = useState('')
  const [paste, setPaste] = useState('')
  const [latest, setLatest] = useState<LatestMediaItem[]>([])
  const [searchHits, setSearchHits] = useState<
    Array<{ title: string; url: string; lank?: string; snippet: string }>
  >([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')

  const [videoTitle, setVideoTitle] = useState('')
  const [lank, setLank] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [progressiveUrl, setProgressiveUrl] = useState('')
  const [allCues, setAllCues] = useState<VttCue[]>([])
  const [startMin, setStartMin] = useState('0')
  const [endMin, setEndMin] = useState('')
  const [showTimed, setShowTimed] = useState(false)
  const [showKaraoke, setShowKaraoke] = useState(true)
  const [guide, setGuide] = useState<VideoStudyGuide | null>(null)
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [draftTranscript, setDraftTranscript] = useState('')
  const [mediaRefreshBusy, setMediaRefreshBusy] = useState(false)

  const totalSec = useMemo(() => cuesDurationSeconds(allCues), [allCues])

  const range = useMemo(() => {
    const startSec = parseTimeInput(startMin || '0')
    const endRaw = endMin.trim()
    const endSec = endRaw ? parseTimeInput(endRaw) : totalSec || startSec
    const from = Math.min(startSec, endSec)
    const to = Math.max(startSec, endSec)
    return { startSec: from, endSec: to || totalSec }
  }, [startMin, endMin, totalSec])

  const filtered = useMemo(() => {
    if (!allCues.length) return { cues: [] as VttCue[], transcript: '', timedText: '' }
    const cues = filterCuesByTimeRange(allCues, range.startSec, range.endSec || totalSec)
    const built = buildTranscriptFromCues(cues)
    return { cues, ...built }
  }, [allCues, range.startSec, range.endSec, totalSec])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const items = await fetchLatestVideos(language)
        if (!cancelled) {
          setLatest(items.filter((v) => v.lank))
          setError('')
        }
      } catch (e) {
        if (!cancelled) {
          setLatest([])
          setError(
            e instanceof Error
              ? `Video recenti non disponibili: ${e.message}`
              : 'Video recenti non disponibili (API o rete).',
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [language])

  async function runSearch() {
    const q = query.trim()
    if (!q) return
    setBusy('search')
    setError('')
    try {
      const results = await searchJw(q, { language, filter: 'videos' })
      setSearchHits(
        results
          .filter((r) => r.lank)
          .slice(0, 12)
          .map((r) => ({
            title: r.title,
            url: r.url,
            lank: r.lank,
            snippet: r.snippet,
          })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ricerca non riuscita')
      setSearchHits([])
    } finally {
      setBusy('')
    }
  }

  async function loadTranscript(from: string, titleHint = '') {
    setBusy('transcript')
    setError('')
    setHint('')
    setGuide(null)
    setActiveSavedId(null)
    try {
      const result = await fetchVideoTranscript(from, language)
      const duration = cuesDurationSeconds(result.cues)
      setVideoTitle(result.media.title || titleHint || 'Video JW')
      setLank(result.media.lank)
      setVideoUrl(result.media.url)
      setProgressiveUrl(result.media.progressiveUrl || '')
      setAllCues(result.cues)
      setStartMin('0')
      setEndMin(duration ? String(Math.ceil(duration / 60)) : '')
      setShowKaraoke(true)
      setPhase('transcript')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trascrizione non disponibile')
    } finally {
      setBusy('')
    }
  }

  async function refreshProgressiveUrl(forLank = lank, savedId = activeSavedId) {
    const key = forLank.trim()
    if (!key || mediaRefreshBusy) return ''
    setMediaRefreshBusy(true)
    try {
      const media = await fetchMediaByLank(key, language)
      const url = media.progressiveUrl || ''
      if (url) {
        setProgressiveUrl(url)
        if (savedId) updateVideoTranscript(savedId, { progressiveUrl: url })
      }
      return url
    } catch {
      return ''
    } finally {
      setMediaRefreshBusy(false)
    }
  }

  async function openSavedTranscript(entry: SavedVideoTranscript) {
    setError('')
    setHint('')
    setGuide(null)
    setEditingTranscript(false)
    setVideoTitle(entry.title)
    setLank(entry.lank)
    setVideoUrl(entry.sourceUrl)
    setProgressiveUrl(entry.progressiveUrl || '')
    setAllCues(entry.cues || [])
    const start = entry.rangeStartSec || 0
    const end = entry.rangeEndSec || cuesDurationSeconds(entry.cues || [])
    const fmtInput = (sec: number) => {
      const m = Math.floor(sec / 60)
      const s = Math.floor(sec % 60)
      return s ? `${m}:${String(s).padStart(2, '0')}` : String(m)
    }
    setStartMin(fmtInput(start))
    setEndMin(fmtInput(end))
    setShowKaraoke(true)
    setActiveSavedId(entry.id)
    setPhase('transcript')
    setHint(`Trascrizione riaperta: ${entry.title}`)
    // URL progressive spesso scadono: rinnova sempre da lank
    if (entry.lank) {
      const url = await refreshProgressiveUrl(entry.lank, entry.id)
      if (!url && !entry.progressiveUrl) {
        setError('Audio del video non trovato. Riapri il video da jw.org o dal codice lank.')
      }
    }
  }

  function startEditTranscript() {
    setShowKaraoke(false)
    setShowTimed(false)
    setDraftTranscript(filtered.transcript)
    setEditingTranscript(true)
  }

  function cancelEditTranscript() {
    setEditingTranscript(false)
    setDraftTranscript('')
  }

  function saveTranscriptEdit() {
    const nextCues = redistributeTranscriptToCues(filtered.cues, draftTranscript)
    if (!nextCues.length) {
      setError('Niente da salvare: trascrizione vuota.')
      return
    }
    const start = range.startSec
    const end = range.endSec || totalSec
    const kept = allCues.filter((c) => {
      const cs = cueTimeToSeconds(c.start)
      const ce = cueTimeToSeconds(c.end)
      return !(ce >= start && cs <= end)
    })
    const merged = [...kept, ...nextCues].sort(
      (a, b) => cueTimeToSeconds(a.start) - cueTimeToSeconds(b.start),
    )
    setAllCues(merged)
    setEditingTranscript(false)
    setDraftTranscript('')
    setError('')
    if (activeSavedId) {
      const built = buildTranscriptFromCues(merged)
      updateVideoTranscript(activeSavedId, {
        cues: merged,
        transcript: built.transcript,
        timedText: built.timedText,
      })
      setHint('Trascrizione modificata e salvata.')
    } else {
      setHint('Trascrizione aggiornata. Tocca «Salva trascrizione qui» per tenerla.')
    }
  }

  function saveCurrentTranscript() {
    if (!allCues.length || !filtered.transcript.trim()) {
      setError('Nessuna trascrizione da salvare in questo intervallo.')
      return
    }
    const built = buildTranscriptFromCues(allCues)
    const saved = saveVideoTranscript({
      id: activeSavedId || undefined,
      title: videoTitle.trim() || 'Video JW',
      lank,
      sourceUrl: videoUrl,
      progressiveUrl: progressiveUrl || undefined,
      language,
      cues: allCues,
      transcript: built.transcript,
      timedText: built.timedText,
      rangeStartSec: range.startSec,
      rangeEndSec: range.endSec || totalSec,
    })
    setActiveSavedId(saved.id)
    setError('')
    setHint(
      `Trascrizione salvata in Video → studio · intervallo ${formatClock(saved.rangeStartSec)}–${formatClock(saved.rangeEndSec)}.`,
    )
  }

  function resetFullRange() {
    setStartMin('0')
    setEndMin(totalSec ? String(Math.ceil(totalSec / 60)) : '')
    setGuide(null)
  }

  async function createGuide() {
    if (!filtered.transcript.trim()) {
      setError('Nessun testo in questo intervallo. Controlla da/a minuto.')
      return
    }
    setBusy('guide')
    setError('')
    try {
      const built = await buildVideoStudyGuide({
        videoTitle: videoTitle.trim() || 'Video JW',
        transcript: filtered.transcript,
      })
      setGuide(built)
      setPhase('guide')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Guida non generata')
    } finally {
      setBusy('')
    }
  }

  function saveToNotebook(openSession = false) {
    if (!guide) return
    const rangeLabel = `${formatClock(range.startSec)}–${formatClock(range.endSec)}`
    const notebookTitle = videoTitle.trim() || guide.title.trim() || 'Video JW'
    const interest = [
      guide.summary,
      '',
      `Fonte video JW: ${notebookTitle}`,
      `Intervallo trascrizione: ${rangeLabel}`,
      lank ? `lank: ${lank}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const id = addTopic(notebookTitle, interest)
    updateTopic(id, {
      title: notebookTitle,
      objectives: guide.objectives,
      reflections: guide.reflections,
      questions: guide.questions,
      practices: guide.practices,
      transcript: filtered.transcript,
      transcriptMeta: {
        lank,
        videoTitle: notebookTitle,
        sourceUrl: videoUrl,
        createdAt: new Date().toISOString(),
        rangeStartSec: range.startSec,
        rangeEndSec: range.endSec,
      },
      resources: [
        {
          id: uid('res'),
          title: notebookTitle,
          url: videoUrl,
          kind: 'video',
          lank,
          notes: `Trascrizione sottotitoli jw.org · intervallo ${rangeLabel}`,
          libraryUrl: lank
            ? `jwlibrary:///finder?wtlocale=${encodeURIComponent(language)}&lank=${encodeURIComponent(lank)}`
            : undefined,
        },
      ],
      status: 'in_corso',
    })
    if (openSession) {
      startSession(id)
      setView('sessione')
    } else {
      setView('studio')
    }
  }

  const rangeLabel = `${formatClock(range.startSec)}–${formatClock(range.endSec || totalSec)}`

  return (
    <div className="stack">
      <SectionProgress section="videoStudio" />
      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Video → studio</h2>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Trascrivi un video di jw.org dai sottotitoli ufficiali e trasformalo in una guida
              personale con obiettivi, riflessioni, domande e pratiche.
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="video-paste">Link jw.org o codice lank del video</label>
          <div className="row">
            <input
              id="video-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="https://www.jw.org/finder?…&lank=pub-…_VIDEO"
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              className="btn"
              type="button"
              disabled={Boolean(busy) || !paste.trim()}
              onClick={() => void loadTranscript(paste)}
            >
              <span className="row" style={{ gap: 6 }}>
                <Captions size={16} />
                {busy === 'transcript' ? 'Trascrivo…' : 'Trascrivi'}
              </span>
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="video-q">Cerca video su jw.org</label>
          <div className="row">
            <input
              id="video-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Es. pazienza, famiglia, ministero…"
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              className="btn secondary"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void runSearch()}
            >
              <span className="row" style={{ gap: 6 }}>
                <Search size={16} />
                {busy === 'search' ? 'Cerco…' : 'Cerca'}
              </span>
            </button>
          </div>
        </div>

        {error && <p className="muted">{error}</p>}
        {hint && !error && (
          <p className="muted" style={{ marginTop: '0.65rem' }}>
            {hint}
          </p>
        )}
      </section>

      {savedTranscripts.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>Trascrizioni salvate</h3>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                Restano in Video → studio anche dopo aver cambiato sezione. Riaprile quando vuoi.
              </p>
            </div>
            <span className="badge">{savedTranscripts.length}</span>
          </div>
          <div className="list">
            {savedTranscripts.map((t) => {
              const rangeTxt = `${formatClock(t.rangeStartSec)}–${formatClock(t.rangeEndSec)}`
              const when = t.updatedAt
                ? new Date(t.updatedAt).toLocaleString('it-IT')
                : ''
              return (
                <div
                  className={`list-item${activeSavedId === t.id ? ' is-active-saved' : ''}`}
                  key={t.id}
                >
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ overflowWrap: 'anywhere' }}>{t.title}</strong>
                    <span className="badge">{rangeTxt}</span>
                  </div>
                  <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                    {(t.transcript || '').slice(0, 160)}
                    {(t.transcript || '').length > 160 ? '…' : ''}
                  </p>
                  {when && (
                    <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                      Salvata: {when}
                    </p>
                  )}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => openSavedTranscript(t)}
                    >
                      <span className="row" style={{ gap: 6 }}>
                        <FolderOpen size={14} /> Riapri
                      </span>
                    </button>
                    <JwOpenButtons
                      url={t.sourceUrl}
                      lank={t.lank}
                      language={language}
                      compact
                    />
                    <button
                      className="btn secondary small"
                      type="button"
                      aria-label={`Elimina trascrizione ${t.title}`}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Eliminare la trascrizione salvata «${t.title}» (${rangeTxt})?`,
                          )
                        ) {
                          return
                        }
                        removeVideoTranscript(t.id)
                        if (activeSavedId === t.id) setActiveSavedId(null)
                        setHint('Trascrizione eliminata da Video → studio.')
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {(searchHits.length > 0 || latest.length > 0) && phase === 'pick' && (
        <section className="panel">
          <h3>{searchHits.length ? 'Risultati video' : 'Video recenti'}</h3>
          <div className="list">
            {(searchHits.length ? searchHits : latest).map((v) => {
              const itemLank = 'lank' in v ? v.lank : undefined
              const title = v.title
              const url = v.url
              const snippet =
                'snippet' in v ? v.snippet : 'description' in v ? v.description : ''
              const hasSub = 'hasSubtitles' in v ? Boolean(v.hasSubtitles) : true
              return (
                <div className="list-item" key={`${itemLank || url}-${title}`}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <strong>{title}</strong>
                    {'duration' in v && v.duration ? (
                      <span className="badge">{String(v.duration)}</span>
                    ) : null}
                  </div>
                  {snippet ? (
                    <p className="muted" style={{ margin: 0 }}>
                      {snippet.slice(0, 180)}
                    </p>
                  ) : null}
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <JwOpenButtons url={url} lank={itemLank} language={language} compact />
                    <button
                      className="btn"
                      type="button"
                      disabled={Boolean(busy) || !itemLank || hasSub === false}
                      onClick={() => void loadTranscript(itemLank || url, title)}
                    >
                      <span className="row" style={{ gap: 6 }}>
                        <Captions size={14} /> Trascrivi
                      </span>
                    </button>
                  </div>
                  {hasSub === false && (
                    <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                      Sottotitoli non disponibili per questo video.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {(phase === 'transcript' || phase === 'guide') && allCues.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <div>
              <h3>{videoTitle}</h3>
              <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                Trascrizione dai sottotitoli ufficiali jw.org
                {lank ? ` · ${lank}` : ''}
                {totalSec ? ` · durata ${formatClock(totalSec)}` : ''}
              </p>
            </div>
            <JwOpenButtons url={videoUrl} lank={lank} language={language} compact />
          </div>

          <div className="range-picker">
            <div className="field">
              <label htmlFor="from-min">Da (minuti o m:ss)</label>
              <input
                id="from-min"
                type="text"
                value={startMin}
                onChange={(e) => {
                  // Solo cifre, due punti e punto/virgola (es. 5, 5:30, 5.5)
                  const next = e.target.value.replace(/[^\d:.,]/g, '')
                  setStartMin(next)
                  setGuide(null)
                }}
                placeholder="0 oppure 2:30"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
            <div className="field">
              <label htmlFor="to-min">A (minuti o m:ss)</label>
              <input
                id="to-min"
                type="text"
                value={endMin}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d:.,]/g, '')
                  setEndMin(next)
                  setGuide(null)
                }}
                placeholder={
                  totalSec
                    ? formatClock(totalSec).replace(/^0:/, '') || String(Math.ceil(totalSec / 60))
                    : 'es. 8:00'
                }
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </div>
            <div className="field" style={{ justifyContent: 'flex-end' }}>
              <label className="muted" style={{ visibility: 'hidden' }}>
                reset
              </label>
              <button className="btn secondary" type="button" onClick={resetFullRange}>
                Intero video
              </button>
            </div>
          </div>
          <p className="muted search-meta">
            Intervallo attivo: {rangeLabel}
            {filtered.cues.length
              ? ` · ${filtered.cues.length} segmenti`
              : ' · nessun testo in questo intervallo'}
            . Puoi scrivere i minuti (`5`) oppure `m:ss` (`5:30`).
          </p>

          <div className="chip-row">
            <button
              className={`chip${showKaraoke && !editingTranscript ? ' active' : ''}`}
              type="button"
              disabled={editingTranscript}
              onClick={() => setShowKaraoke(true)}
            >
              Voce + parole
            </button>
            <button
              className={`chip${!showKaraoke && !showTimed && !editingTranscript ? ' active' : ''}`}
              type="button"
              disabled={editingTranscript}
              onClick={() => {
                setShowKaraoke(false)
                setShowTimed(false)
              }}
            >
              Testo continuo
            </button>
            <button
              className={`chip${!showKaraoke && showTimed && !editingTranscript ? ' active' : ''}`}
              type="button"
              disabled={editingTranscript}
              onClick={() => {
                setShowKaraoke(false)
                setShowTimed(true)
              }}
            >
              Con tempi
            </button>
            <button
              className="chip"
              type="button"
              onClick={() => {
                setPhase('pick')
                setGuide(null)
                setAllCues([])
                setProgressiveUrl('')
                setEditingTranscript(false)
              }}
            >
              Cambia video
            </button>
          </div>

          <div
            className="row"
            style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: '0.35rem' }}
          >
            {!editingTranscript ? (
              <button
                type="button"
                className="btn secondary small"
                disabled={!filtered.transcript.trim()}
                onClick={startEditTranscript}
              >
                <Pencil size={14} /> Modifica trascrizione
              </button>
            ) : (
              <>
                <button type="button" className="btn small" onClick={saveTranscriptEdit}>
                  <Check size={14} /> Salva testo
                </button>
                <button
                  type="button"
                  className="btn secondary small"
                  onClick={cancelEditTranscript}
                >
                  <X size={14} /> Annulla
                </button>
              </>
            )}
          </div>

          {editingTranscript ? (
            <textarea
              className="transcript-box"
              value={draftTranscript}
              onChange={(e) => setDraftTranscript(e.target.value)}
              rows={14}
              placeholder="Modifica la trascrizione…"
            />
          ) : showKaraoke ? (
            <TranscriptKaraoke
              cues={filtered.cues}
              progressiveUrl={progressiveUrl || undefined}
              startSec={range.startSec}
              endSec={range.endSec || totalSec}
              title={videoTitle}
              onMediaError={() => {
                if (lank) void refreshProgressiveUrl(lank, activeSavedId)
              }}
            />
          ) : (
            <textarea
              className="transcript-box"
              readOnly
              value={showTimed ? filtered.timedText : filtered.transcript}
              rows={14}
              placeholder="Nessun testo in questo intervallo…"
            />
          )}

          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
            <button
              className="btn accent"
              type="button"
              disabled={!filtered.transcript.trim()}
              onClick={saveCurrentTranscript}
            >
              <span className="row" style={{ gap: 6 }}>
                <Save size={16} />
                {activeSavedId ? 'Aggiorna trascrizione salvata' : 'Salva trascrizione qui'}
              </span>
            </button>
            <button
              className="btn"
              type="button"
              disabled={Boolean(busy) || !filtered.transcript.trim()}
              onClick={() => void createGuide()}
            >
              <span className="row" style={{ gap: 6 }}>
                <NotebookPen size={16} />
                {busy === 'guide' ? 'Creo la guida…' : 'Crea guida di studio'}
              </span>
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                const saved = saveResource({
                  id: uid('res'),
                  title: `${videoTitle} (${rangeLabel})`,
                  url: videoUrl,
                  kind: 'video',
                  lank,
                  notes: `Video JW · intervallo ${rangeLabel}`,
                })
                setHint(
                  saved
                    ? `Video salvato in Da studiare: ${videoTitle} (${rangeLabel})`
                    : 'Questo video era già in Da studiare',
                )
              }}
            >
              <span className="row" style={{ gap: 6 }}>
                <BookmarkPlus size={16} /> Salva per dopo
              </span>
            </button>
          </div>
          {hint && (
            <p className="muted" style={{ margin: '0.65rem 0 0' }}>
              {hint}
            </p>
          )}
        </section>
      )}

      {phase === 'guide' && guide && (
        <section className="panel">
          <h3>{videoTitle.trim() || guide.title}</h3>
          <p className="muted" style={{ margin: '0.35rem 0 0.85rem' }}>
            Guida di studio · intervallo {rangeLabel}. Puoi modificare i campi prima di salvare.
          </p>

          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <label htmlFor="guide-summary">Riassunto</label>
              <NarrateButton text={guide.summary} compact />
            </div>
            <textarea
              id="guide-summary"
              rows={3}
              value={guide.summary}
              onChange={(e) => setGuide({ ...guide, summary: e.target.value })}
            />
          </div>

          <div className="stack" style={{ gap: '0.85rem' }}>
            <div className="field">
              <label>Obiettivi</label>
              {guide.objectives.map((o, idx) => (
                <textarea
                  key={`obj-${idx}`}
                  rows={2}
                  value={o}
                  style={{ marginBottom: 6 }}
                  onChange={(e) => {
                    const objectives = [...guide.objectives]
                    objectives[idx] = e.target.value
                    setGuide({ ...guide, objectives })
                  }}
                />
              ))}
            </div>
            <div className="field">
              <label>Riflessioni</label>
              {guide.reflections.map((r) => (
                <textarea
                  key={r.id}
                  rows={2}
                  value={r.prompt}
                  style={{ marginBottom: 6 }}
                  onChange={(e) =>
                    setGuide({
                      ...guide,
                      reflections: guide.reflections.map((x) =>
                        x.id === r.id ? { ...x, prompt: e.target.value } : x,
                      ),
                    })
                  }
                />
              ))}
            </div>
            <div className="field">
              <label>Domande</label>
              {guide.questions.map((q) => (
                <textarea
                  key={q.id}
                  rows={2}
                  value={q.question}
                  style={{ marginBottom: 6 }}
                  onChange={(e) =>
                    setGuide({
                      ...guide,
                      questions: guide.questions.map((x) =>
                        x.id === q.id ? { ...x, question: e.target.value } : x,
                      ),
                    })
                  }
                />
              ))}
            </div>
            <div className="field">
              <label>Pratiche</label>
              {guide.practices.map((p) => (
                <textarea
                  key={p.id}
                  rows={2}
                  value={p.action}
                  style={{ marginBottom: 6 }}
                  onChange={(e) =>
                    setGuide({
                      ...guide,
                      practices: guide.practices.map((x) =>
                        x.id === p.id ? { ...x, action: e.target.value } : x,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '1rem' }}>
            <button className="btn" type="button" onClick={() => saveToNotebook(false)}>
              <span className="row" style={{ gap: 6 }}>
                <NotebookPen size={16} /> Salva nel Quaderno
              </span>
            </button>
            <button className="btn secondary" type="button" onClick={() => saveToNotebook(true)}>
              <span className="row" style={{ gap: 6 }}>
                <PlayCircle size={16} /> Salva e apri Sessione
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
