export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const parts = [].concat(req.query.path || [])
    const path = parts.join('/')
    const query = new URL(req.url, 'http://localhost').search
    const url = `https://b.jw-cdn.org/apis/search/${path}${query}`
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
