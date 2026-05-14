import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PROMPT = `You are a pharmaceutical scanner. Look at this medicine image and extract these EXACT fields:
- name: The EXACT brand name as written on the packaging. Do NOT guess or use generic alternatives.
- strength: The dosage (e.g. '500mg', '10mg/5ml', '30g').
- form: MUST be one of: Tablet, Capsule, Syrup, Injection, Cream, Inhaler, Drops.
- quantity: A number (e.g. 30).
- unit: MUST be one of: Strips, Packs, Bottles, Vials, Sachets, Pieces.

IMPORTANT:
- Output ONLY the raw JSON object. No explanation. No thinking. No markdown.
- Return a SINGLE JSON object: {"name": "...", "strength": "...", "form": "...", "quantity": 1, "unit": "Packs"}`;

function extractMedicineJSON(text: string): object {
  const stripped = text.replace(/```json|```|`/gi, '');
  const nameIdx = stripped.indexOf('"name"');
  if (nameIdx === -1) throw new Error('No "name" key in response');
  let startIdx = -1;
  for (let i = nameIdx; i >= 0; i--) {
    if (stripped[i] === '{') { startIdx = i; break; }
  }
  if (startIdx === -1) throw new Error('No opening brace before "name"');
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++;
    else if (stripped[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('Unbalanced JSON');
  return JSON.parse(stripped.substring(startIdx, endIdx + 1));
}

function computeConfidence(med: Record<string, unknown>): { confidence: 'High' | 'Medium' | 'Low'; flags: string[] } {
  let score = 0;
  const flags: string[] = [];

  const name = String(med.name ?? '');
  const strength = String(med.strength ?? '');
  const form = String(med.form ?? '');
  const quantity = Number(med.quantity ?? 0);

  if (name.length >= 3) score += 2; else flags.push('medicine name too short');
  if (/^[A-Za-z\s\-().]+$/.test(name)) score += 1; else flags.push('unusual characters in name');
  if (/\d+\s*(mg|ml|g|mcg|iu|%)/i.test(strength)) score += 2; else if (strength.length > 0) score += 1; else flags.push('strength missing or unclear');
  if (['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Inhaler', 'Drops'].includes(form)) score += 1; else flags.push('form not recognized');
  if (quantity > 0 && quantity <= 500) score += 1; else flags.push('quantity missing or unusual');

  const confidence: 'High' | 'Medium' | 'Low' = score >= 6 ? 'High' : score >= 3 ? 'Medium' : 'Low';
  return { confidence, flags };
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: 'Image required' }, { status: 400 });

    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const model = genAI.getGenerativeModel({ model: 'gemma-4-26b-a4b-it' });
    const result = await model.generateContent([PROMPT, { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }]);
    const text = result.response.text();
    const medicine = extractMedicineJSON(text);
    const { confidence, flags } = computeConfidence(medicine as Record<string, unknown>);
    return NextResponse.json({
      medicines: [medicine],
      safetyReport: { confidence, verifyWithPharmacist: confidence !== 'High', flags },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
