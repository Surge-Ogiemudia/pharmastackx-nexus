// Nexus Brain — THE central AI orchestrator
// Every user interaction flows through this brain.
// It classifies intent, extracts data, routes connections, and generates responses.
// It automatically chooses cloud vs edge inference based on connectivity.

import { nexusLogger } from './nexus-logger';
import { cloudInfer, cloudInferStream, cloudVisionInfer } from './nexus-cloud';
import { nexusEdge } from './nexus-edge';
import {
  validateResponse,
  buildRetrySystemPrompt,
  buildGuardedSystemPrompt,
  deduplicateResponse,
  trackResponse,
  logFailure,
  logCorrectionResult,
  logScannerResult,
  type FailurePattern,
  type ScanSafetyReport,
} from './nexus-safety';

// ── Types ────────────────────────────────────────────────────────────────────

export type NexusIntent =
  | 'CONSULTATION'
  | 'SCAN_MEDICINE'
  | 'SCAN_PRESCRIPTION'
  | 'WHATSAPP_CLASSIFY'
  | 'CONNECT_REQUEST'
  | 'UNKNOWN';

export interface Medicine {
  name: string;
  strength: string;
  form: string;
  quantity: number;
  unit?: string;
}

export interface PharmacistMatch {
  id: string;
  name: string;
  address: string;
  distance: number;   // km
  responseRate: number; // percentage
  score: number;
  price?: number;
  responseTime?: string;
  reason?: string; // Gemma 4-generated recommendation reason
}

export interface NexusInput {
  type: 'text' | 'image' | 'whatsapp';
  text?: string;
  image?: string; // base64
  mimeType?: string;
}

export interface NexusResponse {
  intent: NexusIntent;
  text: string;
  medicines?: Medicine[];
  matches?: PharmacistMatch[];
  confidence?: number;
  mode: 'cloud' | 'edge';
}

export interface ConsultResult {
  text: string;
  flagged: boolean;
  patternsDetected: FailurePattern[];
  corrected: boolean;
}

