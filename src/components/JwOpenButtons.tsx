import { BookOpen, ExternalLink, Smartphone } from 'lucide-react'
import { bibleOpenUrl } from '../lib/bibleRefs'
import { resolveOpenLinks } from '../lib/jwLibrary'

interface Props {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  /** Codice bible= (versetti / libri TNM) */
  bible?: string
  language?: string
  compact?: boolean
  /** Etichetta alternativa per il link web (es. «Versetto») */
  webLabel?: string
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
  bible,
  language = 'I',
  compact = false,
  webLabel,
}: Props) {
  const bibleUrl = bible ? bibleOpenUrl(bible, language) : undefined
  const links = resolveOpenLinks({
    url: url || bibleUrl,
    wolUrl,
    lank,
    docid,
    language,
  })
  // Se abbiamo solo il codice bible, forza i link di apertura Bibbia
  const webUrl = links.webUrl || bibleUrl || null
  const libraryOpenUrl =
    links.libraryOpenUrl ||
    (bible ? bibleOpenUrl(bible, language) : null)
  if (!webUrl && !libraryOpenUrl) return null

  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
      {webUrl && (
        <a
          className={compact ? 'chip' : 'btn secondary'}
          href={webUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="row" style={{ gap: 6 }}>
            {bible ? <BookOpen size={14} /> : <ExternalLink size={14} />}
            {webLabel || (compact ? (bible ? 'Bibbia' : 'jw.org') : bible ? 'Apri versetto' : 'Apri su jw.org')}
          </span>
        </a>
      )}

      {libraryOpenUrl && (
        <a
          className={compact ? 'chip' : 'btn accent'}
          href={libraryOpenUrl}
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
