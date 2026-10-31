import { CheckCircle2 } from 'lucide-react'
import { getSectionProgress } from '../lib/sectionProgress'
import { useAppStore } from '../store/useAppStore'
import type { AppView } from '../types'

export function SectionProgress({ section }: { section: AppView }) {
  const topics = useAppStore((s) => s.topics)
  const decisions = useAppStore((s) => s.decisions)
  const sessionLogs = useAppStore((s) => s.sessionLogs)
  const savedResources = useAppStore((s) => s.savedResources)
  const savedSearches = useAppStore((s) => s.savedSearches)
  const bibleReadingPlans = useAppStore((s) => s.bibleReadingPlans)
  const ministryNotes = useAppStore((s) => s.ministryNotes)
  const aiMessages = useAppStore((s) => s.aiMessages)

  const data = getSectionProgress(section, {
    topics,
    decisions,
    sessionLogs,
    savedResources,
    savedSearches,
    bibleReadingPlans,
    ministryNotes,
    aiMessages,
  })

  if (!data) return null

  const hasActivity = data.items.some((i) => {
    const v = i.value.trim()
    return v !== '0' && v !== '—' && v !== 'Locale' && v !== 'EPUB'
  })

  return (
    <section
      className={`panel progress-panel ${hasActivity ? '' : 'is-empty'}`.trim()}
      aria-label={data.title}
    >
      <div className="progress-head">
        <span className="progress-icon" aria-hidden>
          <CheckCircle2 size={18} />
        </span>
        <div>
          <p className="section-kicker" style={{ margin: 0 }}>
            Già fatto
          </p>
          <h3 style={{ margin: '0.15rem 0 0' }}>{data.title}</h3>
        </div>
      </div>
      {hasActivity ? (
        <div className="progress-stats">
          {data.items.map((item) => (
            <div className="progress-stat" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="muted" style={{ margin: hasActivity ? '0.65rem 0 0' : '0.35rem 0 0' }}>
        {data.hint ||
          (hasActivity
            ? undefined
            : 'Ancora vuoto qui: il primo passo apparirà in queste cifre.')}
      </p>
    </section>
  )
}
