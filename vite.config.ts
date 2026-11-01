import react from '@vitejs/plugin-react'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vite'

function swManifestPlugin(): Plugin {
  return {
    name: 'sw-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => `/${f.replace(/^\/+/, '')}`)
      const list = [
        '/',
        '/index.html',
        '/favicon.svg',
        '/logo.svg',
        '/icon-192.png',
        '/apple-touch-icon.png',
        '/manifest.webmanifest',
        '/sw.js',
        '/fonts/manrope-latin.woff2',
        '/fonts/fraunces-latin.woff2',
        ...assets,
      ]
      this.emitFile({
        type: 'asset',
        fileName: 'sw-manifest.json',
        source: JSON.stringify(Array.from(new Set(list))),
      })
    },
  }
}

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
          if (url.pathname === '/api/jw-bible') {
            const language = url.searchParams.get('language') || 'I'
            const book = url.searchParams.get('book') || ''
            const chapter = url.searchParams.get('chapter') || ''
            const locale = language === 'E' ? { r: 'r1', lp: 'lp-e' } : { r: 'r6', lp: 'lp-i' }
            const target = `https://wol.jw.org/wol/b/${locale.r}/${locale.lp}/nwtsty/${book}/${chapter}`
            const upstream = await fetch(target, {
              headers: { Accept: 'application/json', 'User-Agent': 'JW-Studio/1.0' },
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'public, max-age=86400')
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
  plugins: [react(), localApiPlugin(), swManifestPlugin()],
  server: {
    host: true,
    port: 5173,
  },
})
