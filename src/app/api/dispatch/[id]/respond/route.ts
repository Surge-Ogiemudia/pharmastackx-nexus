import { NextRequest, NextResponse } from 'next/server';
import { addResponse } from '@/lib/dispatch-store';
import type { PharmacistResponse, MedicineAvailability } from '@/lib/dispatch-store';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();

    const items: MedicineAvailability[] = Array.isArray(body.items) ? body.items : [];
    const totalPrice = items.length > 0
      ? items.filter((i) => i.available).reduce((sum, i) => sum + (i.price ?? 0), 0)
      : (body.price ?? 0);

    const response: PharmacistResponse = {
      pharmacistId: body.pharmacistId,
      pharmacistName: body.pharmacistName,
      pharmacistAddress: body.pharmacistAddress,
      available: body.available,
      price: totalPrice,
      items,
      pharmacistNotes: body.pharmacistNotes ?? undefined,
      distance: body.distance,
      responseRate: body.responseRate,
      stockLikelihood: body.stockLikelihood ?? 80,
      respondedAt: new Date().toISOString(),
    };

    const result = await addResponse(id, response);
    if (result === 'not_found') return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    if (result === 'duplicate') return NextResponse.json({ error: 'Already responded' }, { status: 409 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid response data' }, { status: 400 });
  }
}
