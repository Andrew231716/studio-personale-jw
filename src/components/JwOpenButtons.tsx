import { BookOpen, ExternalLink, Smartphone } from 'lucide-react'
import { resolveOpenLinks } from '../lib/jwLibrary'

interface Props {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  /** Codice bible= (versetti / libri TNM) */
  bible?: string
  /** Simbolo pubblicazione (es. rff, ia, nwtsty) */
  pub?: string
  language?: string
  compact?: boolean
  /** Etichetta alternativa per il link web (es. «Versetto») */
  webLabel?: string
  libraryLabel?: string
}

/**
 * Due azioni ovunque: sito jw.org + JW Library (link ufficiale jwlshare).
 * Funziona per articoli (docid), versetti (bible), video (lank) e pubblicazioni (pub).
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
  const libraryOpenUrl = links.libraryOpenUrl
  if (!webUrl && !libraryOpenUrl) return null

  const isBible = Boolean(bible || (url && /[?&]bible=/i.test(url)))

  return (
    <div className="row jw-open-buttons" style={{ flexWrap: 'wrap', gap: 6 }}>
      {webUrl && (
        <a
          className={compact ? 'chip' : 'btn secondary'}
          href={webUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className="row" style={{ gap: 6 }}>
            {isBible ? <BookOpen size={14} /> : <ExternalLink size={14} />}
            {webLabel ||
              (compact
                ? isBible
                  ? 'Bibbia'
                  : 'jw.org'
                : isBible
                  ? 'Apri versetto'
                  : 'Apri su jw.org')}
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
            {libraryLabel || (compact ? 'JW Library' : 'Apri in JW Library')}
          </span>
        </a>
      )}

      {/* Se per qualche motivo manca il link Library ma abbiamo il web, riproponi web come fallback etichettato */}
      {!libraryOpenUrl && webUrl && (
        <a
          className={compact ? 'chip' : 'btn accent'}
          href={webUrl}
          target="_blank"
          rel="noreferrer"
          title="Apri e, se possibile, continua in JW Library dal sito"
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
