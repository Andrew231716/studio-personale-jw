import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { StudySummary } from './studySummary'
import { summaryToHtml, summaryToPlainText } from './studySummary'
import { buildJwpub, type JwpubSectionId } from './jwpub'

function slugPeriod(summary: StudySummary): string {
  const d = summary.range.start.toISOString().slice(0, 10)
  return `jw-studio-riepilogo-${summary.period}-${d}`
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  lines.forEach((line) => {
    if (y > 280) {
      doc.addPage()
      y = 20
    }
    doc.text(line, x, y)
    y += lineHeight
  })
  return y
}

export async function exportSummaryPdf(summary: StudySummary): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18
  const width = 210 - margin * 2
  let y = 22

  doc.setFont('times', 'bold')
  doc.setFontSize(18)
  y = wrapText(doc, 'JW Studio — Riepilogo studio personale', margin, y, width, 8)
  y += 4
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  y = wrapText(doc, summary.range.label, margin, y, width, 6)
  y = wrapText(
    doc,
    `Generato: ${new Date(summary.generatedAt).toLocaleString('it-IT')} · Sessioni: ${summary.sessions.length} · Minuti: ${summary.totalMinutes}`,
    margin,
    y,
    width,
    6,
  )
  y += 6

  const text = summaryToPlainText(summary)
  const body = text.split('\n').slice(4).join('\n')
  doc.setFontSize(10)
  wrapText(doc, body || 'Nessuno studio in questo periodo.', margin, y, width, 5.2)

  doc.save(`${slugPeriod(summary)}.pdf`)
}

function epubEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function exportSummaryEpub(summary: StudySummary): Promise<void> {
  const zip = new JSZip()
  const title = `Riepilogo JW Studio — ${summary.range.label}`
  const htmlBody = summaryToHtml(summary)
    .replace(/^[\s\S]*<body>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '')

  zip.file(
    'mimetype',
    'application/epub+zip',
    { compression: 'STORE' },
  )
  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  const oebps = zip.folder('OEBPS')
  oebps?.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${epubEscape(title)}</dc:title>
    <dc:creator>JW Studio</dc:creator>
    <dc:language>it</dc:language>
    <dc:identifier id="BookId">jw-studio-${summary.generatedAt}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chapter1"/>
  </spine>
</package>`,
  )
  oebps?.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="jw-studio-${summary.generatedAt}"/>
  </head>
  <docTitle><text>${epubEscape(title)}</text></docTitle>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Riepilogo</text></navLabel>
      <content src="chapter1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`,
  )
  oebps?.file(
    'chapter1.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="it">
<head><title>${epubEscape(title)}</title>
<style type="text/css">
body{font-family:serif;line-height:1.45;margin:1em}
h1,h2{letter-spacing:-0.02em}
</style>
</head>
<body>${htmlBody}</body>
</html>`,
  )

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  saveAs(blob, `${slugPeriod(summary)}.epub`)
}

function escapePubHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraph(text: string, pid: { n: number }): string {
  pid.n += 1
  return `<p id="p${pid.n}" data-pid="${pid.n}">${escapePubHtml(text)}</p>`
}

function heading(text: string, pid: { n: number }): string {
  pid.n += 1
  return `<h2 id="p${pid.n}" data-pid="${pid.n}">${escapePubHtml(text)}</h2>`
}

/** HTML per documenti della pubblicazione JW Library. */
function summaryToJwpubDocuments(summary: StudySummary): Array<{ title: string; html: string }> {
  const docs: Array<{ title: string; html: string }> = []
  const introPid = { n: 0 }
  const introParts = [
    heading('Riepilogo studio personale', introPid),
    paragraph(summary.range.label, introPid),
    paragraph(
      `Generato il ${new Date(summary.generatedAt).toLocaleString('it-IT')}. Sessioni: ${summary.sessions.length}. Minuti: ${summary.totalMinutes}.`,
      introPid,
    ),
    paragraph(
      'Pubblicazione personale creata con JW Studio. Non è materiale ufficiale di jw.org. Puoi aggiungerla ai Preferiti in JW Library.',
      introPid,
    ),
  ]
  if (!summary.sessions.length && !summary.topics.length && !summary.decisions.length) {
    introParts.push(paragraph('Nessuno studio registrato in questo periodo.', introPid))
  }
  docs.push({ title: 'Introduzione', html: introParts.join('\n') })

  summary.sessions.forEach((s, i) => {
    const pid = { n: 0 }
    const parts = [
      heading(s.topicTitle, pid),
      paragraph(
        `${new Date(s.completedAt).toLocaleString('it-IT')} · ${s.minutesSpent} min`,
        pid,
      ),
    ]
    const fields: Array<[string, string | undefined]> = [
      ['Preghiera', s.prayer],
      ['Obiettivo', s.goal],
      ['Materiale', s.resourceTitle],
      ['Scrittura', s.keyVerse],
      ['Highlight', s.highlight],
      ['Riflessione', s.reflection],
      ['Domanda', s.question],
      ['Risposta', s.answer],
      ['Pratica', s.practice],
      ['Gratitudine', s.gratitude],
    ]
    fields.forEach(([label, value]) => {
      if (value?.trim()) parts.push(paragraph(`${label}: ${value}`, pid))
    })
    docs.push({ title: `Sessione ${i + 1}: ${s.topicTitle}`, html: parts.join('\n') })
  })

  summary.topics.forEach((t) => {
    const pid = { n: 0 }
    const parts = [heading(t.title, pid)]
    if (t.interest) parts.push(paragraph(`Interesse: ${t.interest}`, pid))
    t.objectives.filter(Boolean).forEach((o) => parts.push(paragraph(`Obiettivo: ${o}`, pid)))
    t.reflections
      .filter((r) => r.response.trim())
      .forEach((r) => {
        parts.push(paragraph(r.prompt, pid))
        parts.push(paragraph(r.response, pid))
      })
    t.questions
      .filter((q) => q.question.trim() || q.answer.trim())
      .forEach((q) => {
        if (q.question) parts.push(paragraph(`Domanda: ${q.question}`, pid))
        if (q.answer) parts.push(paragraph(`Risposta: ${q.answer}`, pid))
      })
    t.practices
      .filter((p) => p.action.trim())
      .forEach((p) =>
        parts.push(
          paragraph(
            `Pratica${p.tried ? ' (provata)' : ''}: ${p.action}${p.outcome ? ` → ${p.outcome}` : ''}`,
            pid,
          ),
        ),
      )
    docs.push({ title: `Quaderno: ${t.title}`, html: parts.join('\n') })
  })

  summary.decisions.forEach((d) => {
    const pid = { n: 0 }
    const parts = [heading(`${d.title} (${d.scale})`, pid)]
    if (d.context) parts.push(paragraph(`Contesto: ${d.context}`, pid))
    if (d.conclusion) parts.push(paragraph(`Conclusione: ${d.conclusion}`, pid))
    if (d.prayerNotes) parts.push(paragraph(`Preghiera: ${d.prayerNotes}`, pid))
    docs.push({ title: `Decisione: ${d.title}`, html: parts.join('\n') })
  })

  return docs
}

/**
 * Esporta il riepilogo come pubblicazione .jwpub per JW Library.
 * Dopo l’import in JW Library puoi aprirla e aggiungerla ai Preferiti.
 * Non è un backup note (.jwlibrary).
 */
export async function exportSummaryJwpub(
  summary: StudySummary,
  section: JwpubSectionId = 'opuscoli',
): Promise<void> {
  const start = summary.range.start
  const yy = String(start.getFullYear()).slice(2)
  const mm = String(start.getMonth() + 1).padStart(2, '0')
  const dd = String(start.getDate()).padStart(2, '0')
  // Simbolo personalizzato (non ufficiale) + data periodo, per evitare collisioni.
  const symbol = `jws${yy}${mm}${dd}`.slice(0, 12)
  const year = start.getFullYear()
  const title = `JW Studio — ${summary.range.label}`
  const documents = summaryToJwpubDocuments(summary)

  const blob = await buildJwpub({
    symbol,
    title,
    year,
    mepsLanguageIndex: 2, // Italiano
    languageLetter: 'I',
    documents,
    section,
  })

  saveAs(blob, `${symbol}_I.jwpub`)
}

/** @deprecated Usa exportSummaryJwpub — pubblicazione, non backup note. */
export async function exportSummaryJwlibraryPackage(
  summary: StudySummary,
  section: JwpubSectionId = 'opuscoli',
): Promise<void> {
  return exportSummaryJwpub(summary, section)
}
