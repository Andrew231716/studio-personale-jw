import { useEffect, useMemo, useState } from 'react'
import { BookmarkPlus, Captions, NotebookPen, PlayCircle, Search } from 'lucide-react'
import { JwOpenButtons } from '../components/JwOpenButtons'
import {
  fetchLatestVideos,
  fetchVideoTranscript,
  searchJw,
  type LatestMediaItem,
} from '../lib/jwApi'
import { uid } from '../lib/id'
import { buildVideoStudyGuide, type VideoStudyGuide } from '../lib/videoStudyGuide'
import {
  buildTranscriptFromCues,
  cuesDurationSeconds,
  filterCuesByTimeRange,
  formatClock,
  parseTimeInput,
  type VttCue,
} from '../lib/vtt'
import { useAppStore } from '../store/useAppStore'

type Phase = 'pick' | 'transcript' | 'guide'

export function VideoStudioView() {
  const language = useAppStore((s) => s.settings.language)
  const addTopic = useAppStore((s) => s.addTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setView = useAppStore((s) => s.setView)
  const startSession = useAppStore((s) => s.startSession)
  const saveResource = useAppStore((s) => s.saveResource)

  const [query, setQuery] = useState('')
  const [paste, setPaste] = useState('')
  const [latest, setLatest] = useState<LatestMediaItem[]>([])
  const [searchHits, setSearchHits] = useState<
    Array<{ title: string; url: string; lank?: string; snippet: string }>
  >([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')

  const [videoTitle, setVideoTitle] = useState('')
  const [lank, setLank] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [allCues, setAllCues] = useState<VttCue[]>([])
  const [startMin, setStartMin] = useState('0')
  const [endMin, setEndMin] = useState('')
  const [showTimed, setShowTimed] = useState(false)
  const [guide, setGuide] = useState<VideoStudyGuide | null>(null)

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
        if (!cancelled) setLatest(items.filter((v) => v.lank))
      } catch {
        if (!cancelled) setLatest([])
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
    setGuide(null)
    try {
      const result = await fetchVideoTranscript(from, language)
      const duration = cuesDurationSeconds(result.cues)
      setVideoTitle(result.media.title || titleHint || 'Video JW')
      setLank(result.media.lank)
      setVideoUrl(result.media.url)
      setAllCues(result.cues)
      setStartMin('0')
      setEndMin(duration ? String(Math.ceil(duration / 60)) : '')
      setPhase('transcript')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trascrizione non disponibile')
    } finally {
      setBusy('')
    }
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
      const rangeLabel = `${formatClock(range.startSec)}–${formatClock(range.endSec)}`
      const built = await buildVideoStudyGuide({
        videoTitle: `${videoTitle} (${rangeLabel})`,
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
    const interest = [
      guide.summary,
      '',
      `Fonte video JW: ${videoTitle}`,
      `Intervallo trascrizione: ${rangeLabel}`,
      lank ? `lank: ${lank}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const id = addTopic(guide.title || `Studio: ${videoTitle}`, interest)
    updateTopic(id, {
      objectives: guide.objectives,
      reflections: guide.reflections,
      questions: guide.questions,
      practices: guide.practices,
      transcript: filtered.transcript,
      transcriptMeta: {
        lank,
        videoTitle,
        sourceUrl: videoUrl,
        createdAt: new Date().toISOString(),
        rangeStartSec: range.startSec,
        rangeEndSec: range.endSec,
      },
      resources: [
        {
          id: uid('res'),
          title: `${videoTitle} (${rangeLabel})`,
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
      </section>

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
              <label htmlFor="from-min">Da minuto</label>
              <input
                id="from-min"
                value={startMin}
                onChange={(e) => {
                  setStartMin(e.target.value)
                  setGuide(null)
                }}
                placeholder="0 oppure 2:30"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label htmlFor="to-min">A minuto</label>
              <input
                id="to-min"
                value={endMin}
                onChange={(e) => {
                  setEndMin(e.target.value)
                  setGuide(null)
                }}
                placeholder={totalSec ? String(Math.ceil(totalSec / 60)) : 'es. 8'}
                inputMode="decimal"
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
            <button className="chip" type="button" onClick={() => setShowTimed((v) => !v)}>
              {showTimed ? 'Testo continuo' : 'Con tempi'}
            </button>
            <button
              className="chip"
              type="button"
              onClick={() => {
                setPhase('pick')
                setGuide(null)
                setAllCues([])
              }}
            >
              Cambia video
            </button>
          </div>

          <textarea
            className="transcript-box"
            readOnly
            value={showTimed ? filtered.timedText : filtered.transcript}
            rows={14}
            placeholder="Nessun testo in questo intervallo…"
          />

          <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: '0.75rem' }}>
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
                setError(
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
        </section>
      )}

      {phase === 'guide' && guide && (
        <section className="panel">
          <h3>Guida di studio</h3>
          <p className="muted">
            Basata sull’intervallo {rangeLabel}. {guide.summary}
          </p>

          <div className="search-sections">
            <div className="search-section">
              <header className="search-section-head">
                <h4>Obiettivi</h4>
              </header>
              <ul>
                {guide.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
            <div className="search-section">
              <header className="search-section-head">
                <h4>Riflessioni</h4>
              </header>
              <ul>
                {guide.reflections.map((r) => (
                  <li key={r.id}>{r.prompt}</li>
                ))}
              </ul>
            </div>
            <div className="search-section">
              <header className="search-section-head">
                <h4>Domande</h4>
              </header>
              <ul>
                {guide.questions.map((q) => (
                  <li key={q.id}>{q.question}</li>
                ))}
              </ul>
            </div>
            <div className="search-section">
              <header className="search-section-head">
                <h4>Pratiche</h4>
              </header>
              <ul>
                {guide.practices.map((p) => (
                  <li key={p.id}>{p.action}</li>
                ))}
              </ul>
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
