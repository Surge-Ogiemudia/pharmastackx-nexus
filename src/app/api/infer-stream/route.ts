import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Signals that the model has left the answer and started reasoning/thinking.
// Any of these in the accumulated stream = stop sending immediately.
const THINK_MARKERS = [
  '\n*',         // asterisk on its own line (line-start thinking block)
  '*Wait',       // *Wait, the prompt says... (most common pattern)
  '*Final',      // *Final check of the 3 sentences:
  '*Let ',       // *Let me reconsider
  '*Actually',   // *Actually, I should...
  "*I'll",       // *I'll make it more direct
  '*Hmm',        // *Hmm,
  '*The prompt', // *The prompt says...
  '*Note',       // *Note that
  '*   ',        // *   User: / *   Role: (system prompt echo bullets)
];

function firstThinkingIndex(text: string): number {
  let earliest = -1;
  for (const marker of THINK_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx;
  }
  return earliest;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, options } = await req.json();
    if (!prompt) return new Response('prompt required', { status: 400 });

    const model = genAI.getGenerativeModel({
      model: 'gemma-4-26b-a4b-it',
      systemInstruction: options?.systemPrompt,
      generationConfig: {
        maxOutputTokens: options?.maxTokens ?? 150,
        temperature: options?.temperature ?? 0.4,
      },
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await model.generateContentStream(prompt);

          let accumulated = '';
          let sentUpTo = 0; // how many chars of accumulated have been sent to client

          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (!text) continue;

            accumulated += text;

            const thinkIdx = firstThinkingIndex(accumulated);

            if (thinkIdx >= 0) {
              // Thinking detected — flush only the clean portion before it
              const cleanPart = accumulated.substring(sentUpTo, thinkIdx).trimEnd();
              // Trim to the last complete sentence so we don't end mid-word
              const lastPunct = Math.max(
                cleanPart.lastIndexOf('.'),
                cleanPart.lastIndexOf('!'),
                cleanPart.lastIndexOf('?')
              );
              const toSend = lastPunct >= 0 ? cleanPart.substring(0, lastPunct + 1) : cleanPart;
              if (toSend) controller.enqueue(encoder.encode(toSend));
              return; // stop — no thinking reaches the client
            }

            // No thinking yet.
            // Hold if accumulated ends with the start of a potential marker
            // (marker could span two chunks — e.g. chunk ends with "*W", next starts with "ait,")
            const mightContinue = accumulated.endsWith('*') || accumulated.endsWith('\n');
            if (!mightContinue) {
              const toSend = accumulated.substring(sentUpTo);
              if (toSend) {
                controller.enqueue(encoder.encode(toSend));
                sentUpTo = accumulated.length;
              }
            }
          }

          // Stream ended normally — flush any held content
          if (sentUpTo < accumulated.length) {
            const remaining = accumulated.substring(sentUpTo);
            if (remaining.trim()) controller.enqueue(encoder.encode(remaining));
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(msg, { status: 500 });
  }
}
