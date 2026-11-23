/**
 * Confronto prova a voce: testo preparato ↔ trascrizione.
 */

export type PracticeDiffItem = {
  type: 'ok' | 'missing' | 'extra' | 'changed'
  expected?: string
  actual?: string
}

function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}

/**
 * Allineamento greedy parola-per-parola (sufficiente per feedback di prova).
 */
export function alignPracticeTexts(prepared: string, spoken: string): {
  items: PracticeDiffItem[]
  coverage: number
  missingCount: number
  extraCount: number
  summary: string
} {
  const a = tokenize(prepared)
  const b = tokenize(spoken)
  const items: PracticeDiffItem[] = []
  let i = 0
  let j = 0
  let matched = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      items.push({ type: 'ok', expected: a[i], actual: b[j] })
      matched++
      i++
      j++
      continue
    }
    // Cerca a[i] più avanti in b (parola saltata in prepared = extra in spoken)
    const lookB = b.indexOf(a[i], j)
    const lookA = a.indexOf(b[j], i)
    if (lookB !== -1 && (lookA === -1 || lookB - j <= lookA - i)) {
      while (j < lookB) {
        items.push({ type: 'extra', actual: b[j] })
        j++
      }
      continue
    }
    if (lookA !== -1) {
      while (i < lookA) {
        items.push({ type: 'missing', expected: a[i] })
        i++
      }
      continue
    }
    items.push({ type: 'changed', expected: a[i], actual: b[j] })
    i++
    j++
  }
  while (i < a.length) {
    items.push({ type: 'missing', expected: a[i] })
    i++
  }
  while (j < b.length) {
    items.push({ type: 'extra', actual: b[j] })
    j++
  }
  const missingCount = items.filter((x) => x.type === 'missing').length
  const extraCount = items.filter((x) => x.type === 'extra' || x.type === 'changed').length
  const coverage = a.length ? matched / a.length : 1
  const summary = a.length
    ? `Copertura ~${Math.round(coverage * 100)}% · ${missingCount} parole saltate · ${extraCount} aggiunte/diverse`
    : 'Nessun testo preparato da confrontare.'
  return { items, coverage, missingCount, extraCount, summary }
}

/** Elenco compatto delle parole saltate (max N). */
export function missingWordsPreview(items: PracticeDiffItem[], max = 12): string[] {
  return items
    .filter((x) => x.type === 'missing' && x.expected)
    .map((x) => x.expected!)
    .slice(0, max)
}
