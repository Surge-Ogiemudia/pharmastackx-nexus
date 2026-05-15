import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageBase64, mimeType = 'image/jpeg', options } = await req.json();
    if (!prompt || !imageBase64) {
      return NextResponse.json({ error: 'prompt and imageBase64 required' }, { status: 400 });
    }

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction: options?.systemPrompt,
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 800,
        temperature: options?.temperature ?? 0.7,
      },
    });

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType } },
    ]);
    const text = result.response.text().trim();
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
