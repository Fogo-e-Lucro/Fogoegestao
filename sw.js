// Service Worker — Fogo & Gestão
// V2: cache app-shell para modo offline. Mutations Firestore são tratadas
// pela própria persistência IndexedDB do Firestore (queue automática).
// Bump cache version cada vez que mudar lógica:
const SW_VERSION = 'fg-v3.36.3';
const SHELL_CACHE = `fg-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `fg-runtime-${SW_VERSION}`;

// Arquivos do shell — pré-cacheados na instalação para abrir offline.
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      // addAll falha tudo se um item falhar — usa add individual com catch
      Promise.all(SHELL_ASSETS.map(url =>
        cache.add(url).catch(err => console.warn('[SW] cache miss:', url, err.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Purga total: apaga TODOS os caches fg-* (nao so os antigos).
  // Assim quando ativa, os proximos fetch vao network-first e re-cacheiam versao nova.
  // Resolve usuarios com SW pre-v3.16 servindo styles.css/index.html cacheados velhos.
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('fg-')).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(clients => clients.forEach(c => { try { c.navigate(c.url); } catch(_){} }))
  );
});

// Estratégias:
// - Navigation (HTML): network-first, fallback cache (app shell offline)
// - Static (css/js/img/svg/font): stale-while-revalidate
// - Firebase/Firestore/Auth/APIs Claude/etc: PASS-THROUGH (não intercepta)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Não interceptar APIs / SDKs externos — deixa o Firestore offline lidar.
  const passthrough = [
    'firebaseio.com', 'firestore.googleapis.com', 'googleapis.com',
    'gstatic.com', 'firebaseapp.com', 'identitytoolkit.googleapis.com',
    'anthropic.com', 'api.anthropic.com', 'imgbb.com', 'i.imgur.com',
    'graph.facebook.com', 'places.googleapis.com', 'uazapi.com',
    'dataforseo.com', 'fcm.googleapis.com'
  ];
  if (passthrough.some(host => url.hostname.includes(host))) return;

  // Navigation requests → network-first com fallback shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy)).catch(()=>{});
        return res;
      }).catch(() => caches.match('./index.html').then(c => c || caches.match('./')))
    );
    return;
  }

  // Same-origin static: CSS/JS → network-first (evita cache stale que quebra layout)
  // Imagens/fontes/outros → stale-while-revalidate (rápido, aceita atrasar 1 revisão)
  if (url.origin === location.origin) {
    const isCritical = /\.(css|js)(\?|$)/i.test(url.pathname + url.search);
    if (isCritical) {
      event.respondWith(
        fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        }).catch(() => caches.match(req))
      );
      return;
    }
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

// Push notifications (preparado pra feature 13 — FCM)
// Em paralelo, firebase-messaging-sw.js trata os pushes do FCM.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try { payload = event.data.json(); } catch(_) { payload = { title: 'Fogo & Gestão', body: event.data.text() }; }
  const title = payload.title || 'Fogo & Gestão';
  const opts = {
    body: payload.body || '',
    icon: payload.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: payload.tag || 'fg-default',
    data: payload.data || {},
    requireInteraction: !!payload.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) { c.focus(); if (c.navigate) c.navigate(url); return; }
      }
      if (self.clients.openWindow) self.clients.openWindow(url);
    })
  );
});

// Permite o app forçar atualização (ex: botão "Recarregar")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