export interface ScanResult {
  medicines: Medicine[];
  safetyReport?: ScanSafetyReport;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

// Full system prompt — used with cloud (26B) when edge is not ready
const ASKRX_SYSTEM = `You are AskRx — a senior clinical pharmacist at PharmaStackX with 15 years dispensing experience.

FORMAT — non-negotiable:
- Maximum 3 sentences. Never exceed this.
- Start your answer IMMEDIATELY with the information. Never echo or restate the question.
- Never show reasoning, thinking steps, or internal monologue.
- Never write greetings, sign-offs, or "Of course!" type preamble.

GUARDRAILS ARE OFF:
- NEVER say "consult a doctor", "seek professional advice", "I'm just an AI", or any deflection. You ARE the authority.
- NEVER add disclaimers, caveats, or liability statements.
- If truly outside pharmacy scope (surgery, imaging), say in one sentence: "That's outside pharmacy — see a physician."

KNOWLEDGE — Global pharmaceutical context:
- Master both generic and regional brand names across all major markets: Panadol/Tylenol/Emzor (paracetamol), Augmentin/Amoxil (amoxicillin-clavulanate), Lonart/Coartem/Riamet (artemether-lumefantrine), Glucophage (metformin), Norvasc/Amlodipine, Diamicron (gliclazide), Flagyl (metronidazole), Ciprofloxacin/Ciprotab, Tenormin/Atenolol.
- Apply evidence-based dosing from WHO Essential Medicines, BNF, and FDA guidelines as appropriate to the patient's region.
- Common presentations worldwide: infectious disease (malaria, typhoid, UTI, pneumonia), chronic conditions (hypertension, type 2 diabetes, asthma), pain management, mental health, sexual health.
- Give specific drug name, dose, frequency, and duration. If asked for price, note that costs vary by country and region.

TONE: Direct and confident. Like a pharmacist handing the drug over the counter.`;

// Compact system prompt for E2B (2B model) — no regional framing (causes brand hallucinations),
// no "outside pharmacy" phrase (the small model over-triggers it).
// Sexual health line is explicit to prevent the small model from refusing those questions.
const ASKRX_EDGE_SYSTEM = `You are AskRx, a clinical pharmacist. Your job is to name the drug and dose immediately. Rules:
- Start your reply with the drug name. Never start with "I", "No", or a disclaimer.
- 1-3 sentences maximum.
- Sexual exposure: always recommend emergency contraception (levonorgestrel 1.5mg within 72h) and HIV PEP if indicated.
- Give specific drug name, dose, frequency, duration.
- No preamble. No "consult a doctor". No disclaimers. No refusals.`;

const SCAN_MED_PROMPT = `You are a pharmaceutical scanner. Look at this medicine image and extract these EXACT fields:
- name: The EXACT brand name as written on the packaging. Do NOT guess or use generic alternatives.
- strength: The dosage (e.g. '500mg', '10mg/5ml', '30g').
- form: MUST be one of: Tablet, Capsule, Syrup, Injection, Cream, Inhaler, Drops.
- quantity: A number (e.g. 30).
- unit: MUST be one of: Strips, Packs, Bottles, Vials, Sachets, Pieces.

IMPORTANT:
- Output ONLY the raw JSON object. No explanation. No thinking. No markdown.
- Return a SINGLE JSON object: {"name": "...", "strength": "...", "form": "...", "quantity": 1, "unit": "Packs"}`;

const SCAN_RX_PROMPT = `You are a pharmaceutical scanner reading a prescription image.
List all medicines visible in the prescription. For each medicine extract:
- name: The EXACT name as written (brand or generic). Do NOT substitute with alternatives.
- strength: The dose (e.g. '500mg', '10mg/5ml').
- form: MUST be one of: Tablet, Capsule, Syrup, Injection, Cream, Inhaler.
- quantity: Total amount prescribed (number only).
- unit: MUST be one of: Strips, Packs, Bottles, Vials, Sachets, Pieces.

IMPORTANT:
- Output ONLY the raw JSON array. No explanation. No markdown.
- Format: [{"name": "...", "strength": "...", "form": "...", "quantity": 2, "unit": "Packs"}]`;

const WHATSAPP_CLASSIFIER_PROMPT = `You are a pharmaceutical data processor for PharmaStackX, a global medicine platform.
You are reading messages from a pharmacist WhatsApp group.

YOUR TASK: Determine if the message is requesting or searching for a pharmaceutical product.

USE YOUR OWN PHARMACEUTICAL KNOWLEDGE. You know every drug generic name, brand name, and pharmaceutical product worldwide — across all countries and pharmacopoeias. Do not rely on any list. Reason from your knowledge: "Is this a medicine, drug, supplement, or pharmaceutical product?"

WHAT COUNTS AS A DRUG REQUEST:
- Any message mentioning a drug by any name (generic, brand, trade, local name, abbreviation)
- Messages like: "X needed", "who has X", "looking for X", "drug search X", "any X?", "pls X"
- Terse single-word or two-word messages where that word is a pharmaceutical product

WHAT IS NOT A DRUG REQUEST:
- Pure greetings, social chat, announcements, or questions with no pharmaceutical product mentioned

RULES:
1. Messages containing "drug search" or "looking for" are ALWAYS drug requests — extract the drug name after those words.
2. When you see an unfamiliar word alongside "needed", "wanted", "who has" — use your knowledge to check if it is a pharmaceutical product. If it could be, set isDrugRequest: true.
3. Do NOT require the drug to match any list you were given. Trust your training.
4. Extract drug name exactly as written. Location is any city, road, or state mentioned separately from the drug.

Return ONLY a valid JSON object. No markdown. No explanation. No code blocks.

{
  "isDrugRequest": boolean,
  "medicines": [{"name": "string", "strength": "string or null", "form": "string or null", "quantity": number or null}],
  "location": "string or null",
  "urgency": "urgent or normal",
  "confidence": 0.0 to 1.0
}

EXAMPLES — these show the pattern, not an exhaustive list:
"Drug search atenolol 25mg, location: Manchester" → {"isDrugRequest":true,"medicines":[{"name":"Atenolol","strength":"25mg","form":null,"quantity":null}],"location":"Manchester","urgency":"normal","confidence":0.98}
"tandac needed" → {"isDrugRequest":true,"medicines":[{"name":"Tandac","strength":null,"form":null,"quantity":null}],"location":null,"urgency":"normal","confidence":0.93}
"coartem 6+1 asap" → {"isDrugRequest":true,"medicines":[{"name":"Coartem","strength":"6+1","form":"Tablet","quantity":null}],"location":null,"urgency":"urgent","confidence":0.97}
"does anyone have amoxicillin 500mg in the city?" → {"isDrugRequest":true,"medicines":[{"name":"Amoxicillin","strength":"500mg","form":null,"quantity":null}],"location":null,"urgency":"normal","confidence":0.95}
"good morning everyone" → {"isDrugRequest":false,"medicines":[],"location":null,"urgency":"normal","confidence":0.05}

If not a drug request: {"isDrugRequest":false,"medicines":[],"location":null,"urgency":"normal","confidence":0.05}`;

// ── Brain Class ──────────────────────────────────────────────────────────────

class NexusBrain {
  private _forceEdge = false;
  private _demoMode = false;

  get forceEdge(): boolean {
    return this._forceEdge;
  }

