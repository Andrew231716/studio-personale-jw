/**
 * Risolve un link jw.org (finder/open/docid/URL articolo) nel titolo reale.
 * Serve perché /finder?docid=… non ha uno slug leggibile lato client (CORS).
 */
function pickMeta(html, names) {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`,
      'i',
    )
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      'i',
    )
    const m = html.match(re) || html.match(re2)
    if (m?.[1]) return decodeHtml(m[1].trim())
  }
  return ''
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(html) {
  const og = pickMeta(html, ['og:title', 'twitter:title'])
  if (og) return og.replace(/\s*[|·].*$/, '').trim() || og
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (m?.[1]) {
    return decodeHtml(m[1])
      .replace(/\s*[|·].*$/, '')
      .replace(/\s*[-–—]\s*JW\.ORG.*$/i, '')
      .trim()
  }
  return ''
}

function extractDescription(html) {
  return pickMeta(html, ['og:description', 'description', 'twitter:description']).slice(0, 500)
}

function extractCanonical(html, fallback) {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) ||
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
  if (m?.[1]) {
    try {
      return new URL(m[1], 'https://www.jw.org').href
    } catch {
      return fallback
    }
  }
  return fallback
}

function extractDocid(html, url) {
  const fromUrl = String(url).match(/[?&]docid=(\d{6,})/i)
  if (fromUrl) return fromUrl[1]
  const fromHtml = html.match(/docid[=/](\d{6,})/i)
  return fromHtml?.[1] || undefined
}

function buildStartUrl(query) {
  const language = String(query.language || 'I')
  const raw = String(query.url || query.q || '').trim()
  const docid = String(query.docid || '').trim()
  if (docid && /^\d{6,}$/.test(docid)) {
    return `https://www.jw.org/finder?wtlocale=${encodeURIComponent(language)}&docid=${encodeURIComponent(docid)}&srcid=share`
  }
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (/jw\.org/i.test(raw)) return `https://${raw.replace(/^\/+/, '')}`
  if (/^\d{6,}$/.test(raw)) {
    return `https://www.jw.org/finder?wtlocale=${encodeURIComponent(language)}&docid=${encodeURIComponent(raw)}&srcid=share`
  }
  return ''
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const query = req.query || {}
    const start = buildStartUrl(query)
    if (!start) {
      res.status(400).json({ error: 'Missing url or docid' })
      return
    }

    const upstream = await fetch(start, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'JW-Studio/1.0',
        'Accept-Language': 'it,en;q=0.8',
      },
    })
    if (!upstream.ok) {
      res.status(502).json({
        error: `Impossibile aprire il link jw.org (${upstream.status})`,
        url: start,
      })
      return
    }

    const finalUrl = upstream.url || start
    const html = await upstream.text()
    const title = extractTitle(html)
    const snippet = extractDescription(html)
    const canonicalUrl = extractCanonical(html, finalUrl)
    const docid = extractDocid(html, `${start} ${finalUrl} ${canonicalUrl}`)

    if (!title) {
      res.status(404).json({
        error: 'Titolo non trovato per questo link jw.org',
        url: canonicalUrl,
        docid,
      })
      return
    }

    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.status(200).json({
      title,
      snippet,
      url: canonicalUrl,
      finalUrl,
      docid,
      kind: /\/video|lank=|_(VIDEO|AUDIO)\b/i.test(`${canonicalUrl} ${start}`)
        ? 'video'
        : 'article',
    })
  } catch (error) {
    res.status(502).json({ error: String(error) })
  }
}
