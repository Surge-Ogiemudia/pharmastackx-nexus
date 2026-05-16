self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, requestId } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: requestId || 'pharmastackx-request',
      requireInteraction: true,
      data: { url: '/pharmacist' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/pharmacist') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/pharmacist');
    })
  );
});