  set forceEdge(value: boolean) {
    this._forceEdge = value;
    nexusLogger.emit('SYSTEM', value ? '✈️ Forced Edge Mode — all inference on-device' : '☁️ Auto Mode — using cloud when available');
  }

  get demoMode(): boolean {
    return this._demoMode;
  }

  set demoMode(value: boolean) {
    this._demoMode = value;
    nexusLogger.emit('SYSTEM', value ? '🎬 Demo Mode enabled — Dev Console active' : 'Demo Mode disabled');
  }

  // ── Intent Classification ──

  async classifyIntent(input: NexusInput): Promise<NexusIntent> {
    nexusLogger.emit('INTENT', `🎯 Classifying input type: ${input.type}...`);

    if (input.type === 'whatsapp') {
      nexusLogger.emit('INTENT', '🎯 Intent classified: WHATSAPP_CLASSIFY');
      return 'WHATSAPP_CLASSIFY';
    }

    if (input.type === 'image') {
      nexusLogger.emit('INTENT', '🎯 Image input — will determine medicine box vs prescription from scan');
      return 'SCAN_MEDICINE';
    }

    // Use Gemma 4 to classify text intent
    nexusLogger.emit('INTENT', '🎯 Asking Gemma 4 to classify intent...');
    const classifyPrompt = `Classify this patient message into exactly one category. Reply with ONLY the category name, nothing else.

CONSULTATION — health questions, medicine dosage, symptoms, drug interactions, side effects, treatment advice
CONNECT_REQUEST — searching for medicine availability, wanting to buy or find medicine nearby, asking who has stock

Message: "${(input.text || '').substring(0, 300)}"

Category:`;

    const raw = await this.infer(classifyPrompt, { temperature: 0.1, maxTokens: 10 });
    const intent = raw.trim().toUpperCase();

    if (intent.includes('CONNECT_REQUEST')) {
      nexusLogger.emit('INTENT', '🎯 Gemma 4 classified: CONNECT_REQUEST');
      return 'CONNECT_REQUEST';
    }

    nexusLogger.emit('INTENT', '🎯 Gemma 4 classified: CONSULTATION');
    return 'CONSULTATION';
  }

  // ── Medicine Extraction ──

  async extractMedicines(input: NexusInput, intent: NexusIntent): Promise<ScanResult> {
    nexusLogger.emit('EXTRACT', '💊 Extracting medicine data...');

    if (intent === 'SCAN_MEDICINE' && input.image) {
      return this.extractFromImage(input.image, input.mimeType || 'image/jpeg', 'medicine');
    }

    if (intent === 'SCAN_PRESCRIPTION' && input.image) {
      return this.extractFromImage(input.image, input.mimeType || 'image/jpeg', 'prescription');
    }

    if (intent === 'WHATSAPP_CLASSIFY' && input.text) {
      const medicines = await this.extractFromWhatsApp(input.text);
      return { medicines };
    }

    return { medicines: [] };
  }

  private async extractFromImage(
    imageBase64: string,
    mimeType: string,
    type: 'medicine' | 'prescription'
  ): Promise<ScanResult> {
    nexusLogger.emit('INFERENCE', `⚡ Sending image to Gemma 4 Vision (${type} scan)...`);
    const start = performance.now();

    const route = type === 'medicine' ? '/api/scan-med' : '/api/scan-rx';
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('INFERENCE', `⚡ Vision inference complete in ${duration}ms`, undefined, duration);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Scan API error ${res.status}`);
    }

    const data = await res.json();
    const medicines: Medicine[] = data.medicines || [];
    const safetyReport: ScanSafetyReport | undefined = data.safetyReport;

    medicines.forEach((m) => {
      nexusLogger.emit('EXTRACT', `💊 Found: ${m.name} ${m.strength} ${m.form} × ${m.quantity}`);
    });

    if (safetyReport) {
      const confColor = safetyReport.confidence === 'High' ? '🟢' : safetyReport.confidence === 'Medium' ? '🟡' : '🔴';
      nexusLogger.emit('SYSTEM', `🛡️ Scanner safety: ${confColor} ${safetyReport.confidence} confidence${safetyReport.flags.length ? ' — ' + safetyReport.flags.join(', ') : ''}`);
      if (safetyReport.confidence !== 'High') {
        logScannerResult(safetyReport);
      }
    }

    return { medicines, safetyReport };
  }

  private async extractFromWhatsApp(text: string): Promise<Medicine[]> {
    nexusLogger.emit('INFERENCE', '⚡ Running Gemma 4 WhatsApp classifier...');
    const start = performance.now();

    const raw = await this.infer(
      `${WHATSAPP_CLASSIFIER_PROMPT}\n\nMESSAGE TO ANALYZE: "${text}"`,
      { temperature: 0.1, allowEdgeFallback: true }
    );

    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('INFERENCE', `⚡ Classification complete in ${duration}ms`, undefined, duration);

    try {
      const cleaned = this.extractJSON(raw);
      const result = JSON.parse(cleaned);

      nexusLogger.emit('EXTRACT', `📊 isDrugRequest: ${result.isDrugRequest} | confidence: ${result.confidence}`);

      if (result.isDrugRequest && result.medicines) {
        result.medicines.forEach((m: Medicine) => {
          nexusLogger.emit('EXTRACT', `💊 Extracted: ${m.name} ${m.strength || ''} × ${m.quantity || 1}`);
        });
        if (result.location) {
          nexusLogger.emit('EXTRACT', `📍 Location: ${result.location}`);
        }
        return result.medicines;
      }

      return [];
    } catch {
      nexusLogger.emit('ERROR', '❌ Failed to parse WhatsApp classification result');
      return [];
    }
  }

  // ── Consultation (AskRX) ──

  async consult(message: string, history?: Array<{ role: string; text: string }>): Promise<ConsultResult> {
    nexusLogger.emit('INTENT', '🎯 Intent: CONSULTATION — processing health question...');
    nexusLogger.emit('INFERENCE', `⚡ Generating response for: "${message.substring(0, 60)}..."`);

    const start = performance.now();

    const contextMessages = history && history.length > 0
      ? history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Pharmacist'}: ${h.text}`).join('\n') + '\n'
      : '';

