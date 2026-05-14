import type { Medicine } from './nexus-brain';

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

// Singleton — survives Next.js hot-reload in dev via globalThis
declare global {
  // eslint-disable-next-line no-var
  var _psx_dispatch_store: Map<string, DispatchRequest> | undefined;
}

if (!global._psx_dispatch_store) {
  global._psx_dispatch_store = new Map();
}

const store = global._psx_dispatch_store;

export function createRequest(
  data: Pick<DispatchRequest, 'medicines' | 'userState' | 'userPhone'>
): string {
  const id = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  store.set(id, { ...data, id, createdAt: new Date().toISOString(), responses: [] });
  // Evict requests older than 2 hours
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [k, v] of store) {
    if (new Date(v.createdAt).getTime() < cutoff) store.delete(k);
  }
  return id;
}

export function getRequest(id: string): DispatchRequest | undefined {
  return store.get(id);
}

export function addResponse(requestId: string, response: PharmacistResponse): 'ok' | 'not_found' | 'duplicate' {
  const req = store.get(requestId);
  if (!req) return 'not_found';
  if (req.responses.some((r) => r.pharmacistId === response.pharmacistId)) return 'duplicate';
  req.responses.push(response);
  return 'ok';
}

export function getAllActive(): DispatchRequest[] {
  const cutoff = Date.now() - 30 * 60 * 1000; // 30 min window
  return [...store.values()]
    .filter((r) => new Date(r.createdAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
