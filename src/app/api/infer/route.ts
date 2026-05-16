import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const INSTRUCTION_SIGNALS = [
  'Do not show reasoning', 'Never show reasoning', 'thinking steps', 'internal monologue',
  'Never echo', 'FORMAT —', 'GUARDRAILS', 'non-negotiable', 'NEVER say',
  'consult a doctor', 'seek professional advice', 'Direct and confident', 'TONE:',
  'Final Answer:', '* Role:', '* Constraints:', '* User:', '* Self-Correction:',
  '* Option 1:', '* Option 2:', 'Max 3 sentences?', 'Start immediately?',
];

function clean(raw: string): string {
  // Use <response> tags if model provided them
  const tagged = raw.match(/<response>([\s\S]*?)(?:<\/response>|$)/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();

  // Strip <thinking> blocks
  let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Filter out reasoning lines — any line that starts with * (model analysis/bullets)
  // or that echoes system instructions. Pharmacist answers are always prose, never bullets.
  text = text.split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('*')) return false;
      return !INSTRUCTION_SIGNALS.some(sig => t.toLowerCase().includes(sig.toLowerCase()));
    })
    .join('\n')
    .trim();

  // Cap at 3 sentences
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  return (sentences.length > 3 ? sentences.slice(0, 3).join(' ') : text).trim();
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, options } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction: options?.systemPrompt,
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 800,
        temperature: options?.temperature ?? 0.7,
      },
    });

    const result = await model.generateContent(prompt);
    let text = clean(result.response.text().trim());

    // Model sometimes outputs only bullet reasoning with no prose answer.
    // Retry once with an explicit no-bullets instruction.
    if (!text || text.length < 10) {
      const retry = await model.generateContent(
        `Answer in 1-3 plain sentences only. No bullet points, no asterisks, no reasoning. Just the pharmacist answer.\n\n${prompt}`
      );
      text = clean(retry.response.text().trim());
    }

    return NextResponse.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
