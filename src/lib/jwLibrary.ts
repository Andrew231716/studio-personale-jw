export interface JwRefs {
  docid?: string
  lank?: string
  bible?: string
  wtlocale?: string
  par?: string
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
    }

    // Pattern path: /open?docid=... already covered by query
    // Some wol URLs embed docid in path segments
    if (!fromQuery.docid) {
      const m = url.match(/docid[=/](\d{6,})/i)
      if (m) fromQuery.docid = m[1]
    }
    if (!fromQuery.lank) {
      const m = url.match(/lank[=/]([A-Za-z0-9._-]+)/i)
      if (m) fromQuery.lank = decodeURIComponent(m[1])
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
    for (const [key, value] of Object.entries(part) as Array<[keyof JwRefs, string | undefined]>) {
      if (value) out[key] = value
    }
  }
  return out
}

/** Deep link nativo dell’app JW Library. */
export function buildJwLibraryDeepLink(
  refs: JwRefs,
  language = 'I',
): string | null {
  const wtlocale = refs.wtlocale || language
  const params = new URLSearchParams()
  params.set('wtlocale', wtlocale)

  if (refs.bible) {
    params.set('bible', refs.bible)
  } else if (refs.lank) {
    params.set('lank', refs.lank)
  } else if (refs.docid) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
  } else {
    return null
  }

  return `jwlibrary:///finder?${params.toString()}`
}

/** Link web di condivisione che su mobile/desktop tenta di aprire JW Library. */
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
  } else if (refs.lank) {
    params.set('lank', refs.lank)
  } else if (refs.docid) {
    params.set('docid', refs.docid)
    if (refs.par) params.set('par', refs.par)
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
  libraryDeepLink: string | null
  libraryShareLink: string | null
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

  return {
    webUrl: input.url || libraryShareLink || input.wolUrl || null,
    libraryDeepLink,
    libraryShareLink,
    canOpenLibrary: Boolean(libraryDeepLink || libraryShareLink),
  }
}