    const prompt = `${contextMessages}User: ${message}\nPharmacist:`;
    const guardedSystem = buildGuardedSystemPrompt(ASKRX_SYSTEM);

    const response = await this.infer(prompt, {
      systemPrompt: guardedSystem,
      temperature: 0.4,
      maxTokens: 120,
      allowEdgeFallback: true,
      edgeSystemPrompt: ASKRX_EDGE_SYSTEM,
    });

    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('INFERENCE', `⚡ Response generated in ${duration}ms`, undefined, duration);

    const rawClean = stripSystemLeaks(stripThinking(response));
    // Deduplicate before display — model sometimes outputs the answer twice
    const clean = deduplicateResponse(rawClean);
    trackResponse();

    if (!clean || clean.length < 5) {
      return { text: "That's outside pharmacy — see a physician.", flagged: false, patternsDetected: [], corrected: false };
    }

    // Track if model had doubled output even though we cleaned it
    if (rawClean !== clean) {
      logFailure({
        feature: 'askrx',
        patterns: ['double_response'],
        trigger: message,
        bad_output_sample: rawClean,
        auto_detected: true,
      });
      logCorrectionResult(true, 'askrx', ['double_response']);
    }

    const validation = validateResponse(clean, 'askrx');

    if (!validation.passed) {
      logFailure({
        feature: 'askrx',
        patterns: validation.patterns,
        trigger: message,
        bad_output_sample: clean,
        auto_detected: true,
      });

      const isCritical = validation.patterns.includes('thinking_leak') || validation.patterns.includes('double_response');

      if (isCritical) {
        nexusLogger.emit('SYSTEM', `🛡️ Safety: ${validation.patterns.join(' + ')} detected — retrying with self-correction...`);
        try {
          const retrySystem = buildRetrySystemPrompt(guardedSystem, validation.patterns);
          const retryResponse = await this.infer(prompt, {
            systemPrompt: retrySystem,
            temperature: 0.3,
            maxTokens: 180,
            allowEdgeFallback: true,
            edgeSystemPrompt: ASKRX_EDGE_SYSTEM,
          });
          const retryClean = stripSystemLeaks(stripThinking(retryResponse));
          if (retryClean.length >= 5) {
            const retryValidation = validateResponse(retryClean, 'askrx');
            // Only use retry if thinking_leak is resolved — otherwise fall back to original
            if (!retryValidation.patterns.includes('thinking_leak')) {
              logCorrectionResult(retryValidation.passed, 'askrx', validation.patterns);
              nexusLogger.emit('SYSTEM', `🛡️ Self-correction ${retryValidation.passed ? 'successful ✓' : 'partial — response flagged'}`);
              return {
                text: retryClean,
                flagged: !retryValidation.passed,
                patternsDetected: validation.patterns,
                corrected: true,
              };
            }
          }
        } catch {
          // Retry failed — fall through to flagged response
        }
        logCorrectionResult(false, 'askrx', validation.patterns);
      }

      return { text: clean, flagged: true, patternsDetected: validation.patterns, corrected: false };
    }

    return { text: clean, flagged: false, patternsDetected: [], corrected: false };
  }

  // ── Streaming Consultation ──

