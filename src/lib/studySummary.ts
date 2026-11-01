import { isSectionHeading, normalizeJwItalian } from './jwItalianTerms'
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
  /** Nome file senza estensione (export singolo). */
  slug?: string
  /** Titolo copertina PDF/EPUB. */
  heading?: string
}

export interface SummaryField {
  label: string
  value: string
}

export interface SummaryBlock {
  kind: 'session' | 'topic' | 'decision'
  title: string
  subtitle?: string
  fields: SummaryField[]
  lists?: Array<{ title: string; items: string[] }>
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

/** Riepilogo di un solo argomento (quaderno + sessioni collegate). */
export function buildTopicOnlySummary(
  topic: StudyTopic,
  sessions: StudySessionLog[],
): StudySummary {
  const linked = sessions
    .filter((s) => s.topicId === topic.id)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
  const stamp = topic.title
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return {
    period: 'mese',
    range: {
      start: new Date(topic.createdAt),
      end: new Date(),
      label: `Argomento: ${topic.title}`,
    },
    generatedAt: new Date().toISOString(),
    sessions: linked,
    topics: [topic],
    decisions: [],
    totalMinutes: linked.reduce((n, s) => n + (s.minutesSpent || 0), 0),
    slug: `jw-studio-argomento-${stamp || topic.id}`,
    heading: 'Export argomento',
  }
}

/** Riepilogo di una sola decisione. */
export function buildDecisionOnlySummary(decision: DecisionItem): StudySummary {
  const stamp = decision.title
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return {
    period: 'mese',
    range: {
      start: new Date(decision.createdAt),
      end: new Date(decision.updatedAt || decision.createdAt),
      label: `Decisione: ${decision.title}`,
    },
    generatedAt: new Date().toISOString(),
    sessions: [],
    topics: [],
    decisions: [decision],
    totalMinutes: 0,
    slug: `jw-studio-decisione-${stamp || decision.id}`,
    heading: 'Export decisione',
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

/** Pulisce testo per export: markdown, titoli sezione, lettere separate da spazi. */
export function cleanExportText(raw: string | undefined | null): string {
  if (!raw) return ''
  let s = String(raw).replace(/\u00a0/g, ' ')
  s = s.replace(/[*_]{1,3}/g, '')
  s = s.replace(/^#+\s*/gm, '')
  s = collapseSpacedLetters(s)
  s = s.replace(/[ \t]+\n/g, '\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = normalizeJwItalian(s)
  return s.trim()
}

/** «A p p l i c a r e» → «Applicare» (bug tipico di parsing AI). */
function collapseSpacedLetters(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean)
  if (words.length < 6) return s
  const singleCount = words.filter((w) => /^[\wÀ-ÿ]$/i.test(w)).length
  if (singleCount / words.length < 0.55) return s

  const out: string[] = []
  let buf = ''
  for (const w of words) {
    if (/^[\wÀ-ÿ]$/i.test(w)) {
      buf += w
      continue
    }
    if (buf) {
      out.push(buf)
      buf = ''
    }
    out.push(w)
  }
  if (buf) out.push(buf)
  return out.join(' ')
}

function looksLikeGuideDump(s: string): boolean {
  return /\b(OBIETTIVI|RIFLESSIONI|DOMANDE|PRATICHE|RIASSUNTO|TITOLO)\b/i.test(s)
}

function firstUsefulParagraph(s: string): string {
  const cleaned = cleanExportText(s)
  if (!cleaned) return ''
  if (!looksLikeGuideDump(cleaned)) return cleaned
  const cut = cleaned.split(/\b(?:OBIETTIVI|RIFLESSIONI|DOMANDE|PRATICHE|RIASSUNTO)\b/i)[0]
  return cleanExportText(cut).slice(0, 600)
}

function niceTitle(raw: string, fallback: string): string {
  const t = cleanExportText(raw)
  if (!t || isSectionHeading(t) || t === '*' || t === '**') return fallback
  return t
}

function pushField(fields: SummaryField[], label: string, value?: string | null) {
  const v = cleanExportText(value)
  if (v) fields.push({ label, value: v })
}

function shortMaterial(title?: string, url?: string): string {
  const name = cleanExportText(title)
  if (!name && !url) return ''
  if (!url) return name
  try {
    const u = new URL(url)
    if (u.hostname.includes('jw.org')) {
      return name ? `${name} (jw.org)` : 'Materiale su jw.org'
    }
  } catch {
    /* ignore */
  }
  return name || 'Materiale collegato'
}

export function buildSummaryBlocks(summary: StudySummary): SummaryBlock[] {
  const blocks: SummaryBlock[] = []

  summary.sessions.forEach((s, i) => {
    const fields: SummaryField[] = []
    pushField(
      fields,
      'Quando',
      `${new Date(s.completedAt).toLocaleString('it-IT')} · ${s.minutesSpent} min`,
    )
    pushField(fields, 'Preghiera', s.prayer)
    pushField(fields, 'Obiettivo', s.goal)
    pushField(fields, 'Materiale', shortMaterial(s.resourceTitle, s.resourceUrl))
    pushField(fields, 'Scrittura', s.keyVerse)
    pushField(fields, 'Cosa mi ha colpito', s.highlight)
    pushField(fields, 'Riflessione', s.reflection)
    pushField(fields, 'Domanda', s.question)
    pushField(fields, 'Risposta', s.answer)
    pushField(fields, 'Da praticare', s.practice)
    pushField(fields, 'Gratitudine', s.gratitude)

    blocks.push({
      kind: 'session',
      title: niceTitle(s.topicTitle, `Sessione ${i + 1}`),
      subtitle: `Sessione ${i + 1}`,
      fields,
    })
  })

  summary.topics.forEach((t) => {
    const fields: SummaryField[] = []
    const interest = firstUsefulParagraph(t.interest)
    pushField(fields, 'Perché studio questo', interest)

    const lists: SummaryBlock['lists'] = []
    const objectives = (t.objectives || [])
      .map(cleanExportText)
      .filter((o) => o && !isSectionHeading(o))
    if (objectives.length) lists.push({ title: 'Obiettivi', items: objectives })

    const reflections = (t.reflections || [])
      .filter((r) => cleanExportText(r.response))
      .map((r) => {
        const prompt = cleanExportText(r.prompt)
        const response = cleanExportText(r.response)
        return prompt ? `${prompt}\n→ ${response}` : response
      })
    if (reflections.length) lists.push({ title: 'Riflessioni', items: reflections })

    const questions = (t.questions || [])
      .filter((q) => cleanExportText(q.question) || cleanExportText(q.answer))
      .map((q) => {
        const question = cleanExportText(q.question) || 'Domanda'
        const answer = cleanExportText(q.answer)
        return answer ? `${question}\n→ ${answer}` : question
      })
    if (questions.length) lists.push({ title: 'Domande', items: questions })

    const practices = (t.practices || [])
      .filter((p) => cleanExportText(p.action))
      .map((p) => {
        const action = cleanExportText(p.action)
        const outcome = cleanExportText(p.outcome)
        const tried = p.tried ? ' (fatta)' : ''
        return outcome ? `${action}${tried} → ${outcome}` : `${action}${tried}`
      })
    if (practices.length) lists.push({ title: 'Pratiche', items: practices })

    if (!fields.length && !lists.length) return

    blocks.push({
      kind: 'topic',
      title: niceTitle(t.title, 'Quaderno'),
      subtitle: 'Dal Quaderno',
      fields,
      lists,
    })
  })

  summary.decisions.forEach((d) => {
    const fields: SummaryField[] = []
    pushField(fields, 'Contesto', d.context)
    pushField(fields, 'Scelta', d.chosenDecision)
    pushField(fields, 'Motivazioni', d.honestMotivations)
    pushField(fields, 'Riassunto della decisione presa', d.conclusionsSummary)
    pushField(fields, 'Passi e conseguenze', d.nextStepsPlan)
    pushField(fields, 'Conclusione', d.conclusion)
    pushField(fields, 'Elaborazione AI', d.aiElaboration)
    pushField(fields, 'Preghiera', d.prayerNotes)
    pushField(fields, 'Analisi di lucidità', d.lucidityAnalysis)
    const lists: SummaryBlock['lists'] = []
    const goals = (d.goals || [])
      .filter((g) => cleanExportText(g.title))
      .map((g) => {
        const title = cleanExportText(g.title)
        const due = g.dueDate ? ` · entro ${g.dueDate}` : ''
        const done = g.done ? ' (fatto)' : ''
        const notes = cleanExportText(g.notes)
        return notes ? `${title}${due}${done} — ${notes}` : `${title}${due}${done}`
      })
    if (goals.length) lists.push({ title: 'Obiettivi', items: goals })
    if (!fields.length && !lists.length) return
    blocks.push({
      kind: 'decision',
      title: niceTitle(d.title, 'Decisione'),
      subtitle: `Decisione · ${d.scale === 'grande' ? 'grande' : 'piccola'} · ${d.status}`,
      fields,
      lists,
    })
  })

  return blocks
}

export function summaryToPlainText(summary: StudySummary): string {
  const lines: string[] = [
    'JW Studio — Riepilogo studio personale',
    summary.range.label,
    `Generato: ${new Date(summary.generatedAt).toLocaleString('it-IT')}`,
    `Sessioni: ${summary.sessions.length} · Minuti: ${summary.totalMinutes}`,
    '',
  ]

  const blocks = buildSummaryBlocks(summary)
  if (!blocks.length) {
    lines.push('Nessuno studio registrato in questo periodo.')
    return lines.join('\n')
  }

  for (const block of blocks) {
    lines.push(`${block.subtitle ? block.subtitle + ' — ' : ''}${block.title}`)
    for (const f of block.fields) {
      lines.push(`${f.label}: ${f.value}`)
    }
    for (const list of block.lists || []) {
      lines.push(list.title)
      for (const item of list.items) {
        lines.push(`• ${item.replace(/\n/g, '\n  ')}`)
      }
    }
    lines.push('')
  }

  lines.push('Fine riepilogo JW Studio')
  lines.push('App non affiliata a jw.org. Contenuto personale dell’utente.')
  return lines.join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlParagraphs(value: string): string {
  return escapeHtml(value)
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('')
}

export function summaryToHtml(summary: StudySummary): string {
  const blocks = buildSummaryBlocks(summary)
  const parts: string[] = [
    `<header class="cover">`,
    `<p class="brand">JW Studio</p>`,
    `<h1>Riepilogo di studio</h1>`,
    `<p class="period">${escapeHtml(summary.range.label)}</p>`,
    `<p class="stats"><span>${summary.sessions.length} session${summary.sessions.length === 1 ? 'e' : 'i'}</span><span>${summary.totalMinutes} minuti</span><span>${summary.topics.length} argoment${summary.topics.length === 1 ? 'o' : 'i'}</span></p>`,
    `<p class="meta">Generato il ${escapeHtml(new Date(summary.generatedAt).toLocaleString('it-IT'))}</p>`,
    `</header>`,
  ]

  if (!blocks.length) {
    parts.push('<p class="empty">Nessuno studio registrato in questo periodo.</p>')
  }

  for (const block of blocks) {
    parts.push(`<section class="block block-${block.kind}">`)
    if (block.subtitle) parts.push(`<p class="kicker">${escapeHtml(block.subtitle)}</p>`)
    parts.push(`<h2>${escapeHtml(block.title)}</h2>`)
    for (const f of block.fields) {
      parts.push(`<div class="field"><h3>${escapeHtml(f.label)}</h3>${htmlParagraphs(f.value)}</div>`)
    }
    for (const list of block.lists || []) {
      parts.push(`<div class="list-block"><h3>${escapeHtml(list.title)}</h3><ul>`)
      for (const item of list.items) {
        parts.push(`<li>${escapeHtml(item).replace(/\n/g, '<br/>')}</li>`)
      }
      parts.push(`</ul></div>`)
    }
    parts.push(`</section>`)
  }

  parts.push(
    `<footer><p>Fine riepilogo · App non affiliata a jw.org · Contenuto personale dell’utente.</p></footer>`,
  )

  return `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><title>Riepilogo JW Studio</title>
<style>
  :root { color-scheme: light; }
  body{font-family:Georgia,"Times New Roman",serif;line-height:1.55;max-width:40rem;margin:0 auto;padding:1.5rem 1.1rem 2.5rem;color:#16302c;background:#f7fbf8}
  .brand{margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#2f6f6a;font-weight:700}
  h1{font-size:1.85rem;line-height:1.15;margin:.35rem 0 .5rem;letter-spacing:-.02em}
  .period{margin:0;font-size:1.05rem;color:#2f6f6a}
  .stats{display:flex;flex-wrap:wrap;gap:.45rem;margin:1rem 0 .55rem;padding:0;list-style:none}
  .stats span{background:#e7f0ec;border:1px solid #d5e0db;border-radius:999px;padding:.28rem .7rem;font-size:.85rem}
  .meta,.empty,.kicker{color:#5b736c;font-size:.92rem}
  .kicker{margin:0 0 .2rem;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;font-weight:700}
  .block{margin:1.5rem 0;padding:1.1rem 1rem;background:#fff;border:1px solid #d5e0db;border-radius:14px}
  h2{margin:0 0 .85rem;font-size:1.35rem;letter-spacing:-.02em}
  h3{margin:0 0 .25rem;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:#2f6f6a}
  .field{margin:0 0 .9rem}
  .field p{margin:.15rem 0 0}
  .list-block{margin:0 0 .9rem}
  ul{margin:.35rem 0 0;padding-left:1.15rem}
  li{margin:.35rem 0}
  footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #d5e0db;color:#5b736c;font-size:.85rem}
</style></head><body>${parts.join('\n')}</body></html>`
}
