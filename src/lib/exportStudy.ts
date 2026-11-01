import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import {
  buildSummaryBlocks,
  summaryToHtml,
  type StudySummary,
  type SummaryBlock,
} from './studySummary'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = PAGE_H - 12

function slugPeriod(summary: StudySummary): string {
  if (summary.slug?.trim()) return summary.slug.trim()
  const d = summary.range.start.toISOString().slice(0, 10)
  return `jw-studio-riepilogo-${summary.period}-${d}`
}

type PdfDoc = jsPDF & { __pageNo?: number }

function ensureSpace(doc: PdfDoc, y: number, needed: number): number {
  if (y + needed <= FOOTER_Y - 4) return y
  addFooter(doc)
  doc.addPage()
  doc.__pageNo = (doc.__pageNo || 1) + 1
  return MARGIN + 4
}

function addFooter(doc: PdfDoc) {
  const page = doc.__pageNo || doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 115, 108)
  doc.text('JW Studio · riepilogo personale', MARGIN, FOOTER_Y)
  doc.text(String(page), PAGE_W - MARGIN, FOOTER_Y, { align: 'right' })
  doc.setTextColor(22, 48, 44)
}

function writeWrapped(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeight)
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

function drawRule(doc: PdfDoc, y: number, color: [number, number, number] = [213, 224, 219]) {
  doc.setDrawColor(...color)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
}

function writeField(doc: PdfDoc, label: string, value: string, y: number): number {
  y = ensureSpace(doc, y, 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(47, 111, 106)
  doc.text(label.toUpperCase(), MARGIN, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(22, 48, 44)
  for (const para of value.split(/\n+/).filter(Boolean)) {
    y = writeWrapped(doc, para, MARGIN, y, CONTENT_W, 5.2)
    y += 1.5
  }
  return y + 2.5
}

function writeList(doc: PdfDoc, title: string, items: string[], y: number): number {
  y = ensureSpace(doc, y, 12)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(47, 111, 106)
  doc.text(title.toUpperCase(), MARGIN, y)
  y += 5.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  doc.setTextColor(22, 48, 44)
  for (const item of items) {
    const bulletIndent = 5
    const lines = doc.splitTextToSize(item.replace(/\n/g, ' — '), CONTENT_W - bulletIndent) as string[]
    y = ensureSpace(doc, y, 5.2)
    doc.text('•', MARGIN, y)
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) y = ensureSpace(doc, y, 5.2)
      doc.text(lines[i], MARGIN + bulletIndent, y)
      y += 5.2
    }
    y += 1.8
  }
  return y + 1.5
}

function writeBlock(doc: PdfDoc, block: SummaryBlock, y: number): number {
  y = ensureSpace(doc, y, 22)
  if (block.subtitle) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(47, 111, 106)
    doc.text(block.subtitle.toUpperCase(), MARGIN, y)
    y += 5
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(22, 48, 44)
  y = writeWrapped(doc, block.title, MARGIN, y, CONTENT_W, 6.2)
  y += 3
  drawRule(doc, y)
  y += 6

  for (const field of block.fields) {
    y = writeField(doc, field.label, field.value, y)
  }
  for (const list of block.lists || []) {
    y = writeList(doc, list.title, list.items, y)
  }
  return y + 4
}

export async function exportSummaryPdf(summary: StudySummary): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfDoc
  doc.__pageNo = 1
  let y = MARGIN + 2

  // Copertina sintetica
  doc.setFillColor(18, 74, 74)
  doc.rect(0, 0, PAGE_W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('JW STUDIO', MARGIN, 12)
  doc.setFontSize(16)
  doc.text(summary.heading || 'Riepilogo di studio', MARGIN, 21)
  y = 36

  doc.setTextColor(47, 111, 106)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  y = writeWrapped(doc, summary.range.label, MARGIN, y, CONTENT_W, 6)
  y += 3

  doc.setFontSize(10)
  doc.setTextColor(91, 115, 108)
  const stats = [
    `${summary.sessions.length} session${summary.sessions.length === 1 ? 'e' : 'i'}`,
    `${summary.totalMinutes} minuti`,
    `${summary.topics.length} argoment${summary.topics.length === 1 ? 'o' : 'i'}`,
  ].join('   ·   ')
  y = writeWrapped(doc, stats, MARGIN, y, CONTENT_W, 5)
  y += 1
  y = writeWrapped(
    doc,
    `Generato il ${new Date(summary.generatedAt).toLocaleString('it-IT')}`,
    MARGIN,
    y,
    CONTENT_W,
    5,
  )
  y += 4
  drawRule(doc, y, [18, 74, 74])
  y += 8

  const blocks = buildSummaryBlocks(summary)
  if (!blocks.length) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(22, 48, 44)
    y = writeWrapped(doc, 'Nessuno studio registrato in questo periodo.', MARGIN, y, CONTENT_W, 6)
  } else {
    for (const block of blocks) {
      y = writeBlock(doc, block, y)
    }
  }

  y = ensureSpace(doc, y, 16)
  drawRule(doc, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(91, 115, 108)
  writeWrapped(
    doc,
    'Fine riepilogo · App non affiliata a jw.org · Contenuto personale dell’utente.',
    MARGIN,
    y,
    CONTENT_W,
    4.5,
  )

  addFooter(doc)
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
  const title = `${summary.heading || 'Riepilogo JW Studio'} — ${summary.range.label}`
  const htmlBody = summaryToHtml(summary)
    .replace(/^[\s\S]*<body>/i, '')
    .replace(/<\/body>[\s\S]*$/i, '')

  const style = `body{font-family:Georgia,serif;line-height:1.55;margin:1em;color:#16302c}
.brand{margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#2f6f6a;font-weight:700}
h1{font-size:1.7rem;line-height:1.15;margin:.35rem 0 .5rem}
.period{margin:0;color:#2f6f6a}
.stats{margin:1rem 0 .55rem}
.stats span{display:inline-block;margin:0 .35rem .35rem 0;padding:.2rem .55rem;border:1px solid #d5e0db;border-radius:999px;font-size:.85rem;background:#e7f0ec}
.meta,.kicker{color:#5b736c;font-size:.9rem}
.kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;font-weight:700;margin:0 0 .2rem}
.block{margin:1.35rem 0;padding:0 0 1rem;border-bottom:1px solid #d5e0db}
h2{margin:0 0 .75rem;font-size:1.3rem}
h3{margin:0 0 .2rem;font-size:.75rem;letter-spacing:.06em;text-transform:uppercase;color:#2f6f6a}
.field{margin:0 0 .8rem}
.field p{margin:.15rem 0 0}
ul{margin:.3rem 0 0;padding-left:1.1rem}
li{margin:.3rem 0}
footer{margin-top:1.5rem;color:#5b736c;font-size:.85rem}`

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
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
<style type="text/css">${style}</style>
</head>
<body>${htmlBody}</body>
</html>`,
  )

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  saveAs(blob, `${slugPeriod(summary)}.epub`)
}
