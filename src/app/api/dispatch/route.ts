import { NextRequest, NextResponse } from 'next/server';
import { createRequest, getAllActive } from '@/lib/dispatch-store';
import { notifyPharmacists } from '@/lib/push-notify';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { medicines, userState, userPhone, patientNotes } = await req.json();
    if (!medicines?.length || !userState || !userPhone) {
      return NextResponse.json(
        { error: 'medicines, userState, and userPhone are required' },
        { status: 400 }
      );
    }
    const id = await createRequest({ medicines, userState, userPhone, patientNotes: patientNotes ?? undefined });

    // Await the push — fire-and-forget was being killed by Vercel before it completed.
    // Template body keeps this under 1s; no AI call in this path.
    await notifyPharmacists(medicines, userState, id).catch((err) =>
      console.error('[dispatch notify]', err)
    );

    return NextResponse.json({ requestId: id });
  } catch (err) {
    console.error('[dispatch POST]', err);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const requests = await getAllActive();
    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[dispatch GET]', err);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}
