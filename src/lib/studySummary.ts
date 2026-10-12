import type {
  DecisionItem,
  StudySessionLog,
  StudyTopic,
  SummaryPeriod,
} from '../types'

export interface PeriodRange {
  start: Date
  end: Date
  label: string
}

export interface StudySummary {
  period: SummaryPeriod
  range: PeriodRange
  generatedAt: string
  sessions: StudySessionLog[]
  topics: StudyTopic[]
  decisions: DecisionItem[]
  totalMinutes: number
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function getPeriodRange(period: SummaryPeriod, anchor = new Date()): PeriodRange {
  const end = endOfDay(anchor)
  if (period === 'giorno') {
    const start = startOfDay(anchor)
    return {
      start,
      end,
      label: start.toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    }
  }
  if (period === 'settimana') {
    const start = startOfDay(anchor)
    const day = start.getDay() || 7
    start.setDate(start.getDate() - (day - 1))
    return {
      start,
      end,
      label: `Settimana dal ${start.toLocaleDateString('it-IT')} al ${end.toLocaleDateString('it-IT')}`,
    }
  }
  const start = startOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  return {
    start,
    end,
    label: start.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  }
}

export function buildStudySummary(input: {
  period: SummaryPeriod
  anchor?: Date
  sessions: StudySessionLog[]
  topics: StudyTopic[]
  decisions: DecisionItem[]
}): StudySummary {
  const range = getPeriodRange(input.period, input.anchor || new Date())
  const sessions = input.sessions
    .filter((s) => {
      const t = new Date(s.completedAt).getTime()
      return t >= range.start.getTime() && t <= range.end.getTime()
    })
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))

  const topicIds = new Set(sessions.map((s) => s.topicId).filter(Boolean) as string[])
  const topics = input.topics.filter(
    (t) =>
      topicIds.has(t.id) ||
      (new Date(t.updatedAt).getTime() >= range.start.getTime() &&
        new Date(t.updatedAt).getTime() <= range.end.getTime()),
  )

  const decisions = input.decisions.filter((d) => {
    const t = new Date(d.updatedAt).getTime()
    return t >= range.start.getTime() && t <= range.end.getTime()
  })

  return {
    period: input.period,
    range,
    generatedAt: new Date().toISOString(),
    sessions,
    topics,
    decisions,
    totalMinutes: sessions.reduce((sum, s) => sum + (s.minutesSpent || 0), 0),
  }
}

export function summaryToPlainText(summary: StudySummary): string {
  const lines: string[] = [
    'JW Studio — Riepilogo studio personale',
    summary.range.label,
    `Generato: ${new Date(summary.generatedAt).toLocaleString('it-IT')}`,
    `Sessioni: ${summary.sessions.length} · Minuti: ${summary.totalMinutes}`,
    '',
  ]

  if (!summary.sessions.length && !summary.topics.length && !summary.decisions.length) {
    lines.push('Nessuno studio registrato in questo periodo.')
    return lines.join('\n')
  }

  summary.sessions.forEach((s, i) => {
    lines.push(`—— Sessione ${i + 1}: ${s.topicTitle} ——`)
    lines.push(`Data: ${new Date(s.completedAt).toLocaleString('it-IT')} · ${s.minutesSpent} min`)
    if (s.prayer) lines.push(`Preghiera: ${s.prayer}`)
    if (s.goal) lines.push(`Obiettivo: ${s.goal}`)
    if (s.resourceTitle) lines.push(`Materiale: ${s.resourceTitle}${s.resourceUrl ? ` (${s.resourceUrl})` : ''}`)
    if (s.keyVerse) lines.push(`Scrittura: ${s.keyVerse}`)
    if (s.highlight) lines.push(`Highlight: ${s.highlight}`)
    if (s.reflection) lines.push(`Riflessione: ${s.reflection}`)
    if (s.question) lines.push(`Domanda: ${s.question}`)
    if (s.answer) lines.push(`Risposta: ${s.answer}`)
    if (s.practice) lines.push(`Pratica: ${s.practice}`)
    if (s.gratitude) lines.push(`Gratitudine: ${s.gratitude}`)
    lines.push('')
  })

  summary.topics.forEach((t) => {
    lines.push(`—— Quaderno: ${t.title} ——`)
    if (t.interest) lines.push(`Interesse: ${t.interest}`)
    if (t.objectives.length) lines.push(`Obiettivi: ${t.objectives.filter(Boolean).join('; ')}`)
    t.reflections
      .filter((r) => r.response.trim())
      .forEach((r) => lines.push(`Riflessione — ${r.prompt}: ${r.response}`))
    t.questions
      .filter((q) => q.answer.trim() || q.question.trim())
      .forEach((q) => {
        lines.push(`D: ${q.question}`)
        if (q.answer) lines.push(`R: ${q.answer}`)
      })
    t.practices
      .filter((p) => p.action.trim())
      .forEach((p) =>
        lines.push(`Pratica${p.tried ? ' (provata)' : ''}: ${p.action}${p.outcome ? ` → ${p.outcome}` : ''}`),
      )
    lines.push('')
  })

  summary.decisions.forEach((d) => {
    lines.push(`—— Decisione: ${d.title} (${d.scale}) ——`)
    if (d.context) lines.push(`Contesto: ${d.context}`)
    if (d.conclusion) lines.push(`Conclusione: ${d.conclusion}`)
    if (d.prayerNotes) lines.push(`Preghiera: ${d.prayerNotes}`)
    lines.push('')
  })

  lines.push('— Fine riepilogo JW Studio —')
  lines.push('App non affiliata a jw.org. Contenuto personale dell’utente.')
  return lines.join('\n')
}

