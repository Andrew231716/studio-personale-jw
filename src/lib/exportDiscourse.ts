import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { SECTION_KIND_LABEL, ensureSections, totalMinutes } from './discourseStructure'
import type { DiscourseNote } from '../types'

function slug(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9àèéìòù]+/gi, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'discorso'
  )
}

export function discourseToPlainText(note: DiscourseNote): string {
  const sections = ensureSections(note)
  const lines = [
    note.title || 'Discorso',
    `Durata stimata: ${totalMinutes(sections)} min`,
    '',
  ]
  for (const s of sections) {
    lines.push(`## ${s.title || SECTION_KIND_LABEL[s.kind]} (${s.minutes} min)`)
    lines.push(s.body.trim() || '(vuoto)')
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}

export function downloadDiscourseText(note: DiscourseNote): void {
  const blob = new Blob([discourseToPlainText(note)], {
    type: 'text/plain;charset=utf-8',
  })
  saveAs(blob, `jw-studio-discorso-${slug(note.title)}.txt`)
}

export async function exportDiscoursePdf(note: DiscourseNote): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const width = 210 - margin * 2
  let y = 20
  const sections = ensureSections(note)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(note.title || 'Discorso', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(80)
  doc.text(`Durata stimata: ${totalMinutes(sections)} min · JW Studio`, margin, y)
  y += 10
  doc.setTextColor(20)

  for (const s of sections) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(`${s.title || SECTION_KIND_LABEL[s.kind]} · ${s.minutes} min`, margin, y)
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    const lines = doc.splitTextToSize(s.body.trim() || '(vuoto)', width) as string[]
    for (const line of lines) {
      if (y > 280) {
        doc.addPage()
        y = 20
      }
      doc.text(line, margin, y)
      y += 5.5
    }
    y += 6
  }

  doc.save(`jw-studio-discorso-${slug(note.title)}.pdf`)
}

export async function exportDiscourseEpub(note: DiscourseNote): Promise<void> {
  const sections = ensureSections(note)
  const title = note.title || 'Discorso'
  const body = sections
    .map(
      (s) =>
        `<section><h2>${escapeXml(s.title || SECTION_KIND_LABEL[s.kind])} <small>(${s.minutes} min)</small></h2><p>${escapeXml(s.body || '(vuoto)').replace(/\n/g, '<br/>')}</p></section>`,
    )
    .join('\n')

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.folder('META-INF')?.file(
    'container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  )
  const oebps = zip.folder('OEBPS')
  oebps?.file(
    'content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(title)}</dc:title><dc:creator>JW Studio</dc:creator><dc:language>it</dc:language><dc:identifier id="BookId">discorso-${note.id}</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="c1"/></spine></package>`,
  )
  oebps?.file(
    'toc.ncx',
    `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><docTitle><text>${escapeXml(title)}</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>${escapeXml(title)}</text></navLabel><content src="chapter1.xhtml"/></navPoint></navMap></ncx>`,
  )
  oebps?.file(
    'chapter1.xhtml',
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeXml(title)}</title><style>body{font-family:Georgia,serif;line-height:1.5;margin:1em}h1{font-size:1.5rem}h2{font-size:1.15rem;margin-top:1.2em}small{color:#666;font-weight:normal}</style></head><body><h1>${escapeXml(title)}</h1><p>Durata stimata: ${totalMinutes(sections)} min</p>${body}</body></html>`,
  )
  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  saveAs(blob, `jw-studio-discorso-${slug(note.title)}.epub`)
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
