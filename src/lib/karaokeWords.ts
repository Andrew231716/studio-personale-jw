import { cueTimeToSeconds, type VttCue } from './vtt'

export interface KaraokeWord {
  text: string
  /** Secondi assoluti nel video. */
  start: number
  end: number
  cueIndex: number
}

/**
 * Distribuisce le parole di ogni cue nell’intervallo temporale del cue,
 * così l’evidenziazione segue la voce del video.
 */
export function buildKaraokeWords(cues: VttCue[]): KaraokeWord[] {
  const words: KaraokeWord[] = []
  cues.forEach((cue, cueIndex) => {
    const start = cueTimeToSeconds(cue.start)
    const end = Math.max(start + 0.05, cueTimeToSeconds(cue.end))
    const tokens = cue.text
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
    if (!tokens.length) return
    const span = end - start
    const step = span / tokens.length
    tokens.forEach((text, i) => {
      words.push({
        text,
        start: start + i * step,
        end: i === tokens.length - 1 ? end : start + (i + 1) * step,
        cueIndex,
      })
    })
  })
  return words
}

export function findActiveWordIndex(words: KaraokeWord[], timeSec: number): number {
  if (!words.length) return -1
  // ricerca binaria sul start
  let lo = 0
  let hi = words.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const w = words[mid]
    if (timeSec < w.start) {
      hi = mid - 1
    } else if (timeSec >= w.end) {
      lo = mid + 1
      best = mid
    } else {
      return mid
    }
  }
  // se siamo tra due parole, resta sull’ultima passata
  if (best >= 0 && timeSec >= words[best].start) return best
  if (timeSec < words[0].start) return -1
  if (timeSec >= words[words.length - 1].end) return words.length - 1
  return best
}
