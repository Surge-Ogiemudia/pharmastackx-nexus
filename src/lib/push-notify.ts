import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendPushToAll, getSubscriptionCount } from './push-store';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function buildNotificationBody(
  medicines: { name: string; strength?: string }[],
  location: string,
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      generationConfig: { maxOutputTokens: 60, temperature: 0.3 },
    });
    const medList = medicines.map((m) => `${m.name}${m.strength ? ` ${m.strength}` : ''}`).join(', ');
    const result = await model.generateContent(
      `Write a 1-sentence push notification alerting a pharmacist to a new urgent medicine request.
Medicines needed: ${medList}
Patient location: ${location}
Rules: Max 80 characters. Clinical urgency. Start with 🚨. No markdown, no quotes. Output only the sentence.`,
    );
    const text = result.response
      .text()
      .trim()
      .split('\n')[0]
      .replace(/^["'"]+|["'"]+$/g, '')
      .trim();
    if (text.length > 10) return text;
  } catch { /* fall through to fallback */ }
  return `🚨 ${medicines.map((m) => m.name).join(', ')} needed in ${location} — urgent.`;
}

export async function notifyPharmacists(
  medicines: { name: string; strength?: string }[],
  location: string,
  requestId: string,
): Promise<void> {
  if (getSubscriptionCount() === 0) return;
  const body = await buildNotificationBody(medicines, location);
  await sendPushToAll({ title: 'PharmaStackX · New Request', body, requestId });
}
