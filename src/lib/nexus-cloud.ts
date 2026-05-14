// Nexus Cloud — Google AI SDK wrapper for Gemma 4 cloud inference
// Model: gemma-4-26b-a4b-it (MoE, 4B active params, natively multimodal — text + vision)

import { GoogleGenerativeAI } from '@google/generative-ai';
import { nexusLogger } from './nexus-logger';

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!genAI) {
    const key = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    genAI = new GoogleGenerativeAI(key);
  }
  return genAI;
}

export interface CloudInferOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

// 60s per attempt — the thinking model takes 12-45s depending on question complexity.
// Cutting off too early causes the server-side request to keep running, then a second
// request stacks up and gets a 500. 60s covers even the heaviest queries.
const GEMMA_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('request timed out')), ms)
    ),
  ]);
}

function buildGemma4Model(options?: CloudInferOptions) {
  return getClient().getGenerativeModel({
    model: 'gemma-4-26b-a4b-it',
    systemInstruction: options?.systemPrompt,
    generationConfig: {
      maxOutputTokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.7,
    },
  });
}

// Tries Gemma 4 up to maxAttempts times. Returns the text on success, null if all attempts fail.
async function tryGemma4(generateFn: () => Promise<string>, maxAttempts = 2): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(generateFn(), GEMMA_TIMEOUT_MS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      nexusLogger.emit('ERROR', `☁️ Cloud error (attempt ${attempt}): ${msg.substring(0, 400)}`);
      const isRetryable = /\[5\d\d]/.test(msg);
      if (!isRetryable || attempt === maxAttempts) return null;
      nexusLogger.emit('SYSTEM', `⚠️ Gemma 4 server error — retrying (${attempt}/${maxAttempts})...`);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return null;
}

export async function cloudInfer(prompt: string, options?: CloudInferOptions): Promise<string> {
  const start = performance.now();

  // Primary path — Gemma 4
  const gemmaText = await tryGemma4(() =>
    buildGemma4Model(options).generateContent(prompt).then((r) => r.response.text().trim())
  );

  if (gemmaText !== null) {
    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('TOKEN', `Cloud: ${gemmaText.length} chars generated`, { count: gemmaText.split(/\s+/).length }, duration);
    return gemmaText;
  }

  throw new Error('Gemma 4 cloud unavailable');
}

export async function cloudVisionInfer(
  prompt: string,
  imageBase64: string,
  mimeType: string = 'image/jpeg',
  options?: CloudInferOptions
): Promise<string> {
  const start = performance.now();
  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const parts = [prompt, { inlineData: { data: base64Data, mimeType } }] as const;

  // Primary path — Gemma 4 Vision
  const gemmaText = await tryGemma4(() =>
    buildGemma4Model(options).generateContent([...parts]).then((r) => r.response.text().trim())
  );

  if (gemmaText !== null) {
    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('TOKEN', `Cloud Vision: ${gemmaText.length} chars generated`, { count: gemmaText.split(/\s+/).length }, duration);
    return gemmaText;
  }

  throw new Error('Gemma 4 cloud unavailable');
}
