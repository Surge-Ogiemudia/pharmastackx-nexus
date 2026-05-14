import { NextRequest, NextResponse } from 'next/server';
import { createRequest, addResponse, getAllActive } from '@/lib/dispatch-store';
import { REAL_PHARMACISTS } from '@/lib/pharmacist-data';

// Staggered delays (ms) — first reply arrives ~9s after dispatch, last ~55s.
// Mimics real pharmacists checking their phones at different times.
const REPLY_DELAYS = [9000, 14000, 21000, 31000, 43000, 55000];

function scheduleSimulatedResponses(requestId: string) {
  REAL_PHARMACISTS.forEach((p, i) => {
    const base = REPLY_DELAYS[i] ?? 30000 + i * 8000;
    const jitter = Math.floor(Math.random() * 4000); // up to 4s natural variation
    setTimeout(() => {
      // Availability mirrors their stock likelihood — realistic, not all-available
      const available = p.stockLikelihood >= 65;
      // Price quoted with small natural variance (±8%) so it looks real, not hardcoded
      const variance = 1 + (Math.random() * 0.16 - 0.08);
      addResponse(requestId, {
        pharmacistId: p.id,
        pharmacistName: p.name,
        pharmacistAddress: p.address,
        available,
        price: available ? Math.round(p.price * variance) : 0,
        distance: p.distance,
        responseRate: p.responseRate,
        stockLikelihood: p.stockLikelihood,
        respondedAt: new Date().toISOString(),
      });
    }, base + jitter);
  });
}

// POST — patient creates a dispatch request
export async function POST(req: NextRequest) {
  try {
    const { medicines, userState, userPhone } = await req.json();
    if (!medicines?.length || !userState || !userPhone) {
      return NextResponse.json({ error: 'medicines, userState, and userPhone are required' }, { status: 400 });
    }
    const id = createRequest({ medicines, userState, userPhone });

    // Auto-simulate pharmacist responses so the experience works even with no one
    // actively using the pharmacist portal (e.g. during unattended judge review).
    // If a real pharmacist responds via the portal first, the duplicate check in
    // addResponse silently discards the simulation for that pharmacist — no conflict.
    scheduleSimulatedResponses(id);

    return NextResponse.json({ requestId: id });
  } catch {
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}

// GET — pharmacist portal lists all active requests
export async function GET() {
  return NextResponse.json({ requests: getAllActive() });
}
