import { NextRequest, NextResponse } from 'next/server';
import { getRequest } from '@/lib/dispatch-store';

// GET — patient polls for responses on their request
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const request = getRequest(id);
  if (!request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  return NextResponse.json(request);
}
