import type { ScheduledStudy } from '../types'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** Formato UTC richiesto da iCalendar: YYYYMMDDTHHMMSSZ */
export function toIcsUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  // RFC 5545: max ~75 octets per line
  if (line.length <= 74) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 74))
  rest = rest.slice(74)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 73)}`)
    rest = rest.slice(73)
  }
  return parts.join('\r\n')
}

export function buildStudyIcs(event: ScheduledStudy, appUrl = 'https://studio-personale-jw.vercel.app'): string {
  const start = new Date(event.startsAt)
  const end = new Date(start.getTime() + event.durationMinutes * 60_000)
  const now = new Date()
  const summary = escapeIcs(`Studio JW: ${event.title}`)
  const description = escapeIcs(
    [
      event.notes?.trim() || '',
      event.topicTitle ? `Argomento: ${event.topicTitle}` : '',
      'Apri JW Studio per la sessione guidata.',
      appUrl,
    ]
      .filter(Boolean)
      .join('\n'),
  )

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JW Studio//IT//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@studio-personale-jw`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${appUrl}`,
    'LOCATION:JW Studio / jw.org',
    'BEGIN:VALARM',
    `TRIGGER:-PT${Math.max(5, event.reminderMinutes || 15)}M`,
    'ACTION:DISPLAY',
    'DESCRIPTION:Promemoria: sessione di studio JW Studio',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** Scarica/apre un file .ics: su iPhone/iPad/Mac si apre in Calendario Apple. */
export function downloadAppleCalendarEvent(event: ScheduledStudy): void {
  const ics = buildStudyIcs(event)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const isAppleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isAppleTouch) {
    // Su iPad/iPhone Safari il download attribute è inaffidabile:
    // aprire il blob fa comparire “Aggiungi a Calendario”.
    window.location.href = url
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = `jw-studio-${event.startsAt.slice(0, 10)}.ics`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 4000)
}

export function defaultNextStudyLocalInput(hoursAhead = 24): string {
  const d = new Date()
  d.setHours(d.getHours() + hoursAhead, 0, 0, 0)
  // datetime-local: YYYY-MM-DDTHH:mm
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToIso(value: string): string {
  const d = new Date(value)
  return d.toISOString()
}

export function formatScheduleLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}
