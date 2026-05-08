const CACHE_NAME = 'sambag-pwa-v1'
const ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS)
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // network-first for API requests
  if (req.url.includes('/rest/v1') || req.url.includes('supabase')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          return res
        })
        .catch(() => caches.match(req))
    )
    return
  }

  // cache-first for assets
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      return caches.open(CACHE_NAME).then((cache) => {
        try { cache.put(req, res.clone()) } catch (e) {}
        return res
      })
    }).catch(() => caches.match('/')))
  )
})
