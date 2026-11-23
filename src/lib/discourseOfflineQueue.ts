/**
 * Coda trascrizioni Discorso: se offline (o fallisce), ritenta appena torna la rete.
 */

const KEY = 'jw-discourse-transcribe-queue'

export type PendingTranscription = {
  recordingId: string
  discourseId: string
  createdAt: string
  attempts: number
  lastError?: string
}

function readQueue(): PendingTranscription[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PendingTranscription[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(items: PendingTranscription[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 40)))
  } catch {
    /* quota */
  }
}

export function listPendingTranscriptions(): PendingTranscription[] {
  return readQueue()
}

export function enqueueTranscription(
  recordingId: string,
  discourseId: string,
  lastError?: string,
): void {
  const items = readQueue().filter((item) => item.recordingId !== recordingId)
  items.unshift({
    recordingId,
    discourseId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError,
  })
  writeQueue(items)
}

export function dequeueTranscription(recordingId: string): void {
  writeQueue(readQueue().filter((item) => item.recordingId !== recordingId))
}

export function bumpTranscriptionAttempt(recordingId: string, lastError?: string): void {
  writeQueue(
    readQueue().map((item) =>
      item.recordingId === recordingId
        ? { ...item, attempts: item.attempts + 1, lastError }
        : item,
    ),
  )
}

/**
 * Processa la coda quando online.
 * `transcribe` deve salvare il risultato sul recording.
 */
export async function processTranscriptionQueue(opts: {
  online: boolean
  discourseId?: string | null
  transcribe: (recordingId: string) => Promise<void>
  onProgress?: (msg: string) => void
}): Promise<number> {
  if (!opts.online) return 0
  const pending = readQueue().filter(
    (item) => !opts.discourseId || item.discourseId === opts.discourseId,
  )
  let done = 0
  for (const item of pending) {
    if (item.attempts >= 5) continue
    opts.onProgress?.(`Trascrizione in coda: riprovo ${item.recordingId.slice(0, 10)}…`)
    try {
      await opts.transcribe(item.recordingId)
      dequeueTranscription(item.recordingId)
      done++
    } catch (error) {
      bumpTranscriptionAttempt(
        item.recordingId,
        error instanceof Error ? error.message : 'Errore',
      )
    }
  }
  return done
}