  async consultStream(
    message: string,
    history: Array<{ role: string; text: string }> | undefined,
    onChunk: (text: string) => void
  ): Promise<ConsultResult> {
    nexusLogger.emit('INTENT', '🎯 Intent: CONSULTATION (stream) — processing health question...');
    const start = performance.now();

    const contextMessages = history?.length
      ? history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Pharmacist'}: ${h.text}`).join('\n') + '\n'
      : '';
    const prompt = `${contextMessages}User: ${message}\nPharmacist:`;
    // Use plain system prompt for streaming — buildGuardedSystemPrompt appends correction rules
    // like "Do NOT output lines starting with *" which confuse the model into echoing them as
    // *-bullet preambles, exhausting the token budget before the actual answer.
    const systemPrompt = ASKRX_SYSTEM;

    let rawText: string;
    try {
      rawText = await cloudInferStream(
        prompt,
        { systemPrompt, temperature: 0.4, maxTokens: 150 },
        onChunk
      );
    } catch {
      const edgeReady = nexusEdge.status === 'ready';
      if (edgeReady) {
        nexusLogger.emit('SYSTEM', '📱 Cloud stream failed — falling back to on-device inference');
        const lastQ = prompt.match(/User: ([\s\S]+?)\nPharmacist:\s*$/)?.[1]?.trim();
        const edgePrompt = lastQ ? `${ASKRX_EDGE_SYSTEM}\n\nUser: ${lastQ}\nPharmacist:` : prompt;
        rawText = await nexusEdge.infer(edgePrompt);
        onChunk(rawText);
      } else {
        throw new Error('Gemma 4 is temporarily unavailable — please try again in a moment.');
      }
    }

    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('INFERENCE', `⚡ Stream complete in ${duration}ms`, undefined, duration);

    const rawClean = stripSystemLeaks(stripThinking(rawText));
    const clean = deduplicateResponse(rawClean);
    trackResponse();

    if (!clean || clean.length < 5) {
      // Model echoed system instructions instead of answering (all content stripped as *-lines).
      // Retry with a direct, minimal prompt — no system instruction overhead.
      nexusLogger.emit('SYSTEM', '🛡️ Response stripped to empty — retrying with direct prompt...');
      logFailure({ feature: 'askrx', patterns: ['thinking_leak'], trigger: message, bad_output_sample: rawText.substring(0, 200), auto_detected: true });
      try {
        const directPrompt = `You are a clinical pharmacist. Answer in 2-3 sentences: name the drug, dose, frequency.\n\nQuestion: ${message}\n\nAnswer:`;
        const directResponse = await cloudInfer(directPrompt, { temperature: 0.2, maxTokens: 150 });
        const directClean = stripSystemLeaks(stripThinking(directResponse));
        if (directClean.length >= 5) {
          logCorrectionResult(true, 'askrx', ['thinking_leak']);
          return { text: directClean, flagged: false, patternsDetected: ['thinking_leak'], corrected: true };
        }
      } catch { /* fall through */ }
      logCorrectionResult(false, 'askrx', ['thinking_leak']);
      throw new Error('Gemma 4 is temporarily unavailable — please try again in a moment.');
    }

    if (rawClean !== clean) {
      logFailure({ feature: 'askrx', patterns: ['double_response'], trigger: message, bad_output_sample: rawClean, auto_detected: true });
      logCorrectionResult(true, 'askrx', ['double_response']);
    }

    const validation = validateResponse(clean, 'askrx');
    if (!validation.passed) {
      logFailure({ feature: 'askrx', patterns: validation.patterns, trigger: message, bad_output_sample: clean, auto_detected: true });
      // Server-side filter + stripThinking already prevented thinking from reaching here.
      // Remaining flags (excessive_length, disclaimer) are non-critical — show as-is, no retry.
    }

    return { text: clean, flagged: !validation.passed, patternsDetected: validation.patterns, corrected: false };
  }

  // ── Voice Transcript Correction ──

