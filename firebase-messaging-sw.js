// Firebase Cloud Messaging — Service Worker
// Necessário FILENAME exato `firebase-messaging-sw.js` na raiz para o FCM funcionar.
// Recebe pushes em background quando a aba está fechada/escondida.
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCw4-YvSGt-WsXEt32H32AAAL-JloLeBlw",
  authDomain: "calendario-cd198.firebaseapp.com",
  projectId: "calendario-cd198",
  storageBucket: "calendario-cd198.firebasestorage.app",
  messagingSenderId: "1090026966194",
  appId: "1:1090026966194:web:764b477c8dba37b4fb4dab"
});

const messaging = firebase.messaging();

// Background message handler — só dispara quando a aba está fechada/inativa.
// FCM já mostra a notification automaticamente se payload incluir bloco `notification`,
// mas customizamos com data-payload pra controlar tag/click action.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || 'Fogo & Gestão';
  const opts = {
    body: n.body || d.body || '',
    icon: n.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: d.tag || `fg-${Date.now()}`,
    data: { url: d.url || './index.html', taskId: d.taskId || null },
    requireInteraction: d.requireInteraction === '1',
  };
  return self.registration.showNotification(title, opts);
});

// Click → foca/abre a aba certa
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.url || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          c.focus();
          if (data.taskId && c.postMessage) c.postMessage({ type: 'fg-open-task', taskId: data.taskId });
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
