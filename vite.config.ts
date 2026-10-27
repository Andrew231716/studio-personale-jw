import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

function localApiPlugin(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://localhost')
          if (url.pathname === '/api/jw-token') {
            const upstream = await fetch('https://b.jw-cdn.org/tokens/jworg.jwt')
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'text/plain')
            res.end(text)
            return
          }
          if (url.pathname === '/api/jw-search') {
            const language = url.searchParams.get('language') || 'I'
            const filter = url.searchParams.get('filter') || 'all'
            const q = url.searchParams.get('q') || ''
            const target = `https://b.jw-cdn.org/apis/search/results/${language}/${filter}/?q=${encodeURIComponent(q)}`
            const upstream = await fetch(target, {
              headers: {
                Authorization: String(req.headers.authorization || ''),
                Accept: 'application/json',
              },
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
            return
          }
          if (url.pathname === '/api/jw-media') {
            const language = url.searchParams.get('language') || 'I'
            const lank = (url.searchParams.get('lank') || '').trim()
            const category = url.searchParams.get('category') || 'LatestVideos'
            const target = lank
              ? `https://b.jw-cdn.org/apis/mediator/v1/media-items/${language}/${encodeURIComponent(lank)}?clientType=www`
              : `https://b.jw-cdn.org/apis/mediator/v1/categories/${language}/${category}?clientType=www`
            const upstream = await fetch(target)
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
            return
          }
          if (url.pathname === '/api/ai' && req.method === 'POST') {
            const body = await readBody(req)
            const upstream = await fetch('https://text.pollinations.ai/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/plain')
            res.end(text)
            return
          }
          if (url.pathname === '/api/sync') {
            // In dev, inoltra all’handler Vercel-like via import dinamico non disponibile:
            // rispondi con istruzione chiara se mancano env.
            res.statusCode = 501
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error:
                  'In locale /api/sync richiede `vercel dev` oppure le variabili SUPABASE_URL e SUPABASE_SERVICE_ROLE.',
              }),
            )
            return
          }
        } catch (error) {
          res.statusCode = 502
          res.end(String(error))
          return
        }
        next()
      })
    },
  }
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    host: true,
    port: 5173,
  },
})
