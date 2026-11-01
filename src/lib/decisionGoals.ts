import { uid } from './id'
import type { DecisionGoal } from '../types'

/** Estrae possibili obiettivi da un piano testuale (passi numerati o elenchi). */
export function extractGoalsFromPlan(plan: string): string[] {
  if (!plan.trim()) return []
  const skip =
    /^(obiettiv|passi|conseguenz|possibil|come verificare|nota|preghiera|dopo la|sintesi|rischi|effetti)/i
  const out: string[] = []
  for (const raw of plan.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(?:\d+[.)]\s+|[-•*]\s+)(.+)$/)
    if (!m) continue
    const title = m[1].replace(/\*\*/g, '').trim()
    if (title.length < 8 || title.length > 220) continue
    if (skip.test(title)) continue
    if (out.some((t) => t.toLowerCase() === title.toLowerCase())) continue
    out.push(title)
    if (out.length >= 10) break
  }
  return out
}

export function goalsFromTitles(titles: string[]): DecisionGoal[] {
  const now = new Date().toISOString()
  return titles.map((title) => ({
    id: uid('goal'),
    title,
    done: false,
    notes: '',
    createdAt: now,
  }))
}

/** Unisce nuovi obiettivi senza duplicare titoli già presenti. */
export function mergeGoals(
  existing: DecisionGoal[] | undefined,
  incoming: DecisionGoal[],
): DecisionGoal[] {
  const list = [...(existing || [])]
  for (const g of incoming) {
    if (list.some((x) => x.title.trim().toLowerCase() === g.title.trim().toLowerCase())) continue
    list.push(g)
  }
  return list
}
