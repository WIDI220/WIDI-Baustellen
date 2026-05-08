// Cache-Version wird bei jedem Build aus version.json gelesen
// Dadurch wird bei jedem Deploy der alte Cache automatisch invalidiert
const CACHE_BASE = 'widi-cache';
let CACHE = CACHE_BASE + '-v2'; // Fallback

// Version aus version.json laden und Cache aktualisieren
async function getVersion() {
  try {
    const res = await fetch('/version.json?_=' + Date.now());
    const data = await res.json();
    return CACHE_BASE + '-' + data.t;
  } catch {
    return CACHE;
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    getVersion().then(version => {
      CACHE = version;
      return caches.open(CACHE).then(c => c.addAll(['/']));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    getVersion().then(version => {
      CACHE = version;
      return caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        }))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;

  // API-Calls NIEMALS cachen
  if (
    url.includes('supabase.co') ||
    url.includes('/rest/v1/') ||
    url.includes('/auth/v1/') ||
    url.includes('/storage/v1/') ||
    url.includes('version.json')
  ) {
    return;
  }

  // Network First → bei Erfolg cachen → bei Fehler Cache-Fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Nachricht vom App-Code empfangen um Cache-Update zu erzwingen
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
