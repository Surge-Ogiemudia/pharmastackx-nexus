import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const EXTRACT_PROMPT = `You are a pharmaceutical extraction AI for PharmaStackX.

Given a patient's search query, extract the medicines they need as structured data.

Handle all query types:
- Direct drug names: "amoxicillin 500mg" → extract directly
- Brand names: "Lonart", "Coartem" → use that name
- Condition-based: "something for malaria" → artemether-lumefantrine (first-line)
- Symptoms: "I have a fever and headache" → paracetamol
- Vague: "blood pressure medicine" → amlodipine (common first-line)

Use your pharmaceutical knowledge. Always return at least one medicine.

Return ONLY a valid JSON array. No markdown. No explanation.
[{"name": "string", "strength": "string or null", "form": "string or null", "quantity": number or null}]

Examples:
"I need something for malaria" → [{"name":"Artemether-Lumefantrine","strength":"80/480mg","form":"Tablet","quantity":null}]
"amoxicillin 500mg x10" → [{"name":"Amoxicillin","strength":"500mg","form":"Capsule","quantity":10}]
"Lonart DS" → [{"name":"Lonart DS","strength":"80/480mg","form":"Tablet","quantity":null}]
"something for high BP" → [{"name":"Amlodipine","strength":"5mg","form":"Tablet","quantity":null}]`;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
    });

    const result = await model.generateContent(
      `${EXTRACT_PROMPT}\n\nPatient query: "${query}"`
    );
    const raw = result.response.text().trim();

    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const medicines = JSON.parse(cleaned);

    if (!Array.isArray(medicines) || medicines.length === 0) {
      throw new Error('No medicines extracted');
    }

    return NextResponse.json({ medicines });
  } catch (err) {
    console.error('[extract-medicines]', err);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
