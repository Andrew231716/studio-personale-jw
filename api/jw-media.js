export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const language = String(req.query.language || 'I')
    const lank = String(req.query.lank || '').trim()
    const category = String(req.query.category || 'LatestVideos')
    const detailed = String(req.query.detailed || '1') !== '0'
    const url = lank
      ? `https://b.jw-cdn.org/apis/mediator/v1/media-items/${encodeURIComponent(language)}/${encodeURIComponent(lank)}?clientType=www`
      : `https://b.jw-cdn.org/apis/mediator/v1/categories/${encodeURIComponent(language)}/${encodeURIComponent(category)}?clientType=www${detailed ? '&detailed=1' : ''}`
    const upstream = await fetch(url)
    const text = await upstream.text()
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (error) {
    res.status(502).json({ error: String(error) })
  }
}
