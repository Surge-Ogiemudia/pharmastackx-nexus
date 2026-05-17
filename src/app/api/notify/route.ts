import { NextRequest, NextResponse } from 'next/server';
import { notifyPharmacists } from '@/lib/push-notify';
import { getSubscriptionCount } from '@/lib/push-store';

export async function POST(req: NextRequest) {
  try {
    const { medicines, location, requestId } = await req.json();
    if (!medicines?.length || !location || !requestId) {
      return NextResponse.json({ error: 'medicines, location, and requestId are required' }, { status: 400 });
    }
    const subCount = await getSubscriptionCount();
    if (subCount === 0) {
      return NextResponse.json({ ok: true, sent: 0, message: 'No subscribers yet' });
    }
    await notifyPharmacists(medicines, location, requestId);
    return NextResponse.json({ ok: true, sent: subCount });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[notify]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
