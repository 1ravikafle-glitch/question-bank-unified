/* Forestry offline service worker (scope: whole site). */
const CACHE = 'forestry-v4';
const CORE = ['/', '/mobile', '/desktop', '/desktop/forestry-logo.png', '/forestry-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return Promise.allSettled(CORE.map((u) => cache.add(u)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE && k.indexOf('forestry-') === 0).map((k) => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

function isMobileUA() {
  try { return /android|iphone|ipad|mobile/i.test(self.navigator.userAgent); } catch (e) { return false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // same-origin only
  const path = url.pathname;

  // App shells / navigations: network-first, offline falls back to cached shell.
  // Remembers the last shell served on this device so first-time offline
  // visits land on the right (mobile vs desktop) layout.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => {
              c.put(req, copy);
              if (path === '/mobile' || path === '/desktop' || path === '/') {
                c.put(new Request('/_last-shell'), new Response(path));
              }
            });
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => {
            if (hit) return hit;
            return caches.open(CACHE).then((c) =>
              c.match(new Request('/_last-shell')).then((m) => (m ? m.text() : null))
            ).then((saved) => {
              const order = [];
              if (saved === '/desktop' || saved === '/mobile') order.push(saved);
              order.push(isMobileUA() ? '/mobile' : '/desktop');
              order.push(isMobileUA() ? '/desktop' : '/mobile');
              let chain = Promise.resolve(null);
              order.forEach((u) => {
                chain = chain.then(
                  (found) => found || caches.match(u).then((h) => h || null)
                );
              });
              return chain.then((found) => found || Response.error());
            });
          })
        )
    );
    return;
  }

  // Versioned assets + images: cache-first
  if (
    path.indexOf('/assets/') !== -1 ||
    /\.(png|jpg|jpeg|svg|ico|woff2?|css|js)$/.test(path)
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // API reads: network-first, serve stale cache offline
  if (
    path.indexOf('/questions') === 0 ||
    path.indexOf('/quiz') === 0 ||
    path.indexOf('/api/') === 0 ||
    path === '/sitemap.xml' ||
    path === '/robots.txt'
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
