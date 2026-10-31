import { useMemo, useRef, useState } from 'react'
import { BookOpen, Library, FileUp, NotebookPen } from 'lucide-react'
import { SectionProgress } from '../components/SectionProgress'
import type { PdfExtractResult } from '../lib/pdfExtract'
import { useAppStore } from '../store/useAppStore'

const MAX_MB = 40

type BusyKind = 'read' | 'epub' | null

export function PdfJwpubView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const createTopic = useAppStore((s) => s.createTopic)
  const updateTopic = useAppStore((s) => s.updateTopic)
  const setActiveTopic = useAppStore((s) => s.setActiveTopic)
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

  return (
    <div className="stack">
      <SectionProgress section="pdfJwpub" />
      <section className="panel">
        <p className="section-kicker">Documenti</p>
        <h2>PDF → EPUB</h2>
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

        <div className="row" style={{ marginTop: '0.85rem', flexWrap: 'wrap', gap: 8 }}>
          <button
            className="btn accent"
            type="button"
            disabled={!file || !!busy}
            onClick={() => void runEpub()}
          >
            <Library size={16} />
            {busy === 'epub' ? 'Creo EPUB…' : 'Crea EPUB'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!file || !!busy}
            onClick={() => void runRead()}
          >
            <BookOpen size={16} />
            {busy === 'read' ? 'Leggo…' : 'Leggi nell’app'}
          </button>
          {extract && (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                const excerpt = extract.pages
                  .slice(0, 3)
                  .map((p) => p.text)
                  .filter(Boolean)
                  .join('\n\n')
                  .slice(0, 2500)
                const id = createTopic(
                  title || extract.title || 'Studio da PDF',
                  'Creato da un PDF caricato nell’app',
                )
                const topic = useAppStore.getState().topics.find((t) => t.id === id)
                updateTopic(id, {
                  status: 'in_corso',
                  reflections: [
                    {
                      id: `pdf-${Date.now()}`,
                      prompt: 'Estratto dal PDF (prime pagine)',
                      response: excerpt || '(Nessun testo estratto)',
                    },
                    ...(topic?.reflections || []),
                  ],
                })
                setActiveTopic(id)
                setMessage('Argomento creato nel Quaderno con un estratto del PDF.')
              }}
            >
              <NotebookPen size={16} /> Crea argomento nel Quaderno
            </button>
          )}
        </div>

        {progress && <p className="muted">{progress}</p>}
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <p className="footnote" style={{ marginTop: '0.9rem' }}>
          L’EPUB si apre con l’app Libri (iPhone/iPad). Funziona con PDF che contengono testo; se è
          una scansione solo immagini, prima applica OCR.
        </p>
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
    </div>
  )
}
