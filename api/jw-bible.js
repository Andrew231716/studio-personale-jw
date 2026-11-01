/** Proxy capitolo Bibbia da wol.jw.org (TNM). */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const language = String(req.query.language || 'I')
    const book = Number(req.query.book || 0)
    const chapter = Number(req.query.chapter || 0)
    const verse = Number(req.query.verse || 0)
    if (!book || !chapter) {
      res.status(400).json({ error: 'Parametri book e chapter richiesti' })
      return
    }
    const locale = language === 'E' ? { r: 'r1', lp: 'lp-e' } : { r: 'r6', lp: 'lp-i' }
    const url = `https://wol.jw.org/wol/b/${locale.r}/${locale.lp}/nwtsty/${book}/${chapter}`
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'JW-Studio/1.0',
      },
    })
    const text = await upstream.text()
    res
      .status(upstream.status)
      .setHeader('Content-Type', 'application/json')
      .setHeader('Cache-Control', 'public, max-age=86400')
      .send(text)
    // verse is optional; client extracts it. Keep for logging-friendly signature.
    void verse
  } catch (error) {
    res.status(502).json({ error: String(error) })
  }
}
