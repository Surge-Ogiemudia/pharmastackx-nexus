import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const EXTRACT_PROMPT = `You are a pharmaceutical extraction AI for PharmaStackX.

Given a patient's search query, extract ONLY the medicines they want to obtain.
Ignore location info, greetings, and context — focus only on medicine names.

Handle all query types:
- Direct drug names: "amoxicillin 500mg" → extract directly
- Brand names: "Tylenol", "Panadol", "Lonart", "Coartem" → use that name
- Condition-based: "something for malaria" → artemether-lumefantrine (first-line)
- Symptoms: "I have a fever" → paracetamol
- Mixed with location: "I need Tylenol, I'm in Lagos" → extract only Tylenol
- Vague: "blood pressure medicine" → amlodipine (common first-line)

Return ONLY a valid JSON array. No markdown. No explanation.
[{"name": "string", "strength": "string or null", "form": "string or null", "quantity": number or null}]

Examples:
"I need Tylenol, I'm located in Edo state" → [{"name":"Tylenol","strength":null,"form":null,"quantity":null}]
"I need something for malaria" → [{"name":"Artemether-Lumefantrine","strength":"80/480mg","form":"Tablet","quantity":null}]
"amoxicillin 500mg x10" → [{"name":"Amoxicillin","strength":"500mg","form":"Capsule","quantity":10}]
"Lonart DS please" → [{"name":"Lonart DS","strength":"80/480mg","form":"Tablet","quantity":null}]
"something for high BP" → [{"name":"Amlodipine","strength":"5mg","form":"Tablet","quantity":null}]
"looking for augmentin" → [{"name":"Augmentin","strength":null,"form":null,"quantity":null}]`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    });

    const result = await model.generateContent(
      `${EXTRACT_PROMPT}\n\nPatient query: "${query}"`
    );
    const raw = result.response.text().trim();
    console.log('[extract-medicines] raw:', raw.substring(0, 200));

    // Find the first JSON array anywhere in the response
    const arrayMatch = raw.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) {
      console.error('[extract-medicines] no JSON array found in:', raw);
      return NextResponse.json({ medicines: [] });
    }

    const medicines = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(medicines) || medicines.length === 0) {
      return NextResponse.json({ medicines: [] });
    }

    return NextResponse.json({ medicines });
  } catch (err) {
    console.error('[extract-medicines]', err);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
