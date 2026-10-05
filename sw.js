/* Forestry offline service worker (scope: whole site).
 *
 * This is the ONLY service worker for both apps: frontend-desktop and
 * frontend-mobile both call register('/sw.js'), so the browser always fetches
 * this file. A second, older copy used to sit at frontend-mobile/public/sw.js
 * (which Vite copied to /mobile/sw.js) - a network-first worker with a
 * different cache name that nothing ever requested. It was removed rather than
 * kept in sync: two workers for one job is how the mobile copy silently aged
 * six weeks behind the real one.
 */
// Bumped to v9 when /quiz/dashboard stopped being cached: v8 had already
// stored per-account bodies under this origin-wide name, and renaming the
// cache is the only way to evict them.
const CACHE = 'forestry-v9';
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

  // Admin-managed credits: network-first.
  //
  // These two are edited deliberately in Admin, so a stale answer is the one
  // failure users actually notice - an admin adds a name to References or
  // Special Contribution and the About page keeps showing the old list.
  // They are tiny and change rarely, so there is nothing to gain from serving
  // them from cache; the cache is kept purely as an offline fallback.
  if (path === '/questions/contributors/' || path === '/questions/references/') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && isAssetResponse(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  // API reads: stale-while-revalidate. The cached answer returns
  // /quiz/dashboard carries its identity in the Authorization header, NOT in
  // the path, so this cache cannot tell one account's copy from another's.
  // Caching it served whoever logged in last the previous account's numbers,
  // and it made a quiz you had just finished look un-finished until the visit
  // after this one. Network-first with nothing written: the app already paints
  // from its own in-memory snapshot, so this costs no perceived speed, and the
  // cache name bump that shipped with this fix cleared the entries that the
  // old branch had already stored.
  if (path === '/quiz/dashboard') {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // IMMEDIATELY (no network wait) while a background fetch refreshes the
  // entry for next time. Repeat visits therefore render from cache in
  // milliseconds; first-ever visits have no entry and simply wait like before.
  //
  // Safe because every cached body is either bank facts (identical for all
  // users, busted server-side on admin writes, revalidated here on every
  // single read) or per-user data scoped by URL (user id in the path, so one
  // account can never be served another's entry). Mutations are POST/PUT/
  // DELETE and never reach this branch (non-GET returns at the top), and
  // /auth/* is not matched by any prefix below, so sessions and codes are
  // never cached anywhere in this worker.
  if (
    path.indexOf('/questions') === 0 ||
    path.indexOf('/quiz') === 0 ||
    path.indexOf('/api/') === 0 ||
    path === '/sitemap.xml' ||
    path === '/robots.txt'
  ) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const network = fetch(req).then((res) => {
          if (res.ok && isAssetResponse(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
        if (hit) {
          // Answer now; the network copy refreshes the entry behind.
          network.catch(() => {});
          return hit;
        }
        // No entry: this read IS the network (offline => undefined => the
        // app's own offline pack and error paths take over, as before).
        return network.catch(() => undefined);
      })
    );
    return;
  }
});
