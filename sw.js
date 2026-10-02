/* Forestry offline service worker (scope: whole site). */
const CACHE = 'forestry-v6';
// Only paths that genuinely resolve. /forestry-logo.png was listed here and
// never did: the SPA catch-all answers every unmatched path with index.html and
// a 200, so the fetch "succeeded" and cached an HTML body under a .png URL.
// Icons live under the app prefixes, which is where they are actually served.
const CORE = [
  '/',
  '/mobile',
  '/desktop',
  '/mobile/forestry-logo.png',
  '/desktop/forestry-logo.png',
];

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

// Which app's shell serves this path? '/mobile/questions' is mobile,
// '/desktop/about' is desktop, and the bare root is whichever app the origin
// sends by default.
function appPrefixFor(path) {
  if (path.indexOf('/mobile') === 0) return '/mobile';
  if (path.indexOf('/desktop') === 0) return '/desktop';
  return null;
}

// Find a cached shell for an app prefix. The precache list names the prefixes
// without a trailing slash while real navigations carry one, and Cache Storage
// treats those as different keys - so a lookup for '/desktop' misses an entry
// stored as '/desktop/'. Try both forms rather than depending on which spelling
// happened to be cached first.
function matchShell(cache, prefix) {
  const bare = prefix;
  const slashed = prefix + '/';
  return cache
    .match(new Request(bare))
    .then((hit) => hit || cache.match(new Request(slashed)))
    .then((hit) => hit || null);
}

// Does this response actually carry the asset the path claims to name?
// The SPA catch-all answers any unrecognised path with index.html and a 200, so
// `res.ok` alone cannot tell an asset from a not-found page dressed as one.
// An HTML body for a .js/.css/.png URL is the case that matters: it must be
// passed through uncached rather than stored.
function isAssetResponse(res) {
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (type.includes('text/html')) return false;
  return true;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // same-origin only
  const path = url.pathname;

  // App shells / navigations: network-first, offline falls back to cached shell.
  //
  // The shell returned offline must be the one that matches the REQUESTED path,
  // not the one that matches the User-Agent. These are two separate apps served
  // from one origin, and picking by UA hands a /desktop/... URL to the mobile
  // bundle whenever the device is a desktop. That bundle's router does not
  // recognise the prefix, falls through to its catch-all, and redirects to "/",
  // so an offline deep link silently became the home page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => {
              c.put(req, copy);
              // Remember which app was last loaded, as an app prefix rather than
              // an exact URL, so a later offline visit has a sensible default.
              const prefix = appPrefixFor(path);
              if (prefix) {
                c.put(new Request('/_last-shell'), new Response(prefix));
              }
            });
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => {
            if (hit) return hit;
            return caches.open(CACHE).then((c) =>
              c.match(new Request('/_last-shell')).then((m) => m ? m.text() : null)
            ).then((saved) => {
              // Requested app first, then whichever app was last used here, then
              // the User-Agent's guess. Requested app always wins, so a
              // cross-app fallback can only happen when nothing better exists.
              const order = [];
              const own = appPrefixFor(path);
              if (own) order.push(own);
              if (saved && appPrefixFor(saved)) order.push(appPrefixFor(saved));
              order.push(isMobileUA() ? '/mobile' : '/desktop');
              order.push(isMobileUA() ? '/desktop' : '/mobile');
              let chain = Promise.resolve(null);
              order.forEach((u) => {
                chain = chain.then((found) => found || matchShell(c, u));
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
            // Only cache a real asset. A path ending in .js/.css/.png that the
            // server answered with the SPA fallback is NOT that asset - the
            // catch-all returns index.html with a 200 for anything it does not
            // recognise. Caching that HTML under the asset's URL poisons the
            // entry permanently (the cache is checked before the network, so it
            // never self-heals), and the browser then refuses the script with
            // "unsupported MIME type ('text/html')" on every later load. This is
            // reachable: a relative href in index.html resolves against the
            // current route, so /question/1 asked for /question/logo.png.
            if (res.ok && isAssetResponse(res)) {
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
