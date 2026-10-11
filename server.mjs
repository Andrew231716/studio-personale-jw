import express from 'express'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = join(__dirname, 'dist')
const app = express()
const port = Number(process.env.PORT || 4173)

app.get('/api/jw-token', async (_req, res) => {
  try {
    const r = await fetch('https://b.jw-cdn.org/tokens/jworg.jwt')
    res.status(r.status).type('text/plain').send(await r.text())
  } catch (e) {
    res.status(502).send(String(e))
  }
})

app.use('/api/jw-search', async (req, res) => {
  try {
    const suffix = req.originalUrl.replace('/api/jw-search', '')
    const url = `https://b.jw-cdn.org/apis/search${suffix}`
    const upstream = await fetch(url, {
      headers: {
        Authorization: req.header('authorization') || '',
        Accept: 'application/json',
      },
    })
    const text = await upstream.text()
    res.status(upstream.status).type('application/json').send(text)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

app.use('/api/jw-media', async (req, res) => {
  try {
    const suffix = req.originalUrl.replace('/api/jw-media', '')
    const url = `https://b.jw-cdn.org/apis/mediator/v1${suffix}`
    const upstream = await fetch(url)
    const text = await upstream.text()
    res.status(upstream.status).type('application/json').send(text)
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
})

app.post('/api/ai/', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const upstream = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    })
    const text = await upstream.text()
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'text/plain').send(text)
  } catch (e) {
    res.status(502).send(String(e))
  }
})

if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => {
    res.type('html').send(readFileSync(join(dist, 'index.html'), 'utf8'))
  })
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Studio Personale JW su http://localhost:${port}`)
})
