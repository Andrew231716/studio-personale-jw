export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const language = String(req.query.language || 'I')
    const filter = String(req.query.filter || 'all')
    const q = String(req.query.q || '').trim()
    if (!q) {
      res.status(400).json({ error: 'Missing q' })
      return
    }
    const url = `https://b.jw-cdn.org/apis/search/results/${encodeURIComponent(language)}/${encodeURIComponent(filter)}/?q=${encodeURIComponent(q)}`
    const upstream = await fetch(url, {
      headers: {
        Authorization: req.headers.authorization || '',
        Accept: 'application/json',
      },
    })
    const text = await upstream.text()
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (error) {
    res.status(502).json({ error: String(error) })
  }
}
