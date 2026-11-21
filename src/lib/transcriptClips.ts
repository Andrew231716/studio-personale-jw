/** Parametri pezzi audio per trascrizione lunga (senza dipendenze AI). */

export const CLIP_SECONDS = 100
/** Sovrapposizione tra pezzi: evita di tagliare parole al confine. */
export const CLIP_OVERLAP_SECONDS = 2.5
/** Secondi di avanzamento tra un pezzo e il successivo. */
export const CLIP_HOP_SECONDS = CLIP_SECONDS - CLIP_OVERLAP_SECONDS

export interface ClipSegment {
  start: number
  speaker: string
  text: string
}

/** Tiene i segmenti del pezzo successivo solo dopo la zona di overlap. */
export function filterOverlapSegments<T extends ClipSegment>(
  segments: T[],
  part: number,
  overlapSeconds = CLIP_OVERLAP_SECONDS,
): T[] {
  if (part <= 0 || overlapSeconds <= 0) return segments
  const minRel = overlapSeconds * 0.85
  return segments.filter((segment) => segment.start >= minRel)
}
