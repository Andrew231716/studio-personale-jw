import { useRef, useState } from 'react'
import { FileUp, Library, Share2 } from 'lucide-react'
import { JWPUB_SECTIONS, type JwpubSectionId } from '../lib/jwpub'

const MAX_MB = 40

export function PdfJwpubView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [section, setSection] = useState<JwpubSectionId>('manuali')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')

  function onPick(next: File | null) {
    setError('')
    setMessage('')
    setPreview('')
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

  async function runConvert(share: boolean) {
    if (!file) {
      setError('Carica prima un PDF.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    setProgress('Leggo il PDF…')
    try {
      const { convertPdfToJwpub } = await import('../lib/pdfToJwpub')
      const result = await convertPdfToJwpub({
        file,
        fileName: file.name,
        title: title.trim() || undefined,
        section,
        share,
      })
      const sample = result.extract.fullText.slice(0, 400)
      setPreview(sample + (result.extract.fullText.length > 400 ? '…' : ''))
      setProgress('')
          setMessage(
        [
          `Creato ${result.fileName}: ${result.pageCount} pagine → ${result.documentCount} documenti.`,
          result.shared
            ? 'Foglio di condivisione aperto: scegli JW Library se compare nell’elenco.'
            : 'File scaricato. Aprilo con JW Library (Condividi → JW Library, oppure Apri con).',
          'In JW Library: Pubblicazioni → Per tipo → Manuali / linee guida, poi Preferiti se vuoi.',
        ].join(' '),
      )
    } catch (e) {
      setProgress('')
      setError(e instanceof Error ? e.message : 'Conversione non riuscita')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <p className="section-kicker">Documenti</p>
        <h2>PDF → JW Library</h2>
        <p className="lede">
          Carica un PDF con testo selezionabile, convertilo in pubblicazione <strong>.jwpub</strong> e
          aprilo in JW Library (Preferiti / sezione scelta).
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
              : `Massimo ${MAX_MB} MB · testo estraibile (non solo immagini)`}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="grid-2" style={{ marginTop: '1rem' }}>
          <div className="field">
            <label htmlFor="pdf-title">Titolo in JW Library</label>
            <input
              id="pdf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titolo della pubblicazione"
              disabled={!file || busy}
            />
          </div>
          <div className="field">
            <label htmlFor="pdf-section">Dove la trovi in JW Library</label>
            <select
              id="pdf-section"
              value={section}
              onChange={(e) => setSection(e.target.value as JwpubSectionId)}
              disabled={busy}
            >
              {JWPUB_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Le pubblicazioni personali si installano come Manuali. Cercale in Pubblicazioni → Per
              tipo → Manuali / linee guida.
            </p>
          </div>
        </div>

        <div className="row" style={{ marginTop: '0.85rem' }}>
          <button
            className="btn accent"
            type="button"
            disabled={!file || busy}
            onClick={() => void runConvert(false)}
          >
            <Library size={16} />
            {busy ? 'Converto…' : 'Crea .jwpub e scarica'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={!file || busy}
            onClick={() => void runConvert(true)}
          >
            <Share2 size={16} />
            Converti e apri / condividi
          </button>
        </div>

        {progress && <p className="muted">{progress}</p>}
        {error && <p className="error-text">{error}</p>}
        {message && <p className="muted">{message}</p>}
      </section>

      {preview && (
        <section className="panel">
          <p className="section-kicker">Anteprima testo</p>
          <h2>Estratto dal PDF</h2>
          <p className="lede">Controllo rapido che il testo sia stato letto correttamente.</p>
          <pre className="pdf-preview">{preview}</pre>
        </section>
      )}

      <section className="panel">
        <p className="section-kicker">Come usarlo</p>
        <h2>Dopo la conversione</h2>
        <ol className="howto">
          <li>Scarica (o condividi) il file <code>.jwpub</code>.</li>
          <li>Aprilo con <strong>JW Library</strong> (su iPad/iPhone: Condividi → JW Library).</li>
          <li>
            Vai in Pubblicazioni → Per tipo → <strong>Manuali / linee guida</strong>.
          </li>
          <li>Apri la pubblicazione e, se vuoi, aggiungila ai Preferiti.</li>
        </ol>
        <p className="footnote">
          Funziona con PDF che contengono testo. Se il PDF è una scansione solo immagine, prima
          applica OCR. Il file è una pubblicazione personale (tipo Manuale): non sostituisce i
          contenuti di jw.org. Su alcune versioni recenti di JW Library l’import di file non firmati
          può essere bloccato; in quel caso aggiorna l’app o riprova dopo aver eliminato un eventuale
          tentativo fallito.
        </p>
      </section>
    </div>
  )
}
