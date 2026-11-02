import { useEffect, useState } from 'react'
import { Pause, Volume2, VolumeX } from 'lucide-react'
import {
  getNarrationController,
  getSpeakingText,
  speechNarrationSupportNote,
  speechNarrationSupported,
  subscribeNarration,
  type NarrationState,
} from '../lib/speechNarration'

interface Props {
  text: string
  /** Etichetta breve (default: Ascolta). */
  label?: string
  className?: string
  compact?: boolean
}

/**
 * Pulsante gratuito «Ascolta» basato su speechSynthesis del browser.
 * Se lo stesso testo è già in riproduzione, mostra Pausa / Stop.
 */
export function NarrateButton({ text, label = 'Ascolta', className = '', compact = false }: Props) {
  const [state, setState] = useState<NarrationState>('idle')
  const [speakingText, setSpeakingText] = useState('')
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

  if (!supported) {
    return (
      <button
        type="button"
        className={btnClass}
        title={speechNarrationSupportNote()}
        disabled
      >
        <span className="row" style={{ gap: 6 }}>
          <VolumeX size={compact ? 14 : 16} />
          {label}
        </span>
      </button>
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
            <Pause size={compact ? 14 : 16} />
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
            <Volume2 size={compact ? 14 : 16} />
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
      onClick={() => ctrl.speak(trimmed)}
      aria-label={`${label} con voce narrativa`}
      title="Voce narrativa gratuita del browser"
    >
      <span className="row" style={{ gap: 6 }}>
        <Volume2 size={compact ? 14 : 16} />
        {label}
      </span>
    </button>
  )
}
