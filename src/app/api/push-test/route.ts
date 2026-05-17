import { NextResponse } from 'next/server';
import { sendPushToAll, getSubscriptionCount } from '@/lib/push-store';

export const maxDuration = 30;

export async function GET() {
  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  const env = {
    VAPID_PUBLIC_SET:  !!vapidPublic,
    VAPID_PRIVATE_SET: !!vapidPrivate,
    MONGODB_URI_SET:   !!process.env.MONGODB_URI,
  };

  try {
    const count = await getSubscriptionCount();
    if (count === 0) {
      return NextResponse.json({ ok: false, env, count: 0, message: 'No subscriptions saved in DB — open the app, allow notifications, then retry.' });
    }
    await sendPushToAll({
      title: 'PharmaStackX · Test',
      body: '✅ Push is working! Notifications will fire on new requests.',
      requestId: 'test',
    });
    return NextResponse.json({ ok: true, env, count, message: `Test push sent to ${count} subscriber(s)` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, env, error: message }, { status: 500 });
  }
}
