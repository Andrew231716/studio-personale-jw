import { cueTimeToSeconds, type VttCue } from './vtt'

export interface KaraokeWord {
  text: string
  /** Secondi assoluti nel video. */
  start: number
  end: number
  cueIndex: number
}

/** Ritardo percettivo: l’highlight resta un filo dietro la voce, non davanti. */
export const KARAOKE_SYNC_LAG_SEC = 0.18

/**
 * Distribuisce le parole di ogni cue nell’intervallo temporale del cue,
 * pesando la durata sul numero di caratteri (più naturale della quota uguale).
 */
export function buildKaraokeWords(cues: VttCue[]): KaraokeWord[] {
  const words: KaraokeWord[] = []
  cues.forEach((cue, cueIndex) => {
    const start = cueTimeToSeconds(cue.start)
    const end = Math.max(start + 0.08, cueTimeToSeconds(cue.end))
    const tokens = cue.text
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
    if (!tokens.length) return

    const weights = tokens.map((t) => Math.max(1, t.replace(/[^\p{L}\p{N}]/gu, '').length || t.length))
    const totalWeight = weights.reduce((a, b) => a + b, 0) || tokens.length
    const span = end - start

    let cursor = start
    tokens.forEach((text, i) => {
      const share = span * (weights[i] / totalWeight)
      const wordEnd = i === tokens.length - 1 ? end : cursor + share
      words.push({
        text,
        start: cursor,
        end: Math.max(cursor + 0.04, wordEnd),
        cueIndex,
      })
      cursor = wordEnd
    })
  })
  return words
}

export function findActiveWordIndex(words: KaraokeWord[], timeSec: number): number {
  if (!words.length) return -1
  // Ritardo leggero: evita che l’evidenziazione “corra” davanti alla voce.
  const t = Math.max(0, timeSec - KARAOKE_SYNC_LAG_SEC)

  let lo = 0
  let hi = words.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const w = words[mid]
    if (t < w.start) {
      hi = mid - 1
    } else if (t >= w.end) {
      lo = mid + 1
      best = mid
    } else {
      return mid
    }
  }
  if (best >= 0 && t >= words[best].start) return best
  if (t < words[0].start) return -1
  if (t >= words[words.length - 1].end) return words.length - 1
  return best
}
