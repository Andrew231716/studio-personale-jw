export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const language = String(req.query.language || 'I')
    const category = String(req.query.category || 'LatestVideos')
    const url = `https://b.jw-cdn.org/apis/mediator/v1/categories/${encodeURIComponent(language)}/${encodeURIComponent(category)}?clientType=www`
    const upstream = await fetch(url)
    const text = await upstream.text()
    res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text)
  } catch (error) {
    res.status(502).json({ error: String(error) })
  }
}
