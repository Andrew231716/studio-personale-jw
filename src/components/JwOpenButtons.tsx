import { BookOpen, ExternalLink, Smartphone } from 'lucide-react'
import { resolveOpenLinks } from '../lib/jwLibrary'

interface Props {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  bible?: string
  pub?: string
  language?: string
  compact?: boolean
  /** Etichetta della scrittura / titolo mostrato come link principale */
  webLabel?: string
  libraryLabel?: string
}

/**
 * Link jw.org + JW Library affiancati.
 * Per le scritture: nome del versetto + pillola blu «JW Library» accanto.
 */
export function JwOpenButtons({
  url,
  wolUrl,
  lank,
  docid,
  bible,
  pub,
  language = 'I',
  compact = false,
  webLabel,
  libraryLabel,
}: Props) {
  const links = resolveOpenLinks({
    url,
    wolUrl,
    lank,
    docid,
    bible,
    pub,
    language,
  })

  const webUrl = links.webUrl
  const libraryOpenUrl = links.libraryOpenUrl || webUrl
  if (!webUrl && !libraryOpenUrl) return null

  const isBible = Boolean(bible || (url && /[?&]bible=/i.test(url)))
  const label =
    webLabel ||
    (isBible ? (compact ? 'Bibbia' : 'Apri versetto') : compact ? 'jw.org' : 'Apri su jw.org')

  // Scritture: etichetta + JW Library colorato accanto
  if (isBible || webLabel) {
    return (
      <span className="jw-ref">
        {webUrl && (
          <a className="jw-ref-text" href={webUrl} target="_blank" rel="noreferrer">
            {isBible && <BookOpen size={13} aria-hidden />}
            {label}
          </a>
        )}
        {libraryOpenUrl && (
          <a
            className="jw-ref-library"
            href={libraryOpenUrl}
            target="_blank"
            rel="noreferrer"
            title="Apri in JW Library"
          >
            <Smartphone size={12} aria-hidden />
            {libraryLabel || 'JW Library'}
          </a>
        )}
      </span>
    )
  }

  return (
    <div className="jw-open-buttons">
      {webUrl && (
        <a className="jw-btn-web" href={webUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={13} aria-hidden />
          {compact ? 'jw.org' : 'Apri su jw.org'}
        </a>
      )}
      {libraryOpenUrl && (
        <a
          className="jw-btn-library"
          href={libraryOpenUrl}
          target="_blank"
          rel="noreferrer"
          title="Apri in JW Library"
        >
          <Smartphone size={13} aria-hidden />
          {libraryLabel || 'JW Library'}
        </a>
      )}
    </div>
  )
}
