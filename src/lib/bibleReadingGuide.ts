import type { BibleReadingPlan, BibleScriptureRef } from '../types'

type GuideSection = 'intro' | 'reading' | 'reflection' | 'practice' | 'other'

const sectionLabels: Array<[RegExp, GuideSection]> = [
  [/^(perché (leggerlo|leggere|studiare)|introduzione|obiettivo)(?:\s|$)/i, 'intro'],
  [/^(passi di lettura|letture consigliate|scritture da leggere|lettura guidata|brani da leggere)(?:\s|$)/i, 'reading'],
  [/^(domande|spunti di riflessione|riflessioni)(?:\s|$)/i, 'reflection'],
  [/^(azione pratica|applicazione pratica|una cosa da fare)(?:\s|$)/i, 'practice'],
  [/^(risorse|fonti|materiali|nota)(?:\s|$)/i, 'other'],
]

function cleanText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/\(vedi i collegamenti[^)]*\)/gi, '')
    .replace(/\*\*|__/g, '')
    .trim()
}

function readItems(lines: string[]): string[] {
  const items: string[] = []
  for (const line of lines) {
    const bullet = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/)
    const value = cleanText(bullet?.[1] ?? line)
    if (!value) continue
    if (bullet || !items.length || value.endsWith('?')) items.push(value)
    else items[items.length - 1] += ` ${value}`
  }
  return [...new Set(items)]
}

function normalizeReference(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

function findScripture(text: string, scriptures: BibleScriptureRef[]): BibleScriptureRef | undefined {
  const normalized = normalizeReference(text)
  return scriptures.find(({ label }) => {
    const start = normalizeReference(label).match(/^.+?\d+:\d+/)?.[0] || normalizeReference(label)
    const index = normalized.indexOf(start)
    return Boolean(start && index >= 0 && !/\d/.test(normalized[index + start.length] || ''))
  })
}

export function buildBibleReadingGuide(plan: BibleReadingPlan) {
  const sections: Record<GuideSection, string[]> = { intro: [], reading: [], reflection: [], practice: [], other: [] }
  const lines = plan.plan.split(/\r?\n/)
  const enrichmentMarker = lines.findLastIndex((line) => cleanText(line) === 'Approfondimento AI')
  const studyText = lines.slice(enrichmentMarker + 1)
  const titleIndex = studyText.findIndex((line) => /^Titolo(?: del percorso)?\s*:/i.test(cleanText(line)))
  const titleOnNextLine = titleIndex >= 0 && /^Titolo(?: del percorso)?\s*:?$/i.test(cleanText(studyText[titleIndex]))
  const content = titleIndex < 0 ? studyText : studyText.slice(titleIndex + (titleOnNextLine ? 2 : 1))
  let current: GuideSection = titleIndex < 0 && !plan.aiEnriched && enrichmentMarker < 0 ? 'other' : 'intro'

  for (const line of content) {
    const text = line.trim()
    if (!text) continue
    const possibleHeading = text.replace(/^#{1,6}\s+/, '').replace(/\*\*|__/g, '')
    const [heading, ...rest] = possibleHeading.split(':')
    const section = sectionLabels.find(([label]) => label.test(heading.trim()))
    if (section && (rest.length || text.startsWith('#') || text.startsWith('**') || !/[.!?]$/.test(text))) {
      current = section[1]
      if (rest.length) sections[current].push(rest.join(':').trim())
    } else {
      sections[current].push(text)
    }
  }

  const scriptures = plan.scriptures || []
  const readingItems = readItems(sections.reading)
  const readings = readingItems.length
    ? readingItems.map((text) => ({ text, scripture: findScripture(text, scriptures) }))
    : scriptures.map((scripture) => ({ text: scripture.label, scripture }))
  // Mantieni visibili i progressi anche se arriva l'AI dopo che lo studio è iniziato,
  // oppure se viene modificato il testo completo.
  const seenReadings = new Set(readings.map(({ text }) => text))
  for (const text of plan.studyProgress?.completedReadings || []) {
    if (seenReadings.has(text)) continue
    readings.push({ text, scripture: findScripture(text, scriptures) })
    seenReadings.add(text)
  }

  const questions = readItems(sections.reflection)
  if (!questions.length) {
    questions.push(
      'Che cosa ti ha colpito nel brano, e perché?',
      'Quale idea puoi mettere in pratica questa settimana?',
    )
  }
  const savedQuestions = Object.entries(plan.studyProgress?.answers || {})
    .filter(([, answer]) => answer.trim())
    .map(([question]) => question)
  return {
    intro: sections.intro.map(cleanText).filter(Boolean).join(' '),
    readings,
    questions: [...new Set([...questions, ...savedQuestions])],
    practice: sections.practice.map(cleanText).filter(Boolean).join(' '),
  }
}
