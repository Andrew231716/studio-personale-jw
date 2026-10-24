import { useMemo, useRef, useState } from 'react'
import { BookOpen, FileUp, Library, Share2 } from 'lucide-react'
import type { PdfExtractResult } from '../lib/pdfExtract'

const MAX_MB = 40

type BusyKind = 'read' | 'epub' | 'jwpub' | null

export function PdfJwpubView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<BusyKind>(null)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [extract, setExtract] = useState<PdfExtractResult | null>(null)
  const [pageIdx, setPageIdx] = useState(0)

  const page = useMemo(() => {
    if (!extract?.pages.length) return null
    return extract.pages[Math.min(pageIdx, extract.pages.length - 1)]
  }, [extract, pageIdx])

  function onPick(next: File | null) {
    setError('')
    setMessage('')
    setExtract(null)
    setPageIdx(0)
    setFile(next)
    if (!next) {
      setTitle('')
      return
    }
    if (next.type && next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) {
      setError('Seleziona un file PDF.')
      setFile(null)
      return
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`Il PDF supera ${MAX_MB} MB.`)
      setFile(null)
      return
    }
    setTitle(next.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim())
  }

  async function ensureExtract(): Promise<PdfExtractResult> {
    if (extract) return extract
    if (!file) throw new Error('Carica prima un PDF.')
    setProgress('Leggo il PDF…')
    const { extractTextFromPdf } = await import('../lib/pdfExtract')
    const result = await extractTextFromPdf(await file.arrayBuffer(), file.name)
    setExtract(result)
    if (!title.trim()) setTitle(result.title)
    return result
  }

  async function runRead() {
    if (!file) {
      setError('Carica prima un PDF.')
      return
    }
    setBusy('read')
    setError('')
    setMessage('')
    try {
      const result = await ensureExtract()
      setPageIdx(0)
      setProgress('')
      setMessage(
        result.fullText.trim()
          ? `Pronto: ${result.pageCount} pagine. Scorri sotto per leggere.`
          : 'PDF letto, ma non c’è testo estraibile (probabile scansione solo immagini).',
      )
    } catch (e) {
      setProgress('')
      setError(e instanceof Error ? e.message : 'Lettura non riuscita')
    } finally {
      setBusy(null)
    }
  }

  async function runEpub() {
    if (!file) {
      setError('Carica prima un PDF.')
      return
    }
    setBusy('epub')
    setError('')
    setMessage('')
    setProgress('Creo EPUB…')
    try {
      const { convertPdfToEpub } = await import('../lib/pdfToEpub')
      const result = await convertPdfToEpub({
        file,
        fileName: file.name,
        title: title.trim() || undefined,
      })
      setExtract(result.extract)
      setProgress('')
      setMessage(
        `EPUB scaricato (${result.fileName}, ${result.pageCount} pagine). Aprilo con Libri / Apple Books.`,
      )
    } catch (e) {
      setProgress('')
      setError(e instanceof Error ? e.message : 'Creazione EPUB non riuscita')
    } finally {
      setBusy(null)
    }
  }

  async function runJwpub(share: boolean) {
    if (!file) {
      setError('Carica prima un PDF.')
      return
    }
    setBusy('jwpub')
    setError('')
    setMessage('')
    setProgress('Creo .jwpub…')
    try {
      const { convertPdfToJwpub } = await import('../lib/pdfToJwpub')
      const result = await convertPdfToJwpub({
        file,
        fileName: file.name,
        title: title.trim() || undefined,
        section: 'manuali',
        share,
      })
      setExtract(result.extract)
      setProgress('')
      setMessage(
        [
          `File ${result.fileName} creato.`,
          result.shared
            ? 'Foglio di condivisione aperto.'
            : 'File scaricato.',
          'Attenzione: da JW Library 15.6 (dicembre 2025) i .jwpub personali non firmati vengono rifiutati su iPhone/iPad. Usa EPUB o la lettura in app.',
        ].join(' '),
      )
    } catch (e) {
      setProgress('')
      setError(e instanceof Error ? e.message : 'Creazione .jwpub non riuscita')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <p className="section-kicker">Documenti</p>
        <h2>PDF → studio</h2>
        <p className="lede">
          Carica un PDF con testo, leggilo qui oppure esportalo in EPUB per Libri / Apple Books.
        </p>

        <div
          className="dropzone"
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(e) => {
            e.preventDefault()
            const f = e.dataTransfer.files?.[0]
            if (f) onPick(f)
          }}
        >
          <FileUp size={28} strokeWidth={1.8} />
          <strong>{file ? file.name : 'Trascina qui un PDF oppure tocca per scegliere'}</strong>
          <span className="muted">
            {file
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `Massimo ${MAX_MB} MB · testo selezionabile (non solo immagini)`}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="pdf-title">Titolo</label>
          <input
            id="pdf-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo del documento"
            disabled={!file || !!busy}
          />
        </div>

        <div className="row" style={{ marginTop: '0.85rem' }}>
          <button
            className="btn accent"
            type="button"
            disabled={!file || !!busy}
            onClick={() => void runRead()}
          >
            <BookOpen size={16} />
            {busy === 'read' ? 'Leggo…' : 'Leggi nell’app'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!file || !!busy}
            onClick={() => void runEpub()}
          >
            <Library size={16} />
            {busy === 'epub' ? 'Creo EPUB…' : 'Scarica EPUB'}
          </button>
        </div>

        {progress && <p className="muted">{progress}</p>}
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
      </section>

      {page && extract && (
        <section className="panel">
          <p className="section-kicker">Lettura</p>
          <h2>{title || extract.title}</h2>
          <p className="lede">
            Pagina {page.pageNumber} di {extract.pageCount}
          </p>
          <div className="row" style={{ marginBottom: '0.75rem' }}>
            <button
              className="btn secondary small"
              type="button"
              disabled={pageIdx <= 0}
              onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
            >
              Precedente
            </button>
            <button
              className="btn secondary small"
              type="button"
              disabled={pageIdx >= extract.pages.length - 1}
              onClick={() => setPageIdx((i) => Math.min(extract.pages.length - 1, i + 1))}
            >
              Successiva
            </button>
          </div>
          <pre className="pdf-preview pdf-reader">{page.text || '(Nessun testo in questa pagina)'}</pre>
        </section>
      )}

      <section className="panel">
        <p className="section-kicker">Avanzato</p>
        <h2>File .jwpub (JW Library)</h2>
        <p className="lede">
          Da dicembre 2025 JW Library (15.6+) richiede una firma digitale ufficiale (JASPER) e
          rifiuta i .jwpub personali su iPhone e iPad. Puoi comunque scaricare il file, ma
          l’installazione probabilmente fallirà.
        </p>
        <div className="row">
          <button
            className="btn secondary"
            type="button"
            disabled={!file || !!busy}
            onClick={() => void runJwpub(false)}
          >
            <Share2 size={16} />
            {busy === 'jwpub' ? 'Creo…' : 'Scarica .jwpub comunque'}
          </button>
        </div>
        <p className="footnote" style={{ marginTop: '0.85rem' }}>
          Percorso consigliato: <strong>Leggi nell’app</strong> oppure <strong>EPUB</strong> (Libri).
          Il .jwpub resta solo per chi usa versioni vecchie di JW Library o strumenti desktop.
        </p>
      </section>
    </div>
  )
}
