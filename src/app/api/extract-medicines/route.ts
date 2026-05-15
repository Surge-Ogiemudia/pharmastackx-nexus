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
      systemInstruction: 'You are a medicine extraction AI. Output ONLY a JSON array of medicines from the patient request. No explanation. No markdown. Just the JSON array.',
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

    const medicines = JSON.parse(arrayMatch[0]);
    return NextResponse.json({ medicines: Array.isArray(medicines) ? medicines : [] });
  } catch (err) {
    console.error('[extract-medicines]', err);
    return NextResponse.json({ medicines: [] });
  }
}
