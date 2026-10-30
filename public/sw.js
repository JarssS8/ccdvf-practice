// Hashed build assets (fonts included): cache-first (they never change under the same URL).
// Everything else: network-first with the cached copy as offline fallback. Never touches /api.
const CACHE = 'ccdvf-v3'
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.add('/'))); self.skipWaiting() })
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
const put = (req, res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res }
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => put(e.request, r))))
    return
  }
  const key = e.request.mode === 'navigate' ? '/' : e.request
  e.respondWith(fetch(e.request).then((r) => put(key, r)).catch(() => caches.match(key)))
})
