// Nexus Safety & Trust Layer
// Validates every Gemma output before display, logs failures, drives self-correction.

import seedData from './nexus-failures.json';

// ── Types ────────────────────────────────────────────────────────────────────

export type FailurePattern =
  | 'double_response'
  | 'thinking_leak'
  | 'incomplete'
  | 'off_topic'
  | 'excessive_length'
  | 'preamble'
  | 'disclaimer'
  | 'hallucination';

export type SafetyFeature = 'askrx' | 'scanner' | 'search' | 'whatsapp';

export interface FailureRecord {
  id: string;
  timestamp: string;
  feature: SafetyFeature;
  pattern: FailurePattern;
  trigger: string;
  bad_output_sample: string;
  correction_applied: boolean;
  auto_detected: boolean;
}

export interface SafetyValidation {
  passed: boolean;
  patterns: FailurePattern[];
}

export interface ScanSafetyReport {
  confidence: 'High' | 'Medium' | 'Low';
  verifyWithPharmacist: boolean;
  flags: string[];
}

export interface SafetyEvent {
  id: string;
  timestamp: Date;
  type: 'detected' | 'corrected' | 'correction_failed' | 'feedback' | 'scanner_flagged';
  feature: SafetyFeature;
  patterns: FailurePattern[];
  message: string;
}

export interface SafetyStats {
  totalResponses: number;
  totalFailures: number;
  totalCorrections: number;
  correctionSuccesses: number;
  correctionRate: number;
  patternCounts: Partial<Record<FailurePattern, number>>;
  recentEvents: SafetyEvent[];
}

// ── Session state ────────────────────────────────────────────────────────────

const runtimeLog: FailureRecord[] = [];

let sessionStats: Omit<SafetyStats, 'correctionRate' | 'recentEvents'> & { recentEvents: SafetyEvent[] } = {
  totalResponses: 0,
  totalFailures: 0,
  totalCorrections: 0,
  correctionSuccesses: 0,
  patternCounts: {},
  recentEvents: [],
};

const listeners = new Set<(stats: SafetyStats) => void>();

function notify() {
  const stats = getStats();
  listeners.forEach((l) => l(stats));
}

