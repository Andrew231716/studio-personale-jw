export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed')
    return
  }
  try {
    const upstream = await fetch('https://b.jw-cdn.org/tokens/jworg.jwt')
    const text = await upstream.text()
    res.setHeader('Cache-Control', 'public, max-age=1800')
    res.status(upstream.status).setHeader('Content-Type', 'text/plain').send(text)
  } catch (error) {
    res.status(502).send(String(error))
  }
}
