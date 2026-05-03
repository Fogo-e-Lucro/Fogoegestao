// Service Worker — Fogo & Gestão
// V1: pass-through (instalável + remove jank). Cache offline vem na feature 14.
// Bump cache version cada vez que mudar lógica:
const SW_VERSION = 'fg-v1.0.0';

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar SW antigo terminar
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma controle de todas as abas abertas
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch — não intercepta. Vem cache na próxima feature.
self.addEventListener('fetch', (event) => {
  // Não intervém — deixa o navegador resolver direto.
});

// Push notifications (preparado pra feature 13 — FCM)
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
