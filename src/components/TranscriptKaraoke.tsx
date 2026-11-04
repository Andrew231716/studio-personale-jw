import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { buildKaraokeWords, findActiveWordIndex } from '../lib/karaokeWords'
import { formatClock, type VttCue } from '../lib/vtt'

interface Props {
  cues: VttCue[]
  progressiveUrl?: string
  startSec: number
  endSec: number
  title?: string
  /** Se l’URL fallisce (scaduto), il parent può ricaricare da lank. */
  onMediaError?: () => void
}

/**
 * Riproduce l’audio/video JW e colora le parole della trascrizione
 * in sync con i tempi dei sottotitoli ufficiali.
 */
export function TranscriptKaraoke({
  cues,
  progressiveUrl,
  startSec,
  endSec,
  title,
  onMediaError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const activeRef = useRef<HTMLSpanElement | null>(null)
  const rafRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(startSec)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const words = useMemo(() => buildKaraokeWords(cues), [cues])
  const activeIdx = useMemo(() => findActiveWordIndex(words, current), [words, current])
  const rangeEnd = Math.max(startSec, endSec)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !progressiveUrl) return
    setError('')
    setLoading(true)
    el.pause()
    setPlaying(false)
    try {
      el.load()
      el.currentTime = startSec
      setCurrent(startSec)
    } catch {
      /* ignore until metadata */
    }
    const timer = window.setTimeout(() => setLoading(false), 8000)
    return () => window.clearTimeout(timer)
  }, [progressiveUrl, startSec, cues])

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIdx])

  // Sync fluido: rAF mentre riproduce (timeupdate da solo è troppo grezzo).
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      return
    }
    const tick = () => {
      const el = videoRef.current
      if (el) {
        const t = el.currentTime
        setCurrent(t)
        if (t >= rangeEnd - 0.05) {
          el.pause()
          setPlaying(false)
          el.currentTime = rangeEnd
          setCurrent(rangeEnd)
          rafRef.current = 0
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [playing, rangeEnd])

  function onTimeUpdate() {
    const el = videoRef.current
    if (!el || playing) return
    setCurrent(el.currentTime)
  }

  async function ensureReady(el: HTMLVideoElement): Promise<void> {
    if (el.readyState >= 1) return
    setLoading(true)
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const onOk = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const onErr = () => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error('Caricamento audio fallito'))
      }
      const timer = window.setTimeout(() => {
        if (el.readyState >= 1) onOk()
        else onErr()
      }, 8000)
      const cleanup = () => {
        window.clearTimeout(timer)
        el.removeEventListener('loadedmetadata', onOk)
        el.removeEventListener('canplay', onOk)
        el.removeEventListener('error', onErr)
      }
      el.addEventListener('loadedmetadata', onOk)
      el.addEventListener('canplay', onOk)
      el.addEventListener('error', onErr)
      try {
        el.load()
      } catch {
        /* ignore */
      }
    }).finally(() => setLoading(false))
  }

  async function togglePlay() {
    const el = videoRef.current
    if (!el || !progressiveUrl) return
    setError('')
    try {
      if (playing) {
        el.pause()
        setPlaying(false)
        return
      }
      await ensureReady(el)
      if (el.currentTime < startSec || el.currentTime >= rangeEnd - 0.08) {
        el.currentTime = startSec
        setCurrent(startSec)
      }
      await el.play()
      setPlaying(true)
    } catch (e) {
      setPlaying(false)
      setLoading(false)
      setError(
        e instanceof Error
          ? `Impossibile avviare il video: ${e.message}`
          : 'Impossibile avviare il video in questa sessione.',
      )
      onMediaError?.()
    }
  }

  function restart() {
    const el = videoRef.current
    if (!el) return
    el.pause()
    el.currentTime = startSec
    setCurrent(startSec)
    setPlaying(false)
  }

  if (!progressiveUrl) {
    return (
      <p className="muted" style={{ margin: '0.65rem 0 0' }}>
        Audio del video non disponibile qui. Prova a riaprire il video oppure aprilo su jw.org /
        JW Library.
      </p>
    )
  }

  if (!words.length) {
    return (
      <p className="muted" style={{ margin: '0.65rem 0 0' }}>
        Nessuna parola da evidenziare in questo intervallo.
      </p>
    )
  }

  return (
    <div className="karaoke-player">
      <video
        ref={videoRef}
        className="karaoke-video"
        src={progressiveUrl}
        preload="auto"
        playsInline
        controls={false}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={() => {
          const el = videoRef.current
          if (!el) return
          try {
            el.currentTime = startSec
          } catch {
            /* ignore */
          }
          setLoading(false)
        }}
        onCanPlay={() => setLoading(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setLoading(false)
          setError(
            'Il browser non riesce a caricare l’audio del video. Riprovo con un link aggiornato…',
          )
          onMediaError?.()
        }}
        aria-label={title || 'Video trascrizione'}
      />

      <div className="row karaoke-controls" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" onClick={() => void togglePlay()}>
          <span className="row" style={{ gap: 6 }}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
            {loading
              ? 'Carico audio…'
              : playing
                ? 'Pausa voce video'
                : 'Ascolta voce del video'}
          </span>
        </button>
        <button type="button" className="btn secondary" onClick={restart}>
          <span className="row" style={{ gap: 6 }}>
            <RotateCcw size={16} /> Dall’inizio intervallo
          </span>
        </button>
        <span className="muted karaoke-clock">
          {formatClock(Math.max(startSec, Math.min(current, rangeEnd)))} /{' '}
          {formatClock(rangeEnd)}
        </span>
      </div>

      {error && (
        <p className="error-text" style={{ margin: '0.55rem 0 0' }}>
          {error}
        </p>
      )}

      <div
        className="karaoke-text"
        role="region"
        aria-live="off"
        aria-label="Trascrizione con parole evidenziate"
      >
        {words.map((w, i) => {
          const isActive = i === activeIdx
          const isPast = activeIdx >= 0 && i < activeIdx
          return (
            <span
              key={`${w.cueIndex}-${i}-${w.start}`}
              ref={isActive ? activeRef : undefined}
              className={`karaoke-word${isActive ? ' is-active' : ''}${isPast ? ' is-past' : ''}`}
            >
              {w.text}{' '}
            </span>
          )
        })}
      </div>
    </div>
  )
}
