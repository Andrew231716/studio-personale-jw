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

export function cueTimeToSeconds(t: string): number {
  const [h, m, rest] = t.split(':')
  const [s] = (rest || '0').split('.')
  return Number(h) * 3600 + Number(m) * 60 + Number(s)
}

/** Accetta minuti (`5`), decimali (`5.5`) oppure `m:ss` / `h:mm:ss`. */
export function parseTimeInput(raw: string | number): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return 0
    // valori piccoli = minuti (5 → 300s); se già in secondi tipicamente > 60*20... no: user means minutes
    return raw * 60
  }
  const t = String(raw || '').trim().replace(',', '.')
  if (!t) return 0
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p))
    if (parts.some((n) => !Number.isFinite(n))) return 0
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0
  }
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return 0
  return n * 60
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function cuesDurationSeconds(cues: VttCue[]): number {
  if (!cues.length) return 0
  return Math.max(...cues.map((c) => cueTimeToSeconds(c.end)))
}

/** Filtra i cue nell’intervallo [startSec, endSec] (inclusivo sul bordo). */
export function filterCuesByTimeRange(
  cues: VttCue[],
  startSec: number,
  endSec: number,
): VttCue[] {
  const from = Math.max(0, startSec)
  const to = Math.max(from, endSec)
  return cues.filter((c) => {
    const start = cueTimeToSeconds(c.start)
    const end = cueTimeToSeconds(c.end)
    return end >= from && start <= to
  })
}

export function buildTranscriptFromCues(cues: VttCue[]): {
  transcript: string
  timedText: string
} {
  return {
    transcript: mergeCueText(cues),
    timedText: formatTranscriptWithTimestamps(cues),
  }
}

function timeToSeconds(t: string): number {
  return cueTimeToSeconds(t)
}
