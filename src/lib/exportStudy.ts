import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { StudySummary } from './studySummary'
import { summaryToHtml, summaryToPlainText } from './studySummary'

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

/**
 * Pacchetto personale .jwlibrary (ZIP):
 * contiene le tue note in formato leggibile + JSON.
 * Non è un backup ufficiale generato da JW Library: l’app ufficiale
 * potrebbe non importarlo. Serve come archivio personale delle note.
 */
export async function exportSummaryJwlibraryPackage(summary: StudySummary): Promise<void> {
  const zip = new JSZip()
  const plain = summaryToPlainText(summary)
  const html = summaryToHtml(summary)

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        name: 'JW Studio — esportazione note personali',
        type: 'jw-studio-notes-export',
        version: 1,
        created: summary.generatedAt,
        period: summary.period,
        label: summary.range.label,
        sessions: summary.sessions.length,
        notice:
          'Questo file raccoglie le tue note di studio personali. Non è un backup ufficiale di JW Library e potrebbe non essere importabile dall’app.',
      },
      null,
      2,
    ),
  )
  zip.file('LEGGIMI.txt', `JW Studio — pacchetto note (.jwlibrary)

Questo archivio contiene il riepilogo del tuo studio personale per:
${summary.range.label}

Formati inclusi:
- notes.md / notes.txt : testo
- notes.html : pagina leggibile
- sessions.json : dati strutturati

Nota importante:
JW Library importa solo i backup che genera l’app stessa.
Questo pacchetto serve come archivio personale delle tue risposte e riflessioni.
Per rileggere o stampare usa il PDF o l’EPUB esportati da JW Studio.
`)
  zip.file('notes.txt', plain)
  zip.file('notes.md', `# ${summary.range.label}\n\n${plain}`)
  zip.file('notes.html', html)
  zip.file(
    'sessions.json',
    JSON.stringify(
      {
        generatedAt: summary.generatedAt,
        period: summary.period,
        range: {
          start: summary.range.start.toISOString(),
          end: summary.range.end.toISOString(),
          label: summary.range.label,
        },
        totalMinutes: summary.totalMinutes,
        sessions: summary.sessions,
        topics: summary.topics,
        decisions: summary.decisions,
      },
      null,
      2,
    ),
  )

  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, `${slugPeriod(summary)}.jwlibrary`)
}
