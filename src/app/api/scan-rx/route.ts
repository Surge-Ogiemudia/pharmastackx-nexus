import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PROMPT = `You are a pharmaceutical scanner reading a prescription image.
List ALL medicines visible in the prescription. For each medicine extract:
- name: The EXACT name as written (brand or generic). Do NOT substitute with alternatives.
- strength: The dose (e.g. '500mg', '10mg/5ml').
- form: MUST be one of: Tablet, Capsule, Syrup, Injection, Cream, Inhaler.
- quantity: Total amount prescribed (number only).
- unit: MUST be one of: Strips, Packs, Bottles, Vials, Sachets, Pieces.

IMPORTANT:
- Output ONLY the raw JSON array. No explanation. No thinking. No markdown.
- Format: [{"name": "...", "strength": "...", "form": "...", "quantity": 2, "unit": "Packs"}]`;

function extractPrescriptionJSON(text: string): object[] {
  const stripped = text.replace(/```json|```|`/gi, '');
  const nameIdx = stripped.indexOf('"name"');
  if (nameIdx === -1) throw new Error('No "name" key in response');
  // backtrack to {
  let objStart = -1;
  for (let i = nameIdx; i >= 0; i--) {
    if (stripped[i] === '{') { objStart = i; break; }
  }
  if (objStart === -1) throw new Error('No opening brace before "name"');
  // check if there's a [ array wrapper before the {
  let startIdx = objStart;
  for (let i = objStart - 1; i >= 0; i--) {
    const ch = stripped[i];
    if (ch === '[') { startIdx = i; break; }
    if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') break;
  }
  const opener = stripped[startIdx];
  const closer = opener === '[' ? ']' : '}';
  let depth = 0, endIdx = -1;
  for (let i = startIdx; i < stripped.length; i++) {
    if (stripped[i] === opener) depth++;
    else if (stripped[i] === closer) { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) throw new Error('Unbalanced JSON');
  const parsed = JSON.parse(stripped.substring(startIdx, endIdx + 1));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function computeConfidence(med: Record<string, unknown>): number {
  let score = 0;
  const name = String(med.name ?? '');
  const strength = String(med.strength ?? '');
  const form = String(med.form ?? '');
  const quantity = Number(med.quantity ?? 0);
  if (name.length >= 3) score += 2;
  if (/^[A-Za-z\s\-().]+$/.test(name)) score += 1;
  if (/\d+\s*(mg|ml|g|mcg|iu|%)/i.test(strength)) score += 2; else if (strength.length > 0) score += 1;
  if (['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Inhaler'].includes(form)) score += 1;
  if (quantity > 0 && quantity <= 500) score += 1;
  return score;
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: 'Image required' }, { status: 400 });

    const base64Data = image.includes(',') ? image.split(',')[1] : image;
    const model = genAI.getGenerativeModel({ model: 'gemma-4-26b-a4b-it' });
    const result = await model.generateContent([PROMPT, { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }]);
    const text = result.response.text();
    const medicines = extractPrescriptionJSON(text);

    const scores = (medicines as Record<string, unknown>[]).map(computeConfidence);
    const minScore = Math.min(...scores);
    const confidence: 'High' | 'Medium' | 'Low' = minScore >= 6 ? 'High' : minScore >= 3 ? 'Medium' : 'Low';
    const flags: string[] = [];
    if (medicines.length === 0) flags.push('no medicines extracted');
    if (confidence === 'Low') flags.push('one or more medicines have low extraction confidence');

    return NextResponse.json({
      medicines,
      safetyReport: { confidence, verifyWithPharmacist: confidence !== 'High', flags },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
