export interface JwRefs {
  docid?: string
  lank?: string
  bible?: string
  wtlocale?: string
  par?: string
  pub?: string
}

/** True se è un identificatore media (video/audio) usabile da JW Library. */
export function isMediaLank(lank?: string | null): boolean {
  if (!lank) return false
  if (/^pa-/i.test(lank)) return false
  if (/_(VIDEO|AUDIO)\b/i.test(lank)) return true
  if (/^media-/i.test(lank)) return true
  return false
}

/**
 * Simbolo pubblicazione da lank tipo «pub-rff» / «pub-ia».
 * Non vale per i media «pub-…_VIDEO».
 */
export function publicationSymbol(lankOrPub?: string | null): string | undefined {
  if (!lankOrPub) return undefined
  const raw = lankOrPub.trim()
  if (/_(VIDEO|AUDIO)\b/i.test(raw)) return undefined
  if (/^pa-/i.test(raw)) return undefined
  const fromPubPrefix = raw.match(/^pub-([A-Za-z0-9-]+)$/i)
  if (fromPubPrefix) return fromPubPrefix[1]
  // già un simbolo (rff, nwtsty, ia, …) senza prefisso
  if (/^[A-Za-z][A-Za-z0-9-]{0,24}$/.test(raw) && !/^https?:/i.test(raw)) {
    return raw
  }
  return undefined
}

/** Estrae docid / lank / bible / pub da URL jw.org, wol o finder. */
export function extractJwRefs(url?: string | null): JwRefs {
  if (!url) return {}
  try {
    const parsed = new URL(url, 'https://www.jw.org')
    const params = parsed.searchParams
    const fromQuery: JwRefs = {
      docid: params.get('docid') || undefined,
      lank: params.get('lank') || params.get('item') || undefined,
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
      const m = url.match(/[?&](?:lank|item)=([^&]+)/i)
      if (m) fromQuery.lank = decodeURIComponent(m[1])
    }
    if (!fromQuery.pub) {
      const m = url.match(/[?&]pub=([^&]+)/i)
      if (m) fromQuery.pub = decodeURIComponent(m[1])
    }
    if (!fromQuery.bible) {
      const m = url.match(/[?&]bible=([^&]+)/i)
      if (m) fromQuery.bible = decodeURIComponent(m[1])
    }

    // lank di ricerca pa-<docid> → docid
    if (fromQuery.lank && !isMediaLank(fromQuery.lank)) {
      const nested = fromQuery.lank.match(/^pa-(\d{6,})$/i)
      if (nested && !fromQuery.docid) fromQuery.docid = nested[1]
      // pub-rff → pubblicazione, non media
      const pubSym = publicationSymbol(fromQuery.lank)
      if (pubSym && !fromQuery.pub) fromQuery.pub = pubSym
      if (!isMediaLank(fromQuery.lank)) delete fromQuery.lank
    }

    // docid non numerico (es. video passato come docid=pub-…_VIDEO) → lank
    if (fromQuery.docid && !/^\d+$/.test(fromQuery.docid)) {
      if (isMediaLank(fromQuery.docid) && !fromQuery.lank) {
        fromQuery.lank = fromQuery.docid
      } else {
        const pubSym = publicationSymbol(fromQuery.docid)
        if (pubSym && !fromQuery.pub) fromQuery.pub = pubSym
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
      if (key === 'lank') {
        if (isMediaLank(value)) {
          out.lank = value
          continue
        }
        const nested = value.match(/^pa-(\d{6,})$/i)
        if (nested && !out.docid) out.docid = nested[1]
        const pubSym = publicationSymbol(value)
        if (pubSym && !out.pub) out.pub = pubSym
        continue
      }
      out[key] = value
    }
  }
  return out
}

/**
 * Deep link custom scheme.
 * JW Library gestisce bene bible=, docid=, pub= e lank media.
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

  // Video/audio: il lank specifico ha priorità sul docid contenitore
  if (refs.lank && isMediaLank(refs.lank)) {
    params.set('lank', refs.lank)
    return `jwlibrary:///finder?${params.toString()}`
  }

  if (refs.docid && /^\d+$/.test(refs.docid)) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
    return `jwlibrary:///finder?${params.toString()}`
  }

  if (refs.pub) {
    params.set('pub', refs.pub)
    return `jwlibrary:///finder?${params.toString()}`
  }

  return null
}

/**
 * Link ufficiale di condivisione JW Library (App Link / Universal Link).
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
    params.set('pub', refs.pub || 'nwtsty')
  } else if (refs.lank && isMediaLank(refs.lank)) {
    params.set('lank', refs.lank)
  } else if (refs.docid && /^\d+$/.test(refs.docid)) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
  } else if (refs.pub) {
    params.set('pub', refs.pub)
  } else {
    return null
  }

  return `https://www.jw.org/finder?${params.toString()}`
}

/** Link web jw.org/open comodo quando abbiamo solo i riferimenti. */
export function buildJwOrgOpenLink(refs: JwRefs, language = 'I'): string | null {
  const wtlocale = refs.wtlocale || language
  const params = new URLSearchParams()
  params.set('prefer', 'lang')
  params.set('wtlocale', wtlocale)

  if (refs.bible) {
    params.set('bible', refs.bible)
    params.set('pub', refs.pub || 'nwtsty')
    return `https://www.jw.org/open?${params.toString()}`
  }
  if (refs.docid && /^\d+$/.test(refs.docid)) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
    return `https://www.jw.org/open?${params.toString()}`
  }
  if (refs.lank && isMediaLank(refs.lank)) {
    params.set('item', refs.lank)
    // alcuni video usano anche un docid contenitore; non obbligatorio
    return `https://www.jw.org/open?${params.toString()}`
  }
  if (refs.pub) {
    params.set('pub', refs.pub)
    return `https://www.jw.org/open?${params.toString()}`
  }
  return null
}

export function resolveOpenLinks(input: {
  url?: string
  wolUrl?: string
  lank?: string
  docid?: string
  bible?: string
  pub?: string
  language?: string
}): {
  webUrl: string | null
  /** Link HTTPS che apre il contenuto in JW Library quando possibile */
  libraryShareLink: string | null
  /** Schema jwlibrary:// (docid/bible/pub/lank) */
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
      bible: input.bible,
      pub: input.pub || publicationSymbol(input.lank),
      wtlocale: language,
    },
  )

  const libraryDeepLink = buildJwLibraryDeepLink(refs, language)
  const libraryShareLink = buildJwLibraryShareLink(refs, language)
  const openLink = buildJwOrgOpenLink(refs, language)

  // Preferisci sempre il link di condivisione HTTPS: è quello che JW Library
  // genera con “Condividi” e porta al documento/video giusto.
  const libraryOpenUrl = libraryShareLink || libraryDeepLink

  // Per il web: preferisci URL jw.org (non solo WOL), oppure open link ricostruito
  const rawWeb = input.url || input.wolUrl || null
  const preferOpen =
    openLink &&
    (!rawWeb ||
      /wol\.jw\.org/i.test(rawWeb) ||
      (!extractJwRefs(rawWeb).docid &&
        !extractJwRefs(rawWeb).bible &&
        !extractJwRefs(rawWeb).lank &&
        !extractJwRefs(rawWeb).pub))
  const webUrl = preferOpen ? openLink : rawWeb || openLink || libraryShareLink

  return {
    webUrl,
    libraryDeepLink,
    libraryShareLink,
    libraryOpenUrl,
    canOpenLibrary: Boolean(libraryOpenUrl),
  }
}
