// Nexus Cloud — client-side proxy for Gemma 4 cloud inference.
// The Google AI SDK and API key live server-side only (/api/infer, /api/vision-infer).

import { nexusLogger } from './nexus-logger';

export interface CloudInferOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

// 60s — the thinking model takes 12-45s per query; 60s covers even heavy ones.
const GEMMA_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('request timed out')), ms)
    ),
  ]);
}

async function postInfer(url: string, body: object): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`[${res.status}] ${err.error ?? res.statusText}`);
  }
  const data = await res.json();
  if (!data.text) throw new Error('Empty response from inference API');
  return data.text;
}

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

  const gemmaText = await tryGemma4(() => postInfer('/api/infer', { prompt, options }));

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

  const gemmaText = await tryGemma4(() =>
    postInfer('/api/vision-infer', { prompt, imageBase64, mimeType, options })
  );

  if (gemmaText !== null) {
    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('TOKEN', `Cloud Vision: ${gemmaText.length} chars generated`, { count: gemmaText.split(/\s+/).length }, duration);
    return gemmaText;
  }

  throw new Error('Gemma 4 cloud unavailable');
}
