import { BookOpen, ExternalLink, Smartphone } from 'lucide-react'
import { resolveOpenLinks } from '../lib/jwLibrary'

interface Props {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  language?: string
  compact?: boolean
}

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

      {links.libraryDeepLink && (
        <a className={compact ? 'chip' : 'btn accent'} href={links.libraryDeepLink}>
          <span className="row" style={{ gap: 6 }}>
            <Smartphone size={14} />
            {compact ? 'JW Library' : 'Apri in JW Library'}
          </span>
        </a>
      )}

      {!links.libraryDeepLink && links.libraryShareLink && (
        <a
          className={compact ? 'chip' : 'btn accent'}
          href={links.libraryShareLink}
          target="_blank"
          rel="noreferrer"
        >
          <span className="row" style={{ gap: 6 }}>
            <Smartphone size={14} />
            {compact ? 'JW Library' : 'Apri in JW Library'}
          </span>
        </a>
      )}

      {links.libraryDeepLink && links.libraryShareLink && !compact && (
        <a
          className="btn secondary"
          href={links.libraryShareLink}
          target="_blank"
          rel="noreferrer"
          title="Link di condivisione compatibile con JW Library"
        >
          <span className="row" style={{ gap: 6 }}>
            <BookOpen size={14} /> Link JW Library
          </span>
        </a>
      )}
    </div>
  )
}
