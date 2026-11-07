/* JW Studio — service worker: shell + asset build + capitoli Bibbia già letti */
const SHELL = 'jw-studio-shell-v5'
const BIBLE = 'jw-studio-bible-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      let list = [
        '/',
        '/index.html',
        '/favicon.svg',
        '/logo.svg',
        '/icon-192.png',
        '/apple-touch-icon.png',
        '/manifest.webmanifest',
        '/fonts/manrope-latin.woff2',
        '/fonts/fraunces-latin.woff2',
      ]
      try {
        const res = await fetch('/sw-manifest.json', { cache: 'no-store' })
        if (res.ok) {
          const extra = await res.json()
          if (Array.isArray(extra)) list = [...new Set([...list, ...extra])]
        }
      } catch {
        /* prima installazione senza manifest */
      }
      await cache.addAll(list.filter(Boolean))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('jw-studio-shell-') && k !== SHELL)
          .map((k) => caches.delete(k)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Cache Bibbia API (capitoli già letti)
  if (url.origin === self.location.origin && url.pathname === '/api/jw-bible') {
    event.respondWith(bibleStrategy(req))
    return
  }

  if (url.origin !== self.location.origin) {
    // Font Google: cache-first se CORS
    if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
      event.respondWith(
        caches.open(SHELL).then(async (cache) => {
          const hit = await cache.match(req)
          if (hit) return hit
          try {
            const res = await fetch(req)
            if (res.ok) cache.put(req, res.clone())
            return res
          } catch {
            return hit || Response.error()
          }
        }),
      )
    }
    return
  }

  if (url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(async (res) => {
          if (!res.ok) return (await caches.match('/index.html')) || res
          const cache = await caches.open(SHELL)
          await cache.put('/index.html', res.clone()).catch(() => {})
          return res
        })
        .catch(() =>
          caches.match('/index.html').then((r) => r || caches.match('/')),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (!res.ok || res.type === 'opaque' || res.redirected ||
          (url.pathname.startsWith('/assets/') && res.headers.get('Content-Type')?.includes('text/html'))) return res
        const copy = res.clone()
        caches.open(SHELL).then((c) => c.put(req, copy))
        return res
      })
    }),
  )
})

async function bibleStrategy(req) {
  const cache = await caches.open(BIBLE)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req)
    if (hit) return hit
    return new Response(JSON.stringify({ error: 'Offline: capitolo non in cache' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
