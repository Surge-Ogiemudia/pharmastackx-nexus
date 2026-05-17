import webpush from 'web-push';

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:pogiemudia@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// Survive Next.js hot-module-replacement in development — global persists across reloads
const g = global as typeof global & { __pushSubs?: Map<string, webpush.PushSubscription> };
if (!g.__pushSubs) g.__pushSubs = new Map();
const subscriptions = g.__pushSubs;

export function saveSubscription(sub: webpush.PushSubscription) {
  subscriptions.set(sub.endpoint, sub);
}

export async function sendPushToAll(payload: object): Promise<number> {
  if (subscriptions.size === 0) return 0;
  const message = JSON.stringify(payload);
  const entries = [...subscriptions.entries()];
  const results = await Promise.allSettled(
    entries.map(([, sub]) => webpush.sendNotification(sub, message))
  );
  // Prune expired subscriptions
  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 410 || code === 404) subscriptions.delete(entries[idx][0]);
    }
  });
  return entries.length;
}

export function getSubscriptionCount(): number {
  return subscriptions.size;
}
