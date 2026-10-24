/**
 * Converte un PDF (testo estraibile) in pubblicazione .jwpub per JW Library.
 */
import { saveAs } from 'file-saver'
import { buildJwpub, type JwpubDocument, type JwpubSectionId } from './jwpub'
import { extractTextFromPdf, type PdfExtractResult } from './pdfExtract'

const MAX_CHARS_PER_DOC = 4500

export interface PdfToJwpubOptions {
  file: File | Blob
  fileName?: string
  title?: string
  section?: JwpubSectionId
  /** Se true, prova anche Web Share verso JW Library (iOS/Android). */
  share?: boolean
}

export interface PdfToJwpubResult {
  fileName: string
  blob: Blob
  title: string
  documentCount: number
  pageCount: number
  shared: boolean
  extract: PdfExtractResult
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToHtmlParagraphs(text: string, startPid = 1): string {
  const paras = text
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (paras.length === 0) {
    return `<p id="p${startPid}" data-pid="${startPid}">(Pagina senza testo estraibile)</p>`
  }
  return paras
    .map((p, i) => {
      const pid = startPid + i
      return `<p id="p${pid}" data-pid="${pid}">${escapeHtml(p)}</p>`
    })
    .join('\n')
}

/** Raggruppa pagine in documenti di dimensione leggibile. */
export function pagesToJwpubDocuments(
  extract: PdfExtractResult,
  publicationTitle: string,
): JwpubDocument[] {
  const docs: JwpubDocument[] = []
  let buffer: string[] = []
  let pageStart = 1
  let pageEnd = 1

  const flush = () => {
    if (buffer.length === 0) return
    const label =
      pageStart === pageEnd ? `Pagina ${pageStart}` : `Pagine ${pageStart}–${pageEnd}`
    const body = buffer.join('\n\n')
    docs.push({
      title: label,
      html: textToHtmlParagraphs(body),
    })
    buffer = []
  }

  for (const page of extract.pages) {
    const chunk = page.text.trim()
    if (!chunk) {
      if (buffer.length === 0) {
        pageStart = page.pageNumber
      }
      pageEnd = page.pageNumber
      buffer.push('(Pagina senza testo estraibile — probabilmente solo immagini.)')
      flush()
      pageStart = page.pageNumber + 1
      continue
    }

    const nextLen = buffer.join('\n\n').length + chunk.length
    if (buffer.length > 0 && nextLen > MAX_CHARS_PER_DOC) {
      flush()
      pageStart = page.pageNumber
    }
    if (buffer.length === 0) pageStart = page.pageNumber
    pageEnd = page.pageNumber
    buffer.push(chunk)
  }
  flush()

  if (docs.length === 0) {
    docs.push({
      title: 'Contenuto',
      html: textToHtmlParagraphs(
        'Non è stato possibile estrarre testo da questo PDF. Se il file è solo immagini, usa un OCR e riprova.',
      ),
    })
  }

  // Copertina / indice in testa
  const toc = docs
    .map((d, i) => `${i + 1}. ${d.title}`)
    .join('\n')
  docs.unshift({
    title: 'Copertina',
    html: textToHtmlParagraphs(
      [
        publicationTitle,
        '',
        'Pubblicazione personale creata con JW Studio da un PDF.',
        'Non è materiale ufficiale di jw.org.',
        '',
        'Indice',
        toc,
      ].join('\n'),
    ),
  })

  return docs
}

function makeSymbol(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 6)
  const stamp = Date.now().toString(36).slice(-5)
  return (`pdf${base}${stamp}` || `pdf${stamp}`).slice(0, 12)
}

async function tryShareFile(blob: Blob, fileName: string, title: string): Promise<boolean> {
  try {
    const file = new File([blob], fileName, { type: 'application/jwpub' })
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false
    await navigator.share({
      files: [file],
      title,
      text: 'Apri con JW Library',
    })
    return true
  } catch {
    return false
  }
}

export async function convertPdfToJwpub(options: PdfToJwpubOptions): Promise<PdfToJwpubResult> {
  const fileName =
    options.fileName ||
    (options.file instanceof File ? options.file.name : 'documento.pdf')
  const buffer = await options.file.arrayBuffer()
  const extract = await extractTextFromPdf(buffer, fileName)
  const title = (options.title || extract.title).trim() || 'Documento PDF'
  const section = options.section ?? 'opuscoli'
  const documents = pagesToJwpubDocuments(extract, title)
  const year = new Date().getFullYear()
  const symbol = makeSymbol(fileName)

  const blob = await buildJwpub({
    symbol,
    title,
    year,
    mepsLanguageIndex: 2,
    languageLetter: 'I',
    documents,
    section,
  })

  const outName = `${symbol}_I.jwpub`
  saveAs(blob, outName)

  let shared = false
  if (options.share !== false) {
    shared = await tryShareFile(blob, outName, title)
  }

  return {
    fileName: outName,
    blob,
    title,
    documentCount: documents.length,
    pageCount: extract.pageCount,
    shared,
    extract,
  }
}
