import { NextRequest, NextResponse } from 'next/server';
import { createRequest, getAllActive } from '@/lib/dispatch-store';

export async function POST(req: NextRequest) {
  try {
    const { medicines, userState, userPhone } = await req.json();
    if (!medicines?.length || !userState || !userPhone) {
      return NextResponse.json(
        { error: 'medicines, userState, and userPhone are required' },
        { status: 400 }
      );
    }
    const id = await createRequest({ medicines, userState, userPhone });
    return NextResponse.json({ requestId: id });
  } catch (err) {
    console.error('[dispatch POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const requests = await getAllActive();
    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[dispatch GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
