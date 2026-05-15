import dbConnect from './mongoConnect';
import NexusRequest from '@/models/NexusRequest';
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

export async function createRequest(
  data: Pick<DispatchRequest, 'medicines' | 'userState' | 'userPhone'>
): Promise<string> {
  await dbConnect();
  const id = Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  await NexusRequest.create({ _id: id, ...data, responses: [] });
  return id;
}

export async function getRequest(id: string): Promise<DispatchRequest | null> {
  await dbConnect();
  const doc = await NexusRequest.findById(id).lean<Record<string, unknown>>();
  if (!doc) return null;
  return toDispatchRequest(doc);
}

export async function addResponse(
  requestId: string,
  response: PharmacistResponse
): Promise<'ok' | 'not_found' | 'duplicate'> {
  await dbConnect();
  const doc = await NexusRequest.findById(requestId);
  if (!doc) return 'not_found';
  const responses = doc.responses as PharmacistResponse[];
  if (responses.some((r) => r.pharmacistId === response.pharmacistId)) return 'duplicate';
  doc.responses.push(response);
  await doc.save();
  return 'ok';
}

export async function getAllActive(): Promise<DispatchRequest[]> {
  await dbConnect();
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const docs = await NexusRequest.find({ createdAt: { $gte: cutoff } })
    .sort({ createdAt: -1 })
    .lean<Record<string, unknown>[]>();
  return docs.map(toDispatchRequest);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDispatchRequest(doc: any): DispatchRequest {
  return {
    id: doc._id as string,
    medicines: doc.medicines as Medicine[],
    userState: doc.userState as string,
    userPhone: doc.userPhone as string,
    createdAt: doc.createdAt instanceof Date
      ? doc.createdAt.toISOString()
      : (doc.createdAt as string),
    responses: (doc.responses ?? []) as PharmacistResponse[],
  };
}
