import webpush from 'web-push';
import dbConnect from './mongoConnect';
import PushSubscriptionModel from '@/models/PushSubscription';

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:pogiemudia@gmail.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export async function saveSubscription(sub: webpush.PushSubscription): Promise<void> {
  await dbConnect();
  await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: sub.endpoint },
    { endpoint: sub.endpoint, keys: sub.keys },
    { upsert: true }
  );
}

export async function sendPushToAll(payload: object): Promise<number> {
  await dbConnect();
  const subs = await PushSubscriptionModel.find().lean<{ endpoint: string; keys: { p256dh: string; auth: string } }[]>();
  if (subs.length === 0) return 0;

  const message = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subs.map((sub) => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      message
    ))
  );

  // Prune expired/gone subscriptions
  const expired: string[] = [];
  results.forEach((r, idx) => {
    if (r.status === 'rejected') {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 410 || code === 404) expired.push(subs[idx].endpoint);
    }
  });
  if (expired.length > 0) {
    await PushSubscriptionModel.deleteMany({ endpoint: { $in: expired } });
  }

  return subs.length;
}

export async function getSubscriptionCount(): Promise<number> {
  await dbConnect();
  return PushSubscriptionModel.countDocuments();
}
