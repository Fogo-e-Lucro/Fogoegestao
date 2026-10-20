// Service Worker — Fogo & Gestão
// V2: cache app-shell para modo offline. Mutations Firestore são tratadas
// pela própria persistência IndexedDB do Firestore (queue automática).
// Bump cache version cada vez que mudar lógica:
const SW_VERSION = 'fg-v3.71.2';
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

// Avisos no celular: o fg-push (VPS) manda pelo FCM { data: { title, body, taskId, tag } }.
// É o único service worker do app (o token do FCM é pego com este registro).
self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch(_) { p = { title: 'Fogo & Gestão', body: event.data.text() }; }
  const d = p.data || p.notification || p;
  event.waitUntil(self.registration.showNotification(d.title || 'Fogo & Gestão', {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    // mesma tag do pjFireDesktopNotif: se os dois mostrarem, vira um aviso só
    tag: d.tag || `fg-${d.taskId || Date.now()}`,
    data: { taskId: d.taskId || null },
  }));
});

// Toque no aviso: com o app aberto, foca e pede pra abrir a tarefa; fechado, abre em ./?task=ID
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const c = list.find(w => 'focus' in w);
      if (c) {
        if (taskId) c.postMessage({ type: 'fg-open-task', taskId });
        return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(taskId ? './?task=' + encodeURIComponent(taskId) : './');
    })
  );
});

// Permite o app forçar atualização (ex: botão "Recarregar")
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