export function summaryToHtml(summary: StudySummary): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  const blocks: string[] = [
    `<h1>JW Studio — Riepilogo studio</h1>`,
    `<p><strong>${escape(summary.range.label)}</strong><br/>Generato: ${escape(new Date(summary.generatedAt).toLocaleString('it-IT'))}<br/>Sessioni: ${summary.sessions.length} · Minuti: ${summary.totalMinutes}</p>`,
  ]

  if (!summary.sessions.length && !summary.topics.length) {
    blocks.push('<p>Nessuno studio registrato in questo periodo.</p>')
  }

  summary.sessions.forEach((s, i) => {
    blocks.push(`<h2>Sessione ${i + 1}: ${escape(s.topicTitle)}</h2>`)
    blocks.push(
      `<p>${escape(new Date(s.completedAt).toLocaleString('it-IT'))} · ${s.minutesSpent} min</p>`,
    )
    const fields: Array<[string, string | undefined]> = [
      ['Preghiera', s.prayer],
      ['Obiettivo', s.goal],
      ['Materiale', s.resourceTitle],
      ['Scrittura', s.keyVerse],
      ['Highlight', s.highlight],
      ['Riflessione', s.reflection],
      ['Domanda', s.question],
      ['Risposta', s.answer],
      ['Pratica', s.practice],
      ['Gratitudine', s.gratitude],
    ]
    fields.forEach(([label, value]) => {
      if (value?.trim()) blocks.push(`<p><strong>${label}:</strong> ${escape(value)}</p>`)
    })
  })

  summary.topics.forEach((t) => {
    blocks.push(`<h2>Quaderno: ${escape(t.title)}</h2>`)
    if (t.interest) blocks.push(`<p><strong>Interesse:</strong> ${escape(t.interest)}</p>`)
    t.reflections
      .filter((r) => r.response.trim())
      .forEach((r) =>
        blocks.push(
          `<p><strong>${escape(r.prompt)}</strong><br/>${escape(r.response)}</p>`,
        ),
      )
    t.questions
      .filter((q) => q.answer.trim())
      .forEach((q) =>
        blocks.push(
          `<p><strong>D:</strong> ${escape(q.question)}<br/><strong>R:</strong> ${escape(q.answer)}</p>`,
        ),
      )
  })

  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>Riepilogo JW Studio</title>
  <style>
    body{font-family:Georgia,serif;line-height:1.5;max-width:720px;margin:2rem auto;padding:0 1rem;color:#16302c}
    h1,h2{font-family:Georgia,serif;letter-spacing:-0.02em}
    h2{margin-top:1.6rem;border-top:1px solid #d5e0db;padding-top:1rem}
  </style></head><body>${blocks.join('\n')}</body></html>`
}
