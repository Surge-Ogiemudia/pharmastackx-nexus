import { NextRequest, NextResponse } from 'next/server';
import { getRequest, injectDueSimulations } from '@/lib/dispatch-store';

// GET — patient polls for responses on their request
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Lazily inject any simulated pharmacist responses whose scheduled time has passed.
  // This replaces the old setTimeout approach which died when Vercel froze the function.
  injectDueSimulations(id);
  const request = getRequest(id);
  if (!request) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  return NextResponse.json(request);
}
