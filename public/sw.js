// Shout service worker: shows push notifications and opens the right chat when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: 'Shout', body: e.data ? e.data.text() : '' };
  }
  const title = d.title || 'Shout';
  e.waitUntil(
    (async () => {
      // Don't buzz if the person is already looking at that chat.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const looking = wins.some((w) => w.visibilityState === 'visible' && d.url && w.url.includes(d.url.split('?')[0].replace(/^\//, '')));
      if (looking && !d.test) return self.registration.showNotification(title, { body: d.body, tag: d.tag, silent: true, data: d }).then(() =>
        self.registration.getNotifications({ tag: d.tag }).then((ns) => ns.forEach((n) => n.close())));
      if (self.navigator.setAppBadge && d.badge) self.navigator.setAppBadge(d.badge).catch(() => {});
      return self.registration.showNotification(title, {
        body: d.body || '',
        tag: d.tag,
        renotify: !!d.tag,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: d,
      });
    })(),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if ('focus' in w) {
          await w.focus();
          if ('navigate' in w) return w.navigate(url).catch(() => w.postMessage({ type: 'open', url }));
          return w.postMessage({ type: 'open', url });
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
