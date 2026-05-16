import { NextRequest, NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/push-store';
import type webpush from 'web-push';

export async function POST(req: NextRequest) {
  try {
    const sub: webpush.PushSubscription = await req.json();
    if (!sub?.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
    }
    saveSubscription(sub);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[push-subscribe]', err);
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }
}
