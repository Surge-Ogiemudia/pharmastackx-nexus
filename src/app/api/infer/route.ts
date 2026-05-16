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

  // Strip thinking tags and common reasoning preambles
  let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  text = text.replace(/\blet me (think|reconsider|check|verify)\b[\s\S]*?\n/gi, '');
  text = text.replace(/\b(i need to|first let's)\b[\s\S]*?\n/gi, '');

  // Remove lines that are echoed system instructions
  text = text.split('\n')
    .filter(line => !INSTRUCTION_SIGNALS.some(sig => line.toLowerCase().includes(sig.toLowerCase())))
    .join('\n');

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
    const text = clean(result.response.text().trim());
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
