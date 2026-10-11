import { ExternalLink, Smartphone } from 'lucide-react'
import { resolveOpenLinks } from '../lib/jwLibrary'

interface Props {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  language?: string
  compact?: boolean
}

/**
 * Apri in JW Library usa il link ufficiale finder?srcid=jwlshare
 * (come “Condividi” nell’app). Su telefono/tablet apre il contenuto
 * specifico; lo schema jwlibrary:// da solo spesso lascia sulla home.
 */
export function JwOpenButtons({
  url,
  wolUrl,
  lank,
  docid,
  language = 'I',
  compact = false,
}: Props) {
  const links = resolveOpenLinks({ url, wolUrl, lank, docid, language })
  if (!links.webUrl && !links.canOpenLibrary) return null

  return (
    <div className="row">
      {links.webUrl && (
        <a
          className={compact ? 'chip' : 'btn secondary'}
          href={links.webUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="row" style={{ gap: 6 }}>
            <ExternalLink size={14} />
            {compact ? 'jw.org' : 'Apri su jw.org'}
          </span>
        </a>
      )}

      {links.libraryOpenUrl && (
        <a
          className={compact ? 'chip' : 'btn accent'}
          href={links.libraryOpenUrl}
          target="_blank"
          rel="noreferrer"
          title="Apre il contenuto in JW Library (come il pulsante Condividi dell’app)"
        >
          <span className="row" style={{ gap: 6 }}>
            <Smartphone size={14} />
            {compact ? 'JW Library' : 'Apri in JW Library'}
          </span>
        </a>
      )}
    </div>
  )
}
