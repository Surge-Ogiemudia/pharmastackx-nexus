import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    if (!message?.trim()) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction: `You are an intent classification AI for a medicine-finding app called Nexus.

Classify the user message into exactly one intent:
- "consultation": health question, asking about side effects, dosages, drug interactions, medical advice, or any question that doesn't involve finding/buying a medicine
- "find_medicine": user wants to buy or locate a specific medicine they already know the name of
- "condition_search": user wants medicine for a condition/symptom, does not know which medicine, forgot their medicine name, or says "something for X"
- "scan": user wants to photograph or scan a prescription, pill, or medicine pack

Output ONLY valid JSON with all four fields. No explanation. No markdown.

Format:
{"intent":"consultation","medicines":[],"condition":null,"suggestedMedicines":[]}

Rules for each intent:
- find_medicine: fill medicines[] with objects [{name, strength, form, quantity}], use null for unknown fields
- condition_search: set condition to a short concise name (e.g. "high blood pressure", "malaria", "diabetes"), fill suggestedMedicines[] with 2-4 common first-line medicines as objects [{name, strength, form, quantity}]
- consultation: leave medicines[], condition, suggestedMedicines[] empty/null
- scan: leave all other fields empty/null`,
      generationConfig: { temperature: 0.1, maxOutputTokens: 400 },
    });

    const historyLines = Array.isArray(history) && history.length > 0
      ? history.map((h: { role: string; text: string }) => `${h.role === 'user' ? 'User' : 'Nexus'}: ${h.text}`).join('\n')
      : '';

    const prompt = historyLines
      ? `Recent conversation:\n${historyLines}\n\nNew message: "${message}"\n\nJSON:`
      : `Message: "${message}"\n\nJSON:`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json(fallback());

    const parsed = JSON.parse(jsonMatch[0]);

    const intent = ['consultation', 'find_medicine', 'condition_search', 'scan'].includes(parsed.intent)
      ? parsed.intent
      : 'consultation';

    return NextResponse.json({
      intent,
      medicines: normalizeMedicines(parsed.medicines),
      condition: typeof parsed.condition === 'string' ? parsed.condition : null,
      suggestedMedicines: normalizeMedicines(parsed.suggestedMedicines),
    });
  } catch (err) {
    console.error('[classify-intent]', err);
    return NextResponse.json(fallback());
  }
}

function fallback() {
  return { intent: 'consultation', medicines: [], condition: null, suggestedMedicines: [] };
}

function normalizeMedicines(raw: unknown): { name: string; strength: string | null; form: string | null; quantity: number | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m: unknown) => {
      if (typeof m === 'string' && m.trim()) return { name: m.trim(), strength: null, form: null, quantity: null };
      if (typeof m === 'object' && m !== null && 'name' in m) {
        const med = m as Record<string, unknown>;
        return {
          name: String(med.name ?? '').trim(),
          strength: typeof med.strength === 'string' ? med.strength : null,
          form: typeof med.form === 'string' ? med.form : null,
          quantity: typeof med.quantity === 'number' ? med.quantity : null,
        };
      }
      return null;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null && m.name.length > 0);
}
