export interface VttCue {
  start: string
  end: string
  text: string
}

/** Estrae cue e testo continuo da un file WebVTT JW. */
export function parseVtt(vtt: string): { cues: VttCue[]; text: string } {
  const lines = vtt.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const cues: VttCue[] = []
  let i = 0

  // salta intestazione WEBVTT / NOTE iniziali
  while (i < lines.length && !/-->/.test(lines[i])) i++

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    // eventuale indice numerico
    if (/^\d+$/.test(line) && i + 1 < lines.length && /-->/.test(lines[i + 1])) {
      i++
      continue
    }
    const timing = line.match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/,
    )
    if (!timing) {
      i++
      continue
    }
    const start = timing[1]
    const end = timing[2]
    i++
    const textLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '') {
      // ignora cue settings / tag tipici
      const cleaned = lines[i]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim()
      if (cleaned) textLines.push(cleaned)
      i++
    }
    const text = textLines.join(' ').replace(/\s+/g, ' ').trim()
    if (text) cues.push({ start, end, text })
  }

  const text = mergeCueText(cues)
  return { cues, text }
}

function mergeCueText(cues: VttCue[]): string {
  const parts: string[] = []
  for (const cue of cues) {
    const t = cue.text.replace(/\.\.\.$/, '').trim()
    if (!t) continue
    const prev = parts[parts.length - 1] || ''
    // evita ripetizioni tipiche dei sottotitoli a scorrimento
    if (prev && (prev.endsWith(t) || t.startsWith(prev.slice(-Math.min(40, prev.length))))) {
      if (t.length > prev.length) parts[parts.length - 1] = t
      continue
    }
    parts.push(t)
  }
  return parts
    .join(' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatTranscriptWithTimestamps(cues: VttCue[], everySeconds = 45): string {
  if (!cues.length) return ''
  const blocks: string[] = []
  let bucket: string[] = []
  let bucketStart = cues[0].start
  let lastSec = timeToSeconds(cues[0].start)

  for (const cue of cues) {
    const sec = timeToSeconds(cue.start)
    if (sec - lastSec >= everySeconds && bucket.length) {
      blocks.push(`[${bucketStart.slice(0, 8)}] ${bucket.join(' ')}`)
      bucket = []
      bucketStart = cue.start
      lastSec = sec
    }
    bucket.push(cue.text)
  }
  if (bucket.length) blocks.push(`[${bucketStart.slice(0, 8)}] ${bucket.join(' ')}`)
  return blocks.join('\n\n')
}

function timeToSeconds(t: string): number {
  const [h, m, rest] = t.split(':')
  const [s] = rest.split('.')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}
