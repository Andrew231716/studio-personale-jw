import { useEffect, useState } from 'react'
import { Loader2, Pause, Volume2, VolumeX } from 'lucide-react'
import {
  getNarrationController,
  getSpeakingText,
  speechNarrationSupported,
  subscribeNarration,
  type NarrationState,
  type NarrationVoiceId,
} from '../lib/speechNarration'
import { useAppStore } from '../store/useAppStore'

interface Props {
  text: string
  /** Etichetta breve (default: Ascolta). */
  label?: string
  className?: string
  compact?: boolean
}

/**
 * Pulsante «Ascolta» con voce narrativa neurale (cloud), non la voce di sistema.
 */
export function NarrateButton({ text, label = 'Ascolta', className = '', compact = false }: Props) {
  const [state, setState] = useState<NarrationState>('idle')
  const [speakingText, setSpeakingText] = useState('')
  const narrationVoice = useAppStore((s) => s.settings.narrationVoice || 'isabella')
  const narrationEngine = useAppStore((s) => s.settings.narrationEngine || 'neural')
  const language = useAppStore((s) => s.settings.language)
  const supported = speechNarrationSupported()
  const trimmed = text.replace(/\s+/g, ' ').trim()
  const isMine = Boolean(trimmed) && speakingText === trimmed && state !== 'idle'

  useEffect(() => {
    return subscribeNarration((s) => {
      setState(s)
      setSpeakingText(getSpeakingText())
    })
  }, [])

  if (!trimmed) return null

  const ctrl = getNarrationController()
  const btnClass = `btn secondary${compact ? ' small' : ''} narrate-btn${isMine ? ' is-active' : ''} ${className}`.trim()
  const icon = compact ? 14 : 16

  if (!supported) {
    return (
      <button type="button" className={btnClass} disabled title="Voce narrativa non disponibile">
        <span className="row" style={{ gap: 6 }}>
          <VolumeX size={icon} />
          {label}
        </span>
      </button>
    )
  }

  if (isMine && state === 'loading') {
    return (
      <span className="row narrate-controls" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className={btnClass} disabled aria-label="Preparazione voce narrativa">
          <span className="row" style={{ gap: 6 }}>
            <Loader2 size={icon} className="spin" />
            Preparo la voce…
          </span>
        </button>
        <button
          type="button"
          className={`btn secondary${compact ? ' small' : ''}`}
          onClick={() => ctrl.stop()}
        >
          Annulla
        </button>
      </span>
    )
  }

  if (isMine && state === 'speaking') {
    return (
      <span className="row narrate-controls" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={btnClass}
          onClick={() => ctrl.pause()}
          aria-label="Pausa voce narrativa"
        >
          <span className="row" style={{ gap: 6 }}>
            <Pause size={icon} />
            Pausa
          </span>
        </button>
        <button
          type="button"
          className={`btn secondary${compact ? ' small' : ''}`}
          onClick={() => ctrl.stop()}
          aria-label="Ferma voce narrativa"
        >
          Stop
        </button>
      </span>
    )
  }

  if (isMine && state === 'paused') {
    return (
      <span className="row narrate-controls" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={btnClass}
          onClick={() => ctrl.resume()}
          aria-label="Riprendi voce narrativa"
        >
          <span className="row" style={{ gap: 6 }}>
            <Volume2 size={icon} />
            Riprendi
          </span>
        </button>
        <button
          type="button"
          className={`btn secondary${compact ? ' small' : ''}`}
          onClick={() => ctrl.stop()}
          aria-label="Ferma voce narrativa"
        >
          Stop
        </button>
      </span>
    )
  }

  return (
    <button
      type="button"
      className={btnClass}
      onClick={() =>
        ctrl.speak(trimmed, {
          voice: narrationVoice as NarrationVoiceId,
          language,
          engine: narrationEngine,
        })
      }
      aria-label={`${label} con voce narrativa`}
      title="Voce narrativa neurale (non quella di sistema)"
    >
      <span className="row" style={{ gap: 6 }}>
        <Volume2 size={icon} />
        {label}
      </span>
    </button>
  )
}
