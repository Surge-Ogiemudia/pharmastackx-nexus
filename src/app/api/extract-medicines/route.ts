import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction:
        'You are a medicine extraction AI. Output ONLY valid JSON:\n' +
        '{"medicines":[{"name":"string","strength":"string|null","form":"string|null","quantity":number|null}],"needsConfirmation":false,"condition":null}\n\n' +
        'Rules:\n' +
        '- needsConfirmation=false, condition=null: patient named a specific medicine → extract it directly\n' +
        '- needsConfirmation=true, condition="short condition name": patient described a condition/symptom → suggest 2-4 first-line medicines, set condition to concise name e.g. "malaria", "high blood pressure", "diabetes"\n' +
        'No markdown. No explanation. Just JSON.',
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
    });

    const prompt = `Patient: "${query}"

JSON:`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    console.log('[extract-medicines] raw:', raw.substring(0, 300));

    let medicinesRaw: unknown[] = [];
    let needsConfirmation = false;
    let condition: string | null = null;

    // Try object format first (includes needsConfirmation + condition)
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && typeof parsed === 'object') {
          medicinesRaw = Array.isArray(parsed.medicines) ? parsed.medicines : [];
          needsConfirmation = parsed.needsConfirmation === true;
          condition = typeof parsed.condition === 'string' && parsed.condition ? parsed.condition : null;
        }
      } catch { /* fall through */ }
    }

    // Fallback: array-only format
    if (medicinesRaw.length === 0) {
      const arrMatch = raw.match(/\[[\s\S]*?\]/);
      if (arrMatch) {
        try {
          const arr = JSON.parse(arrMatch[0]);
          medicinesRaw = Array.isArray(arr) ? arr : [];
        } catch { /* fall through */ }
      }
    }

    if (medicinesRaw.length === 0) {
      console.error('[extract-medicines] no JSON found');
      return NextResponse.json({ medicines: [], needsConfirmation: false, condition: null });
    }

    const medicines = medicinesRaw
      .map((m: unknown) => {
        if (typeof m === 'string' && m.trim()) return { name: m.trim(), strength: null, form: null, quantity: null };
        if (typeof m === 'object' && m !== null && 'name' in m) return m;
        return null;
      })
      .filter(Boolean);

    return NextResponse.json({ medicines, needsConfirmation, condition });
  } catch (err) {
    console.error('[extract-medicines]', err);
    return NextResponse.json({ medicines: [], needsConfirmation: false, condition: null });
  }
}
