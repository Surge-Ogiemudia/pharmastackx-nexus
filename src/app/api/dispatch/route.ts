import { NextRequest, NextResponse } from 'next/server';
import { createRequest, getAllActive } from '@/lib/dispatch-store';

// POST — patient creates a dispatch request
export async function POST(req: NextRequest) {
  try {
    const { medicines, userState, userPhone } = await req.json();
    if (!medicines?.length || !userState || !userPhone) {
      return NextResponse.json({ error: 'medicines, userState, and userPhone are required' }, { status: 400 });
    }
    // Simulation schedule is pre-computed inside createRequest and stored with
    // the request. Responses are injected lazily on each GET poll so they never
    // depend on setTimeout surviving past this response.
    const id = createRequest({ medicines, userState, userPhone });
    return NextResponse.json({ requestId: id });
  } catch {
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}

// GET — pharmacist portal lists all active requests
export async function GET() {
  return NextResponse.json({ requests: getAllActive() });
}
