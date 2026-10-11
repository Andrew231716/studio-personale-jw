export interface JwRefs {
  docid?: string
  lank?: string
  bible?: string
  wtlocale?: string
  par?: string
  pub?: string
}

/** True se sembra un identificatore media usabile da JW Library / finder. */
export function isMediaLank(lank?: string | null): boolean {
  if (!lank) return false
  // I risultati di ricerca usano lank tipo "pa-1200003543" — NON sono media lank
  if (/^pa-/i.test(lank)) return false
  return /^(pub-|media-)/i.test(lank) || /_(VIDEO|AUDIO)\b/i.test(lank)
}

/** Estrae docid / lank / bible da URL jw.org, wol o finder. */
export function extractJwRefs(url?: string | null): JwRefs {
  if (!url) return {}
  try {
    const parsed = new URL(url, 'https://www.jw.org')
    const params = parsed.searchParams
    const fromQuery: JwRefs = {
      docid: params.get('docid') || undefined,
      lank: params.get('lank') || undefined,
      bible: params.get('bible') || undefined,
      wtlocale: params.get('wtlocale') || undefined,
      par: params.get('par') || undefined,
      pub: params.get('pub') || undefined,
    }

    if (!fromQuery.docid) {
      const m = url.match(/docid[=/](\d{6,})/i)
      if (m) fromQuery.docid = m[1]
    }
    if (!fromQuery.lank) {
      const m = url.match(/[?&]lank=([^&]+)/i)
      if (m) fromQuery.lank = decodeURIComponent(m[1])
    }

    // Ignora lank di ricerca (pa-...)
    if (fromQuery.lank && !isMediaLank(fromQuery.lank)) {
      // A volte docid è dentro il lank pa-<docid>
      const nested = fromQuery.lank.match(/^pa-(\d{6,})$/i)
      if (nested && !fromQuery.docid) fromQuery.docid = nested[1]
      delete fromQuery.lank
    }

    // docid non numerico (es. video passato come docid=pub-...) → trattalo come lank
    if (fromQuery.docid && !/^\d+$/.test(fromQuery.docid)) {
      if (isMediaLank(fromQuery.docid) && !fromQuery.lank) {
        fromQuery.lank = fromQuery.docid
      }
      delete fromQuery.docid
    }

    return fromQuery
  } catch {
    return {}
  }
}

export function mergeRefs(...parts: Array<JwRefs | undefined>): JwRefs {
  const out: JwRefs = {}
  for (const part of parts) {
    if (!part) continue
    for (const [key, value] of Object.entries(part) as Array<
      [keyof JwRefs, string | undefined]
    >) {
      if (!value) continue
      if (key === 'lank' && !isMediaLank(value)) {
        const nested = value.match(/^pa-(\d{6,})$/i)
        if (nested && !out.docid) out.docid = nested[1]
        continue
      }
      out[key] = value
    }
  }
  return out
}

/**
 * Deep link custom scheme.
 * JW Library gestisce in modo affidabile soprattutto bible= e docid=.
 * Per i video preferiamo il link HTTPS jwlshare (Universal / App Link).
 */
export function buildJwLibraryDeepLink(
  refs: JwRefs,
  language = 'I',
): string | null {
  const wtlocale = refs.wtlocale || language
  const params = new URLSearchParams()
  params.set('wtlocale', wtlocale)

  if (refs.bible) {
    params.set('bible', refs.bible)
    if (refs.pub) params.set('pub', refs.pub)
    return `jwlibrary:///finder?${params.toString()}`
  }

  if (refs.docid && /^\d+$/.test(refs.docid)) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
    return `jwlibrary:///finder?${params.toString()}`
  }

  // Fallback media: alcuni client accettano lank anche nello schema custom
  if (refs.lank && isMediaLank(refs.lank)) {
    params.set('lank', refs.lank)
    return `jwlibrary:///finder?${params.toString()}`
  }

  return null
}

/**
 * Link ufficiale di condivisione JW Library.
 * Su dispositivi con l’app installata apre il contenuto specifico
 * (non solo la home), tramite App Link / Universal Link.
 */
export function buildJwLibraryShareLink(
  refs: JwRefs,
  language = 'I',
): string | null {
  const wtlocale = refs.wtlocale || language
  const params = new URLSearchParams()
  params.set('srcid', 'jwlshare')
  params.set('wtlocale', wtlocale)
  params.set('prefer', 'lang')

  if (refs.bible) {
    params.set('bible', refs.bible)
    if (refs.pub) params.set('pub', refs.pub)
  } else if (refs.docid && /^\d+$/.test(refs.docid)) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
  } else if (refs.lank && isMediaLank(refs.lank)) {
    params.set('lank', refs.lank)
  } else {
    return null
  }

  return `https://www.jw.org/finder?${params.toString()}`
}

export function resolveOpenLinks(input: {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  language?: string
}): {
  webUrl: string | null
  /** Link HTTPS che apre il contenuto in JW Library quando possibile */
  libraryShareLink: string | null
  /** Schema jwlibrary:// (docid/bible) */
  libraryDeepLink: string | null
  /** URL consigliato per il pulsante “Apri in JW Library” */
  libraryOpenUrl: string | null
  canOpenLibrary: boolean
} {
  const language = input.language || 'I'
  const refs = mergeRefs(
    extractJwRefs(input.url),
    extractJwRefs(input.wolUrl),
    {
      lank: input.lank,
      docid: input.docid,
      wtlocale: language,
    },
  )

  const libraryDeepLink = buildJwLibraryDeepLink(refs, language)
  const libraryShareLink = buildJwLibraryShareLink(refs, language)

  // Preferisci sempre il link di condivisione HTTPS: è quello che JW Library
  // genera con “Condividi” e porta al documento/video giusto.
  const libraryOpenUrl = libraryShareLink || libraryDeepLink

  return {
    webUrl: input.url || libraryShareLink || input.wolUrl || null,
    libraryDeepLink,
    libraryShareLink,
    libraryOpenUrl,
    canOpenLibrary: Boolean(libraryOpenUrl),
  }
}
