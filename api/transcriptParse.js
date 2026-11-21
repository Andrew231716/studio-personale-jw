/** Parsing fedele dei segmenti di trascrizione (anche JSON parziale). */

const MAX_SEGMENT_START_SEC = 600

export function normalizeSegmentStart(raw) {
  let start = Number(raw)
  if (!Number.isFinite(start) || start < 0) return null
  if (start > 1000) start = start / 1000
  if (start > MAX_SEGMENT_START_SEC) return null
  return start
}

function mapSpeaker(offset, speaker) {
  const n = Number(speaker)
  const label = Number.isSafeInteger(n) && n > 0 ? n : 1
  return `Relatore ${offset + label}`
}

/** Estrae segmenti anche da JSON parziale / troncato. */
export function parseTranscriptSegments(raw, offset = 0) {
  const text = String(raw || '').trim()
  if (!text) return []

  const tryObject = (value) => {
    const list = Array.isArray(value?.segments)
      ? value.segments
      : Array.isArray(value)
        ? value
        : null
    if (!list) return null
    return list
      .map((item) => {
        const start = normalizeSegmentStart(item?.start ?? item?.startTime ?? 0)
        const body = typeof item?.text === 'string' ? item.text.trim() : ''
        if (start == null || !body) return null
        return {
          start,
          speaker: mapSpeaker(offset, item?.speaker),
          text: body,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start)
  }

  try {
    const parsed = tryObject(JSON.parse(text))
    if (parsed?.length) return parsed
  } catch {
    /* fallback */
  }

  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    try {
      const parsed = tryObject(JSON.parse(objectMatch[0]))
      if (parsed?.length) return parsed
    } catch {
      /* regex */
    }
  }

  const recovered = []
  const textRe = /"text"\s*:\s*"((?:\\.|[^"\\])*)"/g
  const startRe = /"start"\s*:\s*([\d.]+)/g
  const starts = [...text.matchAll(startRe)].map((m) => normalizeSegmentStart(m[1]))
  let index = 0
  for (const match of text.matchAll(textRe)) {
    let body = match[1]
    try {
      body = JSON.parse(`"${body}"`)
    } catch {
      body = body.replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }
    body = String(body || '').trim()
    if (!body) continue
    const start = starts[index] ?? index * 5
    index += 1
    if (start == null) continue
    recovered.push({
      start,
      speaker: mapSpeaker(offset, 1),
      text: body,
    })
  }
  if (recovered.length) return recovered.sort((a, b) => a.start - b.start)

  if (!text.startsWith('{') && !text.startsWith('[')) {
    return [{ start: 0, speaker: mapSpeaker(offset, 1), text }]
  }
  return []
}
