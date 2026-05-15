import { NextRequest, NextResponse } from 'next/server';
import { getRequest } from '@/lib/dispatch-store';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const request = await getRequest(id);
    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    return NextResponse.json(request);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch request' }, { status: 500 });
  }
}