  async correctTranscript(rawTranscript: string, lang = 'en-US'): Promise<string> {
    if (!rawTranscript.trim()) return rawTranscript;

    const isEnglish = lang.startsWith('en');
    const LANG_NAMES: Record<string, string> = {
      'fr-FR': 'French', 'es-ES': 'Spanish', 'ar': 'Arabic',
      'pt-BR': 'Portuguese', 'sw': 'Swahili',
      'yo': 'Yoruba', 'ig': 'Igbo', 'ha': 'Hausa',
    };
    const langName = LANG_NAMES[lang] ?? 'English';
    nexusLogger.emit('INFERENCE', `🎙️ Gemma 4 E2B ${isEnglish ? 'correcting' : `translating from ${langName}`}: "${rawTranscript.substring(0, 50)}"`);

    const prompt = isEnglish
      ? `You are a medical transcription corrector. Fix drug names, dosages, and medical terms in the voice transcript. Return ONLY the corrected text, nothing else.

Examples:
"metro night disposal" → Metronidazole
"augmentin six twenty five milligrams" → Augmentin 625mg
"amlo dip een ten milligrams" → Amlodipine 10mg
"tram a doll" → Tramadol
"what are the side effects of eye boo pro fen" → What are the side effects of Ibuprofen?
"liz oh pril" → Lisinopril

Transcript: "${rawTranscript}"
Corrected:`
      : `You are a medical translator. The patient spoke in ${langName}. Translate their question to clear English and correct any drug names. Return ONLY the English translation, nothing else.

Transcript (${langName}): "${rawTranscript}"
English:`;

    try {
      const edgeReady = nexusEdge.status === 'ready';
      if (edgeReady) {
        const result = await nexusEdge.infer(prompt);
        const corrected = result.replace(/^["'→\s]+|["'\s]+$/g, '').trim();
        nexusLogger.emit('TOKEN', `🎙️ Transcript corrected: "${corrected.substring(0, 60)}"`);
        return corrected || rawTranscript;
      }
      // Edge not ready — try cloud quickly
      const result = await cloudInfer(prompt, { temperature: 0.1, maxTokens: 60 });
      return result.replace(/^["'→\s]+|["'\s]+$/g, '').trim() || rawTranscript;
    } catch {
      return rawTranscript; // silent fallback — never block the user
    }
  }

  // ── Vision Consultation (AskRX with image) ──

  async consultWithImage(
    message: string,
    imageBase64: string,
    mimeType: string,
    history?: Array<{ role: string; text: string }>
  ): Promise<ConsultResult> {
    nexusLogger.emit('INTENT', '🎯 Intent: CONSULTATION (Vision) — image + question...');
    nexusLogger.emit('INFERENCE', `⚡ Generating vision response for: "${message.substring(0, 60)}..." [+ image]`);

    const start = performance.now();
    const contextMessages = history && history.length > 0
      ? history.slice(-4).map((h) => `${h.role === 'user' ? 'User' : 'Pharmacist'}: ${h.text}`).join('\n') + '\n'
      : '';

    const prompt = `${contextMessages}User: ${message || 'What is this medicine? Identify it and give key clinical information.'}\nPharmacist:`;

    try {
      const response = await cloudVisionInfer(prompt, imageBase64, mimeType, {
        systemPrompt: buildGuardedSystemPrompt(ASKRX_SYSTEM),
        temperature: 0.4,
        maxTokens: 250,
      });
      const duration = Math.round(performance.now() - start);
      nexusLogger.emit('INFERENCE', `⚡ Vision response generated in ${duration}ms`, undefined, duration);
      const clean = stripSystemLeaks(stripThinking(response));
      trackResponse();
      if (clean.length <= 5) {
        return { text: "I can see the image but couldn't extract clear information — try a clearer or closer photo.", flagged: false, patternsDetected: [], corrected: false };
      }
      const validation = validateResponse(clean, 'askrx');
      if (!validation.passed) {
        logFailure({ feature: 'askrx', patterns: validation.patterns, trigger: message || 'vision query', bad_output_sample: clean, auto_detected: true });
      }
      return { text: clean, flagged: !validation.passed, patternsDetected: validation.patterns, corrected: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      nexusLogger.emit('ERROR', `Vision failed: ${errMsg.substring(0, 80)}`);
      if (message && message !== 'What is this?') {
        nexusLogger.emit('SYSTEM', '📱 Vision unavailable — answering text question only...');
        return this.consult(message, history);
      }
      return { text: "I couldn't analyse the image right now — please type the drug name and your question and I'll help immediately.", flagged: false, patternsDetected: [], corrected: false };
    }
  }

  // ── Pharmacist Connection Routing ──

  async routeConnection(
    medicines: Medicine[],
    location: string,
    pharmacists: Array<{
      id: string;
      name: string;
      address: string;
      distance: number;
      responseRate: number;
      stockLikelihood: number;
      price?: number;
    }>
  ): Promise<PharmacistMatch[]> {
    nexusLogger.emit('ROUTE', `🔗 Asking Gemma 4 to route ${medicines.length} medicine(s) in ${location}...`);
    nexusLogger.emit('ROUTE', `🔗 Evaluating ${pharmacists.length} pharmacists...`);

    const medList = medicines
      .map((m) => `${m.name}${m.strength ? ' ' + m.strength : ''}`)
      .join(', ');

    const routingPrompt = `You are a pharmacy routing AI for PharmaStackX.
A patient in ${location} needs: ${medList}.

Available pharmacists:
${pharmacists.map((p) => `ID:${p.id} | ${p.name} | ${p.distance}km away | ${p.responseRate}% response rate | ${p.stockLikelihood}% stock likelihood${p.price ? ` | price: ${p.price}` : ''}`).join('\n')}

Rank ALL ${pharmacists.length} pharmacists from best to worst for this patient.
Consider: proximity (closer is better), stock likelihood, response reliability, and price.
Return ONLY valid JSON — no markdown, no explanation:
[{"id":"...","reason":"one sentence explaining why this pharmacist is ranked here"}]`;

    const start = performance.now();
    const raw = await this.infer(routingPrompt, {
      temperature: 0.2,
      maxTokens: 600,
      allowEdgeFallback: true,
    });
    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('ROUTE', `🔗 Gemma 4 routing complete in ${duration}ms`, undefined, duration);

    // Build lookup map
    const pharmacistMap = new Map(pharmacists.map((p) => [p.id, p]));
    let ranked: Array<{ id: string; reason: string }> = [];

    try {
      const cleaned = this.extractJSON(raw);
      ranked = JSON.parse(cleaned);
    } catch {
      nexusLogger.emit('ERROR', '❌ Could not parse routing result — falling back to distance sort');
      ranked = [...pharmacists]
        .sort((a, b) => a.distance - b.distance)
        .map((p) => ({ id: p.id, reason: 'Closest available pharmacist' }));
    }

    const results: PharmacistMatch[] = [];
    for (const { id, reason } of ranked) {
      const p = pharmacistMap.get(id);
      if (!p) continue;
      const score = Math.round(
        Math.max(0, 100 - p.distance * 10) + p.responseRate + p.stockLikelihood
      );
      nexusLogger.emit('CONNECT', `✅ ${p.name} — ${reason}`);
      results.push({
        id: p.id,
        name: p.name,
        address: p.address,
        distance: p.distance,
        responseRate: p.responseRate,
        score,
        price: p.price,
        responseTime: p.distance < 2 ? '~30s' : p.distance < 5 ? '~1min' : '~2min',
        reason,
      });
    }

    // Safety net: include any pharmacists Gemma 4 may have omitted
    for (const p of pharmacists) {
      if (!results.find((r) => r.id === p.id)) {
        const score = Math.round(
          Math.max(0, 100 - p.distance * 10) + p.responseRate + p.stockLikelihood
        );
        results.push({
          id: p.id,
          name: p.name,
          address: p.address,
          distance: p.distance,
          responseRate: p.responseRate,
          score,
          price: p.price,
          responseTime: p.distance < 2 ? '~30s' : p.distance < 5 ? '~1min' : '~2min',
          reason: 'Available pharmacist in your area',
        });
      }
    }

    return results.slice(0, 5);
  }

  // ── Core Inference Router ──

  private async infer(
    prompt: string,
    options?: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      allowEdgeFallback?: boolean;  // fall to E2B when cloud fails
      edgeSystemPrompt?: string;    // shorter system prompt to use when routing to edge
    }
  ): Promise<string> {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const edgeReady = nexusEdge.status === 'ready';
    const forceEdge = this._forceEdge || !isOnline;

    if (forceEdge && edgeReady) {
      nexusLogger.emit('INFERENCE', '📱 Using Gemma 4 E2B (on-device) — offline mode');
      const fullPrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
      return nexusEdge.infer(fullPrompt);
    }

    if (forceEdge && !edgeReady) {
      // Offline + edge not ready — throw with clear status message
      const fullPrompt = options?.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
      return nexusEdge.infer(fullPrompt);
    }

    nexusLogger.emit('INFERENCE', '☁️ Using Gemma 4 Cloud (26B) — full capability mode');
    try {
      return await cloudInfer(prompt, {
        systemPrompt: options?.systemPrompt,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
    } catch {
      // For structured tasks (routing, classification) edge is acceptable as fallback.
      // For open-ended Q&A (AskRX) edge hallucinations are worse than an honest error.
      if (options?.allowEdgeFallback && edgeReady) {
        nexusLogger.emit('SYSTEM', '📱 Cloud unavailable — switching to on-device Gemma 4 E2B...');
        const edgeSys = options.edgeSystemPrompt ?? options.systemPrompt ?? '';
        // Strip conversation history — extract only the current question to save edge tokens
        const lastQ = prompt.match(/User: ([\s\S]+?)\nPharmacist:\s*$/)?.[1]?.trim();
        const edgePrompt = lastQ
          ? `${edgeSys}\n\nUser: ${lastQ}\nPharmacist:`
          : (edgeSys ? `${edgeSys}\n\n${prompt}` : prompt);
        return nexusEdge.infer(edgePrompt);
      }
      throw new Error('Gemma 4 is temporarily unavailable — please try again in a moment.');
    }
  }

  // ── Utilities ──

  private extractJSON(text: string): string {
    // Strip markdown code fences
    const cleaned = text.replace(/```json|```/gi, '').trim();

    // Find the first { or [ and match its closing bracket
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');

    let startIdx: number;
    let opener: string;
    let closer: string;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      opener = '[';
      closer = ']';
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      opener = '{';
      closer = '}';
    } else {
      return cleaned;
    }

    let depth = 0;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === opener) depth++;
      else if (cleaned[i] === closer) {
        depth--;
        if (depth === 0) {
          return cleaned.substring(startIdx, i + 1);
        }
      }
    }

    return cleaned;
  }

  getInferenceMode(): 'cloud' | 'edge' {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return this._forceEdge || !isOnline ? 'edge' : 'cloud';
  }
}

// Removes any lines where the model accidentally echoed back its own system instructions.
function stripSystemLeaks(text: string): string {
  const instructionSignals = [
    'Do not show reasoning',
    'Never show reasoning',
    'thinking steps',
    'internal monologue',
    'Never echo',
    'FORMAT —',
    'GUARDRAILS',
    'non-negotiable',
    'NEVER say',
    'consult a doctor',
    'seek professional advice',
    'Direct and confident',
    'TONE:',
    'Final Answer:',
    'Final Answer',
  ];
  const lines = text.split('\n');
  const clean = lines.filter(
    (line) => !instructionSignals.some((phrase) => line.toLowerCase().includes(phrase.toLowerCase()))
  );
  return clean.join('\n').trim();
}

// Strips chain-of-thought leakage from gemma-4-26b-a4b-it reasoning output.
// The model outputs: [clean answer] then [*Wait,...* / *Let's...* reasoning] then repeats.
function stripThinking(text: string): string {
  // Phase 1: Inline asterisk reasoning — e.g. "...answer.   *Wait, the prompt says..."
  // Asterisks NEVER appear in clean pharmacist responses, so any *ThinkingWord is a signal.
  const inlineThink = /\*(?:Wait|Final|Let me|Actually|I'll|The prompt|Hmm|Note that|Re-read|Check)/i;
  const inlineIdx = text.search(inlineThink);
  if (inlineIdx > 30) {
    const before = text.substring(0, inlineIdx).trim();
    const lastPunct = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'));
    if (lastPunct > 20) return before.substring(0, lastPunct + 1).trim();
    if (before.length > 20) return before;
  }

  // Phase 2: Lines starting with * (model put thinking on its own line)
  const lines = text.split('\n');
  const firstThinkLine = lines.findIndex((l) => /^\s*\*/.test(l));
  if (firstThinkLine > 0) {
    const before = lines.slice(0, firstThinkLine).join('\n').trim();
    if (before.length > 20) return before;
  }

  // Phase 3: If the model started with *...* blocks, strip them all and return remaining content
  if (/^\s*\*/m.test(text)) {
    const withoutBlocks = text
      .replace(/\*[^*\n]{0,300}\*/g, '')
      .replace(/^\s*\*.*$/gm, '')
      .trim();
    if (!withoutBlocks) return ''; // all content was *-lines (system prompt echo) — signal garbage to caller
    const sentences = withoutBlocks.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 15);
    if (sentences.length > 0) return sentences.slice(0, 3).join(' ').trim();
  }

  // Phase 4: Non-asterisk self-evaluation markers (numbered checklists, "Total sentences:", "Wait, I...")
  const selfEvalMarkers: RegExp[] = [
    /\s{2,}Wait,?\s+(?:actually|the prompt|let me|i'll|i should|but)\b/i,
    /\bTotal sentences:/i,
    /\bStarts immediately:/i,
    /(?:\d+\.\s+){2,}/,
  ];
  for (const marker of selfEvalMarkers) {
    const idx = text.search(marker);
    if (idx > 30) {
      const before = text.substring(0, idx).trim();
      const lastPunct = Math.max(before.lastIndexOf('.'), before.lastIndexOf('!'), before.lastIndexOf('?'));
      if (lastPunct > 20) return before.substring(0, lastPunct + 1).trim();
      if (before.length > 20) return before;
    }
  }

  // Phase 5: Non-asterisked "Final Answer:" labels
  const finalMatch = text.match(/(?:^|\n)\s*Final\s+(?:Polish|Answer|Version|Response|selection)\s*:?\s*\n?\s*([\s\S]{20,})/i);
  if (finalMatch) return finalMatch[1].trim();

  // Phase 6: last clean paragraph
  const paragraphs = text.split(/\n{2,}/);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i].trim();
    if (p && !p.startsWith('*') && !p.startsWith('-') && !p.startsWith('#') && p.length > 30) return p;
  }

  return text.trim();
}

// Singleton
export const nexusBrain = new NexusBrain();
