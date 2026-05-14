import type { Medicine } from './nexus-brain';
import { REAL_PHARMACISTS } from './pharmacist-data';

export interface PharmacistResponse {
  pharmacistId: string;
  pharmacistName: string;
  pharmacistAddress: string;
  available: boolean;
  price: number;
  distance: number;
  responseRate: number;
  stockLikelihood: number;
  respondedAt: string;
}

export interface DispatchRequest {
  id: string;
  medicines: Medicine[];
  userState: string;
  userPhone: string;
  createdAt: string;
  responses: PharmacistResponse[];
}

// Internal — never sent over the wire
interface SimSlot {
  pharmacistIdx: number;
  dueAt: number;       // absolute ms timestamp when this response becomes visible
  available: boolean;
  priceVariance: number;
}

interface StoredRequest extends DispatchRequest {
  _simSlots: SimSlot[];
}

// Staggered delays — first reply ~9 s, last ~55 s, mimicking real humans
const REPLY_DELAYS = [9000, 14000, 21000, 31000, 43000, 55000];

// Singleton — survives Next.js hot-reload in dev via globalThis
declare global {
  // eslint-disable-next-line no-var
  var _psx_dispatch_store: Map<string, StoredRequest> | undefined;
}

if (!global._psx_dispatch_store) {
  global._psx_dispatch_store = new Map();
}

const store = global._psx_dispatch_store;

export function createRequest(
  data: Pick<DispatchRequest, 'medicines' | 'userState' | 'userPhone'>
): string {
  const id = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const now = Date.now();

  // Pre-compute each pharmacist's simulated response time and outcome.
  // Stored with the request so any serverless instance that handles a poll
  // can inject due responses without needing live setTimeout callbacks.
  const simSlots: SimSlot[] = REAL_PHARMACISTS.map((p, i) => {
    const base = REPLY_DELAYS[i] ?? 30000 + i * 8000;
    const jitter = Math.floor(Math.random() * 4000);
    return {
      pharmacistIdx: i,
      dueAt: now + base + jitter,
      available: p.stockLikelihood >= 65,
      priceVariance: 1 + (Math.random() * 0.16 - 0.08),
    };
  });

  store.set(id, { ...data, id, createdAt: new Date(now).toISOString(), responses: [], _simSlots: simSlots });

  // Evict requests older than 2 hours
  const cutoff = now - 2 * 60 * 60 * 1000;
  for (const [k, v] of store) {
    if (new Date(v.createdAt).getTime() < cutoff) store.delete(k);
  }
  return id;
}

export function getRequest(id: string): DispatchRequest | undefined {
  return store.get(id);
}

// Called on every poll — injects any simulated responses whose dueAt has passed.
// Safe to call repeatedly; addResponse's duplicate check prevents double-insertion.
export function injectDueSimulations(id: string): void {
  const req = store.get(id);
  if (!req) return;
  const now = Date.now();
  for (const slot of req._simSlots) {
    if (now < slot.dueAt) continue;
    const p = REAL_PHARMACISTS[slot.pharmacistIdx];
    if (!p) continue;
    addResponse(id, {
      pharmacistId: p.id,
      pharmacistName: p.name,
      pharmacistAddress: p.address,
      available: slot.available,
      price: slot.available ? Math.round(p.price * slot.priceVariance) : 0,
      distance: p.distance,
      responseRate: p.responseRate,
      stockLikelihood: p.stockLikelihood,
      respondedAt: new Date(slot.dueAt).toISOString(),
    });
  }
}

export function addResponse(requestId: string, response: PharmacistResponse): 'ok' | 'not_found' | 'duplicate' {
  const req = store.get(requestId);
  if (!req) return 'not_found';
  if (req.responses.some((r) => r.pharmacistId === response.pharmacistId)) return 'duplicate';
  req.responses.push(response);
  return 'ok';
}

export function getAllActive(): DispatchRequest[] {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return [...store.values()]
    .filter((r) => new Date(r.createdAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
