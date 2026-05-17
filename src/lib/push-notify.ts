import { sendPushToAll, getSubscriptionCount } from './push-store';

export async function notifyPharmacists(
  medicines: { name: string; strength?: string }[],
  location: string,
  requestId: string,
): Promise<void> {
  if (await getSubscriptionCount() === 0) return;

  const medList = medicines.map((m) => `${m.name}${m.strength ? ` ${m.strength}` : ''}`).join(', ');
  const body = `🚨 ${medList} needed in ${location} — respond now.`;

  await sendPushToAll({ title: 'PharmaStackX · New Request', body, requestId });
}
