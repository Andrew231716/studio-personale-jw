/**
 * Estrae testo da un PDF lato browser (pdf.js).
 */
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export interface PdfPageText {
  pageNumber: number
  text: string
}

export interface PdfExtractResult {
  title: string
  pageCount: number
  pages: PdfPageText[]
  /** Testo completo unito (utile per anteprima). */
  fullText: string
}

function cleanPageText(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export async function extractTextFromPdf(
  data: ArrayBuffer,
  fileName = 'documento.pdf',
): Promise<PdfExtractResult> {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
  const pdf = await loadingTask.promise
  const pages: PdfPageText[] = []

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const parts: string[] = []
    let lastY: number | null = null

    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = String(item.str || '')
      if (!str) continue
      const y = 'transform' in item && Array.isArray(item.transform) ? Number(item.transform[5]) : null
      if (lastY !== null && y !== null && Math.abs(lastY - y) > 6) {
        parts.push('\n')
      } else if (parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
        parts.push(' ')
      }
      parts.push(str)
      if (y !== null) lastY = y
    }

    pages.push({
      pageNumber: i,
      text: cleanPageText(parts.join('')),
    })
  }

  const baseTitle = fileName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() || 'Documento PDF'
  const fullText = pages
    .map((p) => p.text)
    .filter(Boolean)
    .join('\n\n')

  return {
    title: baseTitle,
    pageCount: pdf.numPages,
    pages,
    fullText,
  }
}
