export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed')
    return
  }
  try {
    const upstream = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    })
    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'text/plain'
    res.status(upstream.status).setHeader('Content-Type', contentType).send(text)
  } catch (error) {
    res.status(502).send(String(error))
  }
}
