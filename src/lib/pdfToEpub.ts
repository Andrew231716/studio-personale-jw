/**
 * Converte testo estratto da PDF in EPUB leggibile (Libri / Apple Books).
 */
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { extractTextFromPdf, type PdfExtractResult } from './pdfExtract'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pageToXhtml(title: string, body: string): string {
  const paras = body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const html =
    paras.length > 0
      ? paras.map((p) => `<p>${escapeXml(p)}</p>`).join('\n')
      : '<p><em>(Pagina senza testo estraibile)</em></p>'
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="it" lang="it">
<head>
  <title>${escapeXml(title)}</title>
  <style type="text/css">
    body { font-family: Georgia, serif; line-height: 1.5; margin: 1.2em; }
    h1 { font-size: 1.35em; letter-spacing: -0.02em; }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  ${html}
</body>
</html>`
}

export async function convertPdfToEpub(options: {
  file: File | Blob
  fileName?: string
  title?: string
}): Promise<{ fileName: string; pageCount: number; extract: PdfExtractResult }> {
  const fileName =
    options.fileName || (options.file instanceof File ? options.file.name : 'documento.pdf')
  const buffer = await options.file.arrayBuffer()
  const extract = await extractTextFromPdf(buffer, fileName)
  const title = (options.title || extract.title).trim() || 'Documento PDF'

  const zip = new JSZip()
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

  const pages = extract.pages.length > 0 ? extract.pages : [{ pageNumber: 1, text: extract.fullText }]
  const oebps = zip.folder('OEBPS')
  const manifestItems: string[] = [
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
  ]
  const spine: string[] = []
  const navPoints: string[] = []

  pages.forEach((page, i) => {
    const id = `page${i + 1}`
    const href = `${id}.xhtml`
    const pageTitle = `Pagina ${page.pageNumber}`
    manifestItems.push(`<item id="${id}" href="${href}" media-type="application/xhtml+xml"/>`)
    spine.push(`<itemref idref="${id}"/>`)
    navPoints.push(`<navPoint id="nav-${id}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(pageTitle)}</text></navLabel>
      <content src="${href}"/>
    </navPoint>`)
    oebps?.file(href, pageToXhtml(pageTitle, page.text))
  })

  const uid = `jw-studio-pdf-${Date.now()}`
  oebps?.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>JW Studio</dc:creator>
    <dc:language>it</dc:language>
    <dc:identifier id="BookId">${uid}</dc:identifier>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
</package>`,
  )
  oebps?.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${uid}"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`,
  )

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  const outName = `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'documento'}.epub`
  saveAs(blob, outName)
  return { fileName: outName, pageCount: extract.pageCount, extract }
}
