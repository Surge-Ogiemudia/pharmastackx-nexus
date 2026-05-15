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
        'You are a medicine extraction AI. Output ONLY a JSON array of medicine objects with fields: name, strength, form, quantity. ' +
        'Example: [{"name":"Amoxicillin","strength":"500mg","form":"Capsule","quantity":null}]. ' +
        'Use null for unknown fields. No explanation. No markdown. Just the JSON array.',
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    });

    const prompt = `Patient: "${query}"

JSON array of medicines needed:`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    console.log('[extract-medicines] raw:', raw.substring(0, 300));

    const arrayMatch = raw.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) {
      console.error('[extract-medicines] no JSON array found');
      return NextResponse.json({ medicines: [] });
    }

    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return NextResponse.json({ medicines: [] });

    // Normalize: handle both string entries and object entries
    const medicines = parsed
      .map((m: unknown) => {
        if (typeof m === 'string' && m.trim()) {
          return { name: m.trim(), strength: null, form: null, quantity: null };
        }
        if (typeof m === 'object' && m !== null && 'name' in m) {
          return m;
        }
        return null;
      })
      .filter(Boolean);

    return NextResponse.json({ medicines });
  } catch (err) {
    console.error('[extract-medicines]', err);
    return NextResponse.json({ medicines: [] });
  }
}
