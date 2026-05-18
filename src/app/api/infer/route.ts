import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const INSTRUCTION_SIGNALS = [
  'Do not show reasoning', 'Never show reasoning', 'thinking steps', 'internal monologue',
  'Never echo', 'FORMAT —', 'GUARDRAILS', 'non-negotiable', 'NEVER say',
  'consult a doctor', 'seek professional advice', 'Direct and confident', 'TONE:',
  'Final Answer:', 'Final check', 'Quick check', '* Role:', '* Constraints:', '* User:', '* Self-Correction:',
  '* Option 1:', '* Option 2:', 'Max 3 sentences?', 'Start immediately?',
  // Model sometimes echoes system rules as self-check questions
  'direct answer in', '1-3 sentences', 'sign-offs', 'no greetings', 'no disclaimer',
  // Meta-labels and self-checks the model echoes
  'Clinical accuracy', 'voice language', 'Language:',
];

// Line-start patterns that signal the model is narrating its own reasoning, not answering
const REASONING_STARTS = [
  "let's ", "i'll ", "let me ", "i will ", "i should ", "going with", "i'm going",
  "so the answer", "so my answer", "the answer is", "my answer",
  "wait,", "actually,",
];

function clean(raw: string): string {
  // Use <response> tags if model provided them
  const tagged = raw.match(/<response>([\s\S]*?)(?:<\/response>|$)/i);
  if (tagged?.[1]?.trim()) return tagged[1].trim();

  // Strip <thinking> blocks
  let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');

  // Strip inline parenthetical self-corrections e.g. "(Wait, let's make it more concise...)"
  text = text.replace(/\([^)]*(?:wait|let me|let's|i should|i'll|actually|concise|revis|rephras)[^)]*\)/gi, '').trim();

  // Filter out reasoning lines — bullets, echoed instructions, or model self-commentary.
  text = text.split('\n')
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith('*')) return false;
      const lower = t.toLowerCase();
      if (REASONING_STARTS.some(p => lower.startsWith(p))) return false;
      return !INSTRUCTION_SIGNALS.some(sig => lower.includes(sig.toLowerCase()));
    })
    .join('\n')
    .trim();

  // Strip quote characters the model uses to wrap its response (e.g. leading/trailing ")
  text = text.replace(/^["'"]+\s*/, '').replace(/\s*["'"]+$/, '');

  // Remove quotes immediately after sentence-end punctuation — they block the sentence splitter.
  // e.g. `combination."\nYes,` → `combination.\nYes,` so the duplicate is detected.
  text = text.replace(/([.!?])["'"]+(\s)/g, '$1$2').replace(/([.!?])["'"]+$/gm, '$1');

  // Take sentences until we hit a near-duplicate (model outputting a revised version of its answer).
  // Words >4 chars are the signal — filler words like "the", "and" are ignored.
  const sentences = text.split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/^["'"]+\s*/, '').trim())
    .filter(s => s.length > 10)
    .filter(s => {
      // Sentence-level pass of the same filters (catches leaked prefixes like "Clinical accuracy? Language: Hausa.")
      const lower = s.toLowerCase();
      if (REASONING_STARTS.some(p => lower.startsWith(p))) return false;
      return !INSTRUCTION_SIGNALS.some(sig => lower.includes(sig.toLowerCase()));
    });
  const result: string[] = [];
  const seenWords = new Set<string>();
  for (const s of sentences) {
    const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const overlap = result.length > 0
      ? words.filter(w => seenWords.has(w)).length / Math.max(words.length, 1)
      : 0;
    if (overlap > 0.5) break; // >50% word overlap = the model is repeating itself — stop
    words.forEach(w => seenWords.add(w));
    result.push(s);
    if (result.length >= 3) break;
  }
  return result.join(' ').trim();
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
