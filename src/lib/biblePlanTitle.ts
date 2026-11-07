function cleanTitle(line: string): string {
  return line.replace(/^\s*#{1,6}\s+/, '').replace(/^[\s*_«“"']+|[\s*_»”"']+$/g, '').trim()
}

const titleLabel = /^(?:1[.)]\s*)?\**Titolo(?: del percorso)?\**\s*(?::\s*(.*))?$/i

export function readBiblePlanTitle(text: string, query: string): string {
  const [first = '', second = ''] = text.split(/\r?\n/).map(cleanTitle).filter(Boolean)
  const label = first.match(titleLabel)
  const title = label ? cleanTitle(label[1] || '') || second : ''
  if (title && !/^\d+[.)]\s|^Titolo(?: del percorso)?$/i.test(title) && title.length <= 120) return title
  return `Lettura: ${query}`.slice(0, 120)
}

export function repairBiblePlanTitle<T extends { title: string; plan: string; query: string }>(plan: T): T {
  return titleLabel.test(cleanTitle(plan.title))
    ? { ...plan, title: readBiblePlanTitle(plan.plan, plan.query) }
    : plan
}