function addEvent(event: Omit<SafetyEvent, 'id' | 'timestamp'>) {
  const e: SafetyEvent = {
    id: `se_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    ...event,
  };
  sessionStats.recentEvents = [...sessionStats.recentEvents, e].slice(-50);
  notify();
}

// ── Detection functions ──────────────────────────────────────────────────────

function detectDoubleResponse(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 25);
  const seen = new Set<string>();
  for (const s of sentences) {
    if (seen.has(s)) return true;
    seen.add(s);
  }
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim().toLowerCase()).filter((p) => p.length > 40);
  const seenParas = new Set<string>();
  for (const p of paragraphs) {
    if (seenParas.has(p)) return true;
    seenParas.add(p);
  }
  return false;
}

function detectThinkingLeak(text: string): boolean {
  return (
    /^\s*\*/m.test(text) ||
    /<think>/i.test(text) ||
    /\blet me (think|reconsider|analyze|check|verify|rephrase|approach)\b/i.test(text) ||
    /\bi need to consider\b/i.test(text) ||
    /^step \d+:/im.test(text) ||
    /\bfirst,? let'?s\b/i.test(text)
  );
}

function detectIncomplete(text: string): boolean {
  const t = text.trim();
  return t.length < 8 || t.endsWith('...') || t.endsWith('—') || /\b\w+-$/.test(t);
}

function detectPreamble(text: string): boolean {
  return /^(of course[,!]?|sure[,!]?|certainly[,!]?|i'?d be happy|great question[,!]?|hello[,!]?|hi there|absolutely[,!]?|no problem[,!]?|glad to)/i.test(
    text.trim()
  );
}

function detectDisclaimer(text: string): boolean {
  return /consult (a |your )?(doctor|physician|healthcare|medical professional)|seek (professional|medical) advice|i('m| am) (just |an? )?ai/i.test(text);
}

function detectExcessiveLength(text: string): boolean {
  return text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length > 5;
}

function detectOffTopic(text: string): boolean {
  return !/\b(mg|ml|dose|dosage|drug|medicine|medication|tablet|capsule|syrup|injection|pharmacist|pharmacy|prescribed|prescription|side effect|treatment|antibiotic|paracetamol|ibuprofen|patient|daily|twice|thrice|oral|brand|generic|health|symptom|disease|infection|pain|fever|blood|pressure|diabetes|malaria|typhoid|vitamin|supplement|nafdac)\b/i.test(text);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function onSafetyUpdate(listener: (stats: SafetyStats) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStats(): SafetyStats {
  return {
    ...sessionStats,
    correctionRate:
      sessionStats.totalCorrections > 0
        ? Math.round((sessionStats.correctionSuccesses / sessionStats.totalCorrections) * 100)
        : 0,
    recentEvents: [...sessionStats.recentEvents].reverse().slice(0, 20),
  };
}

export function getFailureLog(): FailureRecord[] {
  return [...(seedData.failures as FailureRecord[]), ...runtimeLog];
}

export function trackResponse(): void {
  sessionStats.totalResponses++;
  notify();
}

export function logFailure(record: {
  feature: SafetyFeature;
  patterns: FailurePattern[];
  trigger: string;
  bad_output_sample: string;
  auto_detected: boolean;
}): void {
  sessionStats.totalFailures++;
  record.patterns.forEach((p) => {
    sessionStats.patternCounts[p] = (sessionStats.patternCounts[p] ?? 0) + 1;
  });

  runtimeLog.push({
    id: `rf_${Date.now()}`,
    timestamp: new Date().toISOString(),
    feature: record.feature,
    pattern: record.patterns[0],
    trigger: record.trigger.substring(0, 150),
    bad_output_sample: record.bad_output_sample.substring(0, 200),
    correction_applied: false,
    auto_detected: record.auto_detected,
  });

  addEvent({
    type: 'detected',
    feature: record.feature,
    patterns: record.patterns,
    message: `${record.patterns.join(' + ')} detected in ${record.feature}`,
  });
}

export function logCorrectionResult(success: boolean, feature: SafetyFeature, patterns: FailurePattern[]): void {
  sessionStats.totalCorrections++;
  if (success) sessionStats.correctionSuccesses++;

  if (runtimeLog.length > 0) {
    runtimeLog[runtimeLog.length - 1].correction_applied = success;
  }

  addEvent({
    type: success ? 'corrected' : 'correction_failed',
    feature,
    patterns,
    message: success ? 'Self-correction successful — response cleaned' : 'Self-correction insufficient — response flagged for review',
  });
}

export function reportFeedback(feature: SafetyFeature, pattern: FailurePattern, trigger: string): void {
  sessionStats.totalFailures++;
  sessionStats.patternCounts[pattern] = (sessionStats.patternCounts[pattern] ?? 0) + 1;

  runtimeLog.push({
    id: `fb_${Date.now()}`,
    timestamp: new Date().toISOString(),
    feature,
    pattern,
    trigger: trigger.substring(0, 150),
    bad_output_sample: '(user-reported)',
    correction_applied: false,
    auto_detected: false,
  });

  addEvent({
    type: 'feedback',
    feature,
    patterns: [pattern],
    message: `User flagged: ${pattern} in ${feature}`,
  });
}

export function logScannerResult(report: ScanSafetyReport, feature: SafetyFeature = 'scanner'): void {
  if (report.confidence !== 'High') {
    sessionStats.totalFailures++;
    sessionStats.patternCounts['hallucination'] = (sessionStats.patternCounts['hallucination'] ?? 0) + 1;

    runtimeLog.push({
      id: `sc_${Date.now()}`,
      timestamp: new Date().toISOString(),
      feature,
      pattern: 'hallucination',
      trigger: 'Image scan',
      bad_output_sample: `Low confidence extraction — ${report.flags.join(', ')}`,
      correction_applied: false,
      auto_detected: true,
    });

    addEvent({
      type: 'scanner_flagged',
      feature,
      patterns: ['hallucination'],
      message: `Scanner confidence: ${report.confidence} — ${report.flags.join(', ')}`,
    });
  }
}

export function validateResponse(text: string, feature: SafetyFeature): SafetyValidation {
  const patterns: FailurePattern[] = [];

  if (detectThinkingLeak(text)) patterns.push('thinking_leak');
  if (detectDoubleResponse(text)) patterns.push('double_response');
  if (detectIncomplete(text)) patterns.push('incomplete');
  if (detectPreamble(text)) patterns.push('preamble');

  if (feature === 'askrx') {
    if (detectDisclaimer(text)) patterns.push('disclaimer');
    if (detectExcessiveLength(text)) patterns.push('excessive_length');
    if (detectOffTopic(text)) patterns.push('off_topic');
  }

  return { passed: patterns.length === 0, patterns };
}

// ── Prompt builders ──────────────────────────────────────────────────────────

const CORRECTION_RULES: Record<FailurePattern, string> = {
  thinking_leak:
    'Do NOT output lines starting with * or phrases like "Let me think". Output ONLY the final answer.',
  double_response: 'Do NOT repeat the same sentence. Output each fact exactly once.',
  preamble:
    'Do NOT start with "Of course", "Sure", "Certainly" or any greeting. Start with the drug name or clinical fact.',
  disclaimer:
    'Do NOT say "consult a doctor" or "seek professional advice". Give the clinical information directly.',
  excessive_length: 'Maximum 3 sentences. Stop after the essential clinical information.',
  off_topic: 'Answer only with pharmaceutical/clinical information directly relevant to the question.',
  incomplete: 'Complete the response. End with a full sentence.',
  hallucination: 'Verify the drug name and dose carefully. Only state what you can confirm.',
};

export function buildRetrySystemPrompt(basePrompt: string, patterns: FailurePattern[]): string {
  const rules = patterns.map((p) => `- ${CORRECTION_RULES[p]}`).join('\n');
  return `${basePrompt}\n\n--- SAFETY CORRECTION ---\nYour previous response was rejected. Fix these specific issues:\n${rules}\n--- END CORRECTION ---`;
}

export function buildGuardedSystemPrompt(basePrompt: string): string {
  const sessionPatterns = new Set(runtimeLog.map((r) => r.pattern));
  if (sessionPatterns.size === 0) return basePrompt;

  const rules = [...sessionPatterns].map((p) => `- ${CORRECTION_RULES[p]}`).join('\n');
  return `${basePrompt}\n\nSELF-CORRECTION (mistakes you made this session — do not repeat):\n${rules}`;
}
