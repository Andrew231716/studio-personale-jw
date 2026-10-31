import { STUDY_FLOW_STEPS } from '../lib/studyFlow'
import { useAppStore } from '../store/useAppStore'
import type { AppView } from '../types'

/** Percorso chiaro: Argomenti → Sessione → Quaderno → Diario. */
export function StudyFlowGuide({ current }: { current: AppView }) {
  const setView = useAppStore((s) => s.setView)

  return (
    <nav className="study-flow" aria-label="Percorso di studio">
      <p className="study-flow-kicker">Percorso di studio</p>
      <ol className="study-flow-steps">
        {STUDY_FLOW_STEPS.map((step, i) => {
          const active = step.view === current
          return (
            <li key={step.view} className={active ? 'is-active' : undefined}>
              {i > 0 && <span className="study-flow-sep" aria-hidden />}
              <button
                type="button"
                className="study-flow-step"
                onClick={() => setView(step.view)}
                aria-current={active ? 'step' : undefined}
              >
                <strong>{step.label}</strong>
                <span>{step.role}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
