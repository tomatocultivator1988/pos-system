const CACHE = "beanpos-v3"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(Promise.all([clients.claim(), caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))])))
self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  // Server-rendered app: document navigations must always hit the network
  // (auth, fresh HTML). Never serve a 503 "Offline" shell for navigations.
  if (req.mode === "navigate") return
  const url = new URL(req.url)
  if (url.pathname.startsWith("/api/")) return
  if (req.headers.get("RSC") === "1" || (req.headers.get("accept") || "").includes("text/x-component")) return
  e.respondWith(
    fetch(req).then(r => {
      const ct = (r.headers.get("content-type") || "").split(";")[0]
      const cacheable = ["text/html", "text/css", "application/javascript", "text/javascript", "image/png", "image/jpeg", "image/svg+xml", "image/webp", "font/woff", "font/woff2", "application/manifest+json"].includes(ct) || ct.startsWith("image/") || ct.startsWith("font/")
      if (r.ok && r.type === "basic" && cacheable) {
        const c = r.clone()
        e.waitUntil(caches.open(CACHE).then(cache => cache.put(req, c)))
      }
      return r
    }).catch(() => caches.match(req).then(cached => cached || new Response("Offline", { status: 503, statusText: "Offline" })))
  )
})
