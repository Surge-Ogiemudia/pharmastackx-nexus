'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, TextField, IconButton, Avatar, CircularProgress,
  Chip, Button, Select, MenuItem, Dialog, DialogContent, ListSubheader,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import MedicationIcon from '@mui/icons-material/Medication';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { reportFeedback, type FailurePattern } from '@/lib/nexus-safety';
import { useRouter } from 'next/navigation';
import type { ConsultResult, Medicine } from '@/lib/nexus-brain';
import type { PharmacistResponse } from '@/lib/dispatch-store';

type MessageRole = 'user' | 'ai' | 'system' | 'dispatch' | 'suggestion' | 'detail_form';

interface SuggestedAction {
  type: 'find_medicine';
  medicines: Medicine[];
  originalQuery?: string;
}

interface Message {
  id: string;
  role: MessageRole;
  text: string;
  imagePreview?: string;
  timestamp: Date;
  flagged?: boolean;
  patternsDetected?: FailurePattern[];
  medicines?: Medicine[];
  requestId?: string;
  suggestedMedicines?: Medicine[];
  condition?: string;
  originalQuery?: string;
  pendingMedicines?: Medicine[];
  suggestedAction?: SuggestedAction;
  isError?: boolean;
  failedQuery?: string;
}

type ScanMode = 'ask' | 'medicine' | 'prescription';

const SCAN_OPTIONS: { mode: ScanMode; emoji: string; label: string; sub: string }[] = [
  { mode: 'ask',         emoji: '💬', label: 'Ask about a photo',    sub: 'Identify pills, read a label, or ask anything' },
  { mode: 'medicine',    emoji: '💊', label: 'Find this medicine',   sub: "Scan the box — we'll find it nearby" },
  { mode: 'prescription',emoji: '📋', label: 'Scan a prescription',  sub: 'Extract all medicines from your Rx' },
];

const LANG_SHORT: Record<string, string> = {
  'en-US': 'EN', 'fr-FR': 'FR', 'ar': 'AR', 'sw': 'SW',
  'yo': 'YO', 'ig': 'IG', 'ha': 'HA', 'am': 'AM', 'zu': 'ZU',
  'es-ES': 'ES', 'pt-BR': 'PT', 'hi-IN': 'HI', 'zh-CN': 'ZH', 'de-DE': 'DE',
};

const SUGGESTED = [
  'I need coartem',
  'Find me amoxicillin 500mg',
  'What are side effects of metformin?',
  'Is ibuprofen safe during pregnancy?',
  'I need something for high BP',
];


// Detect when the user wants to find/buy a specific medicine — skip AI consultation
function extractConnectRequest(text: string): Medicine | null {
  const t = text.trim();
  if (/\?/.test(t)) return null; // questions → consultation
  if (/^(what|how|why|when|is|are|can|could|should|does|do|will|would)\b/i.test(t)) return null;
  if (/\bi\s+need\s+something\s+(for|to)\b/i.test(t)) return null; // "I need something for X" → consult

  const triggers = [
    /\b(?:find(?:\s+me)?|search(?:\s+for)?|looking\s+for|get\s+me|who\s+has|where\s+can\s+i\s+(?:get|find|buy))\s+(.+)/i,
    /\bi\s+(?:need|want)\s+to\s+(?:buy|get|order|purchase)\s+(.+)/i,
    /\bi\s+(?:need|want)\s+(?!something[\s,]|to\s)(.+)/i,
  ];

  for (const re of triggers) {
    const match = t.match(re);
    if (!match) continue;
    let name = match[1]
      .replace(/\s+near\s+me\s*$/i, '')
      .replace(/\s+(?:in|at|from|around)\s+.*$/i, '')
      .replace(/\s+please\s*$/i, '')
      .trim();
    if (/\b(something|anything|medicine|drug|medication|help|advice|info(?:rmation)?)\b/i.test(name)) continue;
    if (name.length < 2) continue;
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return { name, strength: '', form: '', quantity: 0 };
  }
  return null;
}

// Camera/scan intent detection
function isScanRequest(text: string): boolean {
  return /\b(scan|photo|picture|snap|camera|photograph)\b/i.test(text)
    && /\b(prescription|rx|pill|medicine|tablet|box|pack|label|capsule)\b/i.test(text);
}

// Extract medicine names from AI response text — no API call, never fails.
// Covers the patterns AskRx always uses: "DrugName (Brand) dose" and "Generic (Brand)" pairs.
const SKIP_WORDS = new Set(['Take', 'Use', 'Apply', 'This', 'The', 'For', 'With', 'Your', 'Each', 'Every', 'Once', 'Twice', 'Daily', 'Oral', 'Dose', 'Note', 'Blood', 'Pressure', 'Food', 'Water', 'After', 'Before', 'During', 'Side', 'Effects', 'Prices', 'Vary', 'Avoid', 'Both', 'Rinse', 'Mouth']);

function extractMedicinesFromResponse(text: string): Medicine[] {
  const seen = new Set<string>();
  const result: Medicine[] = [];

  const add = (name: string, strength: string | null) => {
    const key = name.toLowerCase();
    const firstWord = name.split(/\s+/)[0];
    if (!seen.has(key) && !SKIP_WORDS.has(name) && !SKIP_WORDS.has(firstWord) && name.length >= 4) {
      seen.add(key);
      result.push({ name, strength: strength ?? '', form: '', quantity: 0 });
    }
  };

  // Pattern 1: DrugName (optional Brand in parens) dose — e.g. "Budesonide (Pulmicort) 200mcg"
  // The optional " GenericName" suffix is dropped to prevent "Take Amlodipine" compounds.
  const withDose = /\b([A-Z][a-z]{3,})\s*(?:\([A-Za-z\s]{2,20}\)\s*)?([\d.]+\s*(?:mg|mcg|g|ml|iu|units?)(?:\/[\d.]*(?:ml|mg|g))?)/g;
  let m: RegExpExecArray | null;
  while ((m = withDose.exec(text)) !== null) {
    add(m[1].trim(), m[2].replace(/\s+/g, '').trim());
  }

  // Pattern 2: Generic (Brand) pairs — e.g. "Salbutamol (Ventolin)".
  // Only add the generic name; the brand is an alias for the same drug, not a separate one.
  const brandPair = /\b([A-Z][a-z]{3,})\s+\(([A-Z][a-z]{3,})\)/g;
  while ((m = brandPair.exec(text)) !== null) {
    add(m[1], null);
  }

  return result.slice(0, 4);
}

export default function NexusPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const [scanMenu, setScanMenu] = useState<'mode' | 'source' | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('ask');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { brain, logger } = useNexusBrain();

  // Dispatch setup
  const [userState, setUserState] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [pendingMedicines, setPendingMedicines] = useState<Medicine[]>([]);

  useEffect(() => {
    setUserState(localStorage.getItem('psx_user_state') ?? '');
    setUserPhone(localStorage.getItem('psx_user_phone') ?? '');
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const addMsg = (msg: Omit<Message, 'id' | 'timestamp'>): string => {
    const id = `${msg.role}_${Date.now()}_${Math.random()}`;
    setMessages((prev) => [...prev, { ...msg, id, timestamp: new Date() }]);
    return id;
  };

  const updateMsg = (id: string, updates: Partial<Omit<Message, 'id' | 'timestamp'>>) =>
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));

  const [scanningMsgId, setScanningMsgId] = useState<string | null>(null);

  const voiceInputRef = useRef(false);

  // Nigerian locale codes improve voice selection on devices that have regional packs
  const TTS_LANG: Record<string, string> = {
    'ha': 'ha-NG', 'yo': 'yo-NG', 'ig': 'ig-NG',
    'am': 'am-ET', 'zu': 'zu-ZA', 'sw': 'sw-KE',
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const doSpeak = () => {
      const utter = new SpeechSynthesisUtterance(text);
      const ttslang = TTS_LANG[speechLang] ?? speechLang;
      utter.lang = ttslang;
      utter.rate = 0.87;  // slightly slower = more natural cadence
      utter.pitch = 1.05;

      // Pick the best available voice for this language
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const prefix = ttslang.split('-')[0];
        const exact = voices.find((v) => v.lang === ttslang);
        const regional = voices.find((v) => v.lang.startsWith(prefix + '-'));
        const any = voices.find((v) => v.lang.startsWith(prefix));
        const chosen = exact ?? regional ?? any;
        if (chosen) utter.voice = chosen;
      }

      window.speechSynthesis.speak(utter);
    };

    // Voices list may not be populated yet on first call
    if (window.speechSynthesis.getVoices().length > 0) {
      doSpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        doSpeak();
      };
    }
  };

  // ── Image handling ──
  const processImageFile = (file: File): Promise<{ base64: string; mimeType: string; preview: string }> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
          resolve({ base64: canvas.toDataURL('image/jpeg', 0.82), mimeType: 'image/jpeg', preview: dataUrl });
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });

  const runScan = async (imageBase64: string, preview: string, mode: 'medicine' | 'prescription') => {
    const doneLabel = mode === 'medicine' ? 'Scanned medicine box' : 'Scanned prescription';
    const msgId = addMsg({ role: 'user', text: mode === 'medicine' ? 'Scanning medicine box…' : 'Scanning prescription…', imagePreview: preview });
    setScanningMsgId(msgId);
    setLoading(true);
    try {
      const endpoint = mode === 'medicine' ? '/api/scan-med' : '/api/scan-rx';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64 }),
      });
      if (!res.ok) throw new Error('Scan failed');
      const data = await res.json();
      const medicines: Medicine[] = data.medicines ?? [];
      updateMsg(msgId, { text: doneLabel });
      setScanningMsgId(null);
      if (medicines.length > 0) {
        const names = medicines.map((m) => m.name).join(', ');
        addMsg({ role: 'ai', text: `Found: ${names}. Searching for nearby pharmacists…` });
        setLoading(false);
        await triggerDispatch(medicines);
      } else {
        addMsg({ role: 'ai', text: "Couldn't read the image clearly — try better lighting or move closer." });
        setLoading(false);
      }
    } catch {
      updateMsg(msgId, { text: doneLabel });
      setScanningMsgId(null);
      addMsg({ role: 'ai', text: 'Scan failed — please try again.' });
      setLoading(false);
    }
  };

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const imageData = await processImageFile(file);
    setScanMenu(null);
    if (scanMode === 'ask') {
      setAttachedImage(imageData);
    } else {
      await runScan(imageData.base64, imageData.preview, scanMode as 'medicine' | 'prescription');
    }
  };

  // ── Voice input ──
  const toggleRecording = async () => {
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }

    // Explicitly request mic permission first — required for reliable mobile re-use
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // release; SR will re-acquire
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name ?? '';
      const isDenied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      logger.emit('ERROR', isDenied
        ? 'Microphone access denied — check your browser settings'
        : 'Microphone not available on this device');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { logger.emit('ERROR', 'Voice input not supported — use Chrome or Safari'); return; }

    transcriptRef.current = '';
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = speechLang;
    recognitionRef.current = recognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      transcriptRef.current = t;
      setInput(t);
    };

    recognition.onend = async () => {
      setRecording(false);
      const raw = transcriptRef.current.trim();
      if (!raw) return;
      setTranscribing(true);
      const corrected = await brain.correctTranscript(raw, speechLang);
      voiceInputRef.current = true; // next send should speak the response
      setInput(corrected);
      setTranscribing(false);
      transcriptRef.current = '';
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      setRecording(false);
      setTranscribing(false);
      if (e.error === 'no-speech') return; // silent — user just didn't speak
      const msgs: Record<string, string> = {
        'not-allowed': 'Microphone access denied',
        'network': 'Network error — try again',
        'audio-capture': 'No microphone found',
        'aborted': '',
      };
      const msg = msgs[e.error as string] ?? `Voice error: ${e.error}`;
      if (msg) logger.emit('ERROR', msg);
    };

    try {
      recognition.start();
      setRecording(true);
    } catch {
      logger.emit('ERROR', 'Could not start voice input — tap again');
    }
  };

  // ── Dispatch ──
  const doDispatch = async (medicines: Medicine[], state: string, phone: string, patientNotes?: string) => {
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicines, userState: state, userPhone: phone, patientNotes }),
      });
      if (!res.ok) throw new Error('Dispatch failed');
      const { requestId } = await res.json();
      addMsg({ role: 'dispatch', text: '', medicines, requestId });
    } catch {
      addMsg({ role: 'ai', text: 'Could not reach pharmacists right now. Please try again.' });
    }
  };

  const triggerDispatch = async (medicines: Medicine[], patientNotes?: string) => {
    if (userState && userPhone) {
      await doDispatch(medicines, userState, userPhone, patientNotes);
    } else {
      setPendingMedicines(medicines);
      setSetupOpen(true);
    }
  };

  const handleSetupConfirm = async () => {
    const phone = userPhone.replace(/[\s\-().]/g, '');
    if (!/^\+?[\d]{7,15}$/.test(phone)) { setPhoneError('Enter a valid phone number'); return; }
    if (!userState.trim()) return;
    setPhoneError('');
    localStorage.setItem('psx_user_state', userState);
    localStorage.setItem('psx_user_phone', userPhone);
    setSetupOpen(false);
    await doDispatch(pendingMedicines, userState, userPhone);
    setPendingMedicines([]);
  };

  const handleSuggestedAction = (action: SuggestedAction) => {
    if (action.medicines.length === 1) {
      addMsg({ role: 'detail_form', text: '', pendingMedicines: action.medicines });
    } else {
      addMsg({ role: 'suggestion', text: '', suggestedMedicines: action.medicines, originalQuery: action.originalQuery });
    }
  };

  const consultFromCondition = async (query: string) => {
    const history = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));

    setLoading(true);
    try {
      const result: ConsultResult = await brain.consult(query, history, speechLang);
      addMsg({ role: 'ai', text: result.text, flagged: result.flagged, patternsDetected: result.patternsDetected });
    } catch {
      addMsg({ role: 'ai', text: 'Could not connect. Please try again.', isError: true, failedQuery: query });
    } finally {
      setLoading(false);
    }
  };

  // ── Send message ──
  const sendMessage = async (text?: string) => {
    const messageText = text ?? input.trim();
    const image = attachedImage;
    if (!messageText && !image) return;
    if (loading) return;

    const isVoice = voiceInputRef.current;
    voiceInputRef.current = false;

    // iOS blocks speechSynthesis from async contexts. Fire a silent utterance NOW
    // (inside the gesture chain) to unlock audio for the response that follows.
    if (isVoice && 'speechSynthesis' in window) {
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }

    addMsg({ role: 'user', text: messageText, imagePreview: image?.preview });
    setInput('');
    setAttachedImage(null);

    // Image path: try medicine scan first, fall back to visual consultation
    // Image path — always visual consultation (scan modes go through handleScanFile, not here)
    if (image) {
      setLoading(true);
      try {
        const history = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
        const result: ConsultResult = await brain.consultWithImage(messageText || 'What is this?', image.base64, image.mimeType, history);
        addMsg({ role: 'ai', text: result.text, flagged: result.flagged, patternsDetected: result.patternsDetected });
        if (isVoice) speakText(result.text);
      } catch (err) {
        addMsg({ role: 'ai', text: err instanceof Error ? err.message : 'Error processing image' });
      }
      setLoading(false);
      return;
    }

    // Text path: stream the response so text appears immediately
    if (isScanRequest(messageText)) {
      addMsg({ role: 'ai', text: 'Tap the camera icon below to scan your prescription or medicine.' });
      return;
    }

    const connectMed = extractConnectRequest(messageText);
    if (connectMed) {
      addMsg({ role: 'detail_form', text: '', pendingMedicines: [connectMed] });
      return;
    }

    const consultHistory = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));

    setLoading(true);

    try {
      const consultResult = await brain.consult(messageText, consultHistory, speechLang);
      const medicines = extractMedicinesFromResponse(consultResult.text);
      const suggestedAction: SuggestedAction | undefined = medicines.length > 0
        ? { type: 'find_medicine', medicines, originalQuery: messageText }
        : undefined;
      addMsg({ role: 'ai', text: consultResult.text, flagged: consultResult.flagged, patternsDetected: consultResult.patternsDetected, suggestedAction });
      if (isVoice) speakText(consultResult.text);
    } catch {
      addMsg({ role: 'ai', text: 'Connection dropped — Gemma couldn\'t be reached. Tap Retry to try again.', isError: true, failedQuery: messageText });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const selectPharmacist = (r: PharmacistResponse, medicines: Medicine[]) => {
    const order = {
      pharmacist: {
        id: r.pharmacistId, name: r.pharmacistName, address: r.pharmacistAddress,
        distance: r.distance, responseRate: r.responseRate,
        score: Math.round(100 - r.distance * 10 + r.responseRate),
        price: r.price, responseTime: r.distance < 2 ? '~30s' : '~1min',
        reason: 'Confirmed availability',
      },
      medicines,
      userState,
      userPhone,
    };
    localStorage.setItem('psx_order', JSON.stringify(order));
    router.push('/payment');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', maxWidth: { md: 880 }, mx: 'auto', width: '100%' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ p: 1, borderRadius: '10px', background: 'linear-gradient(135deg, rgba(96,165,250,0.2) 0%, rgba(0,229,160,0.2) 100%)' }}>
          <SmartToyIcon sx={{ color: '#60A5FA', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>Nexus</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Ask anything · Find medicines · Scan prescriptions · Powered by Gemma 4
          </Typography>
        </Box>
      </Box>

      {/* Messages */}
      <Box ref={scrollRef} sx={{ flex: 1, overflow: 'auto', px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.length === 0 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '16px', background: 'linear-gradient(135deg, #60A5FA 0%, #00E5A0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(96,165,250,0.2)' }}>
              <SmartToyIcon sx={{ color: '#fff', fontSize: 32 }} />
            </Box>
            <Box sx={{ textAlign: 'center', maxWidth: 380 }}>
              <Typography sx={{ color: '#E0F2F1', fontWeight: 600, mb: 0.5 }}>What do you need?</Typography>
              <Typography sx={{ color: '#64748B', fontSize: '0.85rem' }}>
                Ask a medicine question, tell me what you need, or snap a photo of your prescription.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 500 }}>
              {SUGGESTED.map((q, i) => (
                <Chip key={i} label={q} onClick={() => sendMessage(q)}
                  sx={{ bgcolor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)', color: '#94A3B8', fontSize: '0.75rem', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(96,165,250,0.15)', color: '#E0F2F1' } }} />
              ))}
            </Box>
          </Box>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {msg.role === 'dispatch' && msg.medicines && msg.requestId ? (
                <DispatchCard medicines={msg.medicines} requestId={msg.requestId} onSelect={(r) => selectPharmacist(r, msg.medicines!)} />
              ) : msg.role === 'suggestion' && msg.suggestedMedicines ? (
                <SuggestionCard
                  medicines={msg.suggestedMedicines}
                  condition={msg.condition}
                  onDispatch={(meds) => addMsg({ role: 'detail_form', text: '', pendingMedicines: meds })}
                  onConsult={() => consultFromCondition(msg.originalQuery ?? msg.text)}
                />
              ) : msg.role === 'detail_form' && msg.pendingMedicines ? (
                <DetailFormCard
                  medicines={msg.pendingMedicines}
                  onSubmit={(meds, notes) => triggerDispatch(meds, notes)}
                />
              ) : msg.role === 'system' ? (
                <Box sx={{ textAlign: 'center', py: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#00E5A0', fontStyle: 'italic' }}>{msg.text}</Typography>
                </Box>
              ) : (
                <MessageBubble msg={msg} onSuggestedAction={handleSuggestedAction} onRetry={sendMessage} onSpeak={msg.role === 'ai' ? speakText : undefined} isScanningMsg={msg.id === scanningMsgId} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(0,229,160,0.15)' }}>
                <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
              </Avatar>
              <Box sx={{ px: 2, py: 1.5, borderRadius: '4px 16px 16px 16px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} sx={{ color: '#00E5A0' }} />
                <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.8rem' }}>
                  Gemma 4 is thinking…
                </Typography>
              </Box>
            </Box>
          </motion.div>
        )}
      </Box>

      {/* Input */}
      <Box sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, position: 'relative' }}>
        {/* Scan intent menu */}
        {scanMenu && (
          <>
            {/* Backdrop — closes menu on outside tap */}
            <Box onClick={() => setScanMenu(null)} sx={{ position: 'fixed', inset: 0, zIndex: 9 }} />
            <Box sx={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: 16, right: 16,
              bgcolor: '#141f35', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '18px', p: 1, zIndex: 10,
              boxShadow: '0 -8px 40px rgba(0,0,0,0.55)',
            }}>
              {scanMenu === 'mode' && (
                <>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', px: 1.5, pt: 0.5, pb: 0.75 }}>
                    What would you like to do?
                  </Typography>
                  {SCAN_OPTIONS.map(({ mode, emoji, label, sub }) => (
                    <Box key={mode}
                      onClick={() => { setScanMode(mode); setScanMenu('source'); }}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: '12px', cursor: 'pointer', transition: 'background 0.12s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                      <Typography sx={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{emoji}</Typography>
                      <Box>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#E0F2F1', lineHeight: 1.3 }}>{label}</Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>{sub}</Typography>
                      </Box>
                    </Box>
                  ))}
                </>
              )}
              {scanMenu === 'source' && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 0.5, pb: 0.75 }}>
                    <Box onClick={() => setScanMenu('mode')} sx={{ cursor: 'pointer', color: '#64748B', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 0.5, '&:hover': { color: '#E0F2F1' } }}>
                      ← <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Back</Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#475569', letterSpacing: '0.08em', textTransform: 'uppercase', ml: 0.5 }}>
                      {SCAN_OPTIONS.find(o => o.mode === scanMode)?.label}
                    </Typography>
                  </Box>
                  {[
                    { label: 'Camera', sub: 'Take a photo now', ref: cameraRef },
                    { label: 'Gallery', sub: 'Choose from your photos or files', ref: galleryRef },
                  ].map(({ label, sub, ref: inputRef }) => (
                    <Box key={label}
                      onClick={() => inputRef.current?.click()}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, py: 1, borderRadius: '12px', cursor: 'pointer', transition: 'background 0.12s', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {label === 'Camera' ? <CameraAltIcon sx={{ fontSize: 18, color: '#60A5FA' }} /> : <LocalPharmacyIcon sx={{ fontSize: 18, color: '#60A5FA' }} />}
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#E0F2F1', lineHeight: 1.3 }}>{label}</Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>{sub}</Typography>
                      </Box>
                    </Box>
                  ))}
                </>
              )}
            </Box>
          </>
        )}

        {/* Hidden file inputs */}
        <input type="file" accept="image/*" capture="environment" hidden ref={cameraRef} onChange={handleScanFile} />
        <input type="file" accept="image/*" hidden ref={galleryRef} onChange={handleScanFile} />

        {attachedImage && (
          <Box sx={{ mb: 1.5, position: 'relative', display: 'inline-block' }}>
            <Box component="img" src={attachedImage.preview} alt="Attached" sx={{ height: 72, borderRadius: '8px', display: 'block', border: '1px solid rgba(255,255,255,0.1)' }} />
            <IconButton size="small" onClick={() => setAttachedImage(null)}
              sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)', width: 20, height: 20, p: 0, '&:hover': { bgcolor: 'rgba(239,68,68,0.3)' } }}>
              <CloseIcon sx={{ fontSize: 12, color: '#94A3B8' }} />
            </IconButton>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <MicIcon sx={{ fontSize: 13, color: '#475569' }} />
          <Typography sx={{ fontSize: '0.6rem', color: '#475569' }}>voice language</Typography>
          <Select value={speechLang} onChange={(e) => setSpeechLang(e.target.value)} size="small" variant="outlined"
            renderValue={(val) => LANG_SHORT[val as string] ?? val}
            sx={{ fontSize: '0.7rem', height: 24, color: '#C084FC', bgcolor: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.25)', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& .MuiSelect-select': { py: 0, px: 1 }, '& .MuiSvgIcon-root': { color: '#C084FC', fontSize: 16 } }}
            MenuProps={{ slotProps: { paper: { sx: { bgcolor: '#1A2540', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', mt: 0.5, maxHeight: 280, overflowY: 'auto', '& .MuiMenuItem-root': { fontSize: '0.8rem', color: '#CBD5E1', py: 0.75, '&:hover': { bgcolor: 'rgba(192,132,252,0.1)', color: '#E0F2F1' }, '&.Mui-selected': { bgcolor: 'rgba(192,132,252,0.15)', color: '#C084FC', fontWeight: 700 } } } } } }}>
            <ListSubheader sx={{ bgcolor: '#1A2540', color: '#475569', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: '28px' }}>Preferred</ListSubheader>
            <MenuItem value="en-US">English</MenuItem>
            <MenuItem value="fr-FR">French</MenuItem>
            <MenuItem value="ar">Arabic</MenuItem>
            <MenuItem value="sw">Swahili</MenuItem>
            <ListSubheader sx={{ bgcolor: '#1A2540', color: '#475569', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: '28px' }}>African</ListSubheader>
            <MenuItem value="yo">Yoruba</MenuItem>
            <MenuItem value="ig">Igbo</MenuItem>
            <MenuItem value="ha">Hausa</MenuItem>
            <MenuItem value="am">Amharic</MenuItem>
            <MenuItem value="zu">Zulu</MenuItem>
            <ListSubheader sx={{ bgcolor: '#1A2540', color: '#475569', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: '28px' }}>Global</ListSubheader>
            <MenuItem value="es-ES">Spanish</MenuItem>
            <MenuItem value="pt-BR">Portuguese</MenuItem>
            <MenuItem value="hi-IN">Hindi</MenuItem>
            <MenuItem value="zh-CN">Chinese</MenuItem>
            <MenuItem value="de-DE">German</MenuItem>
          </Select>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', bgcolor: 'rgba(15,23,42,0.6)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', px: 2, py: 1, transition: 'border-color 0.2s ease', '&:focus-within': { borderColor: 'rgba(0,229,160,0.3)' } }}>
          <IconButton onClick={() => setScanMenu(scanMenu ? null : 'mode')} size="small"
            sx={{ color: scanMenu ? '#60A5FA' : attachedImage ? '#60A5FA' : '#475569', '&:hover': { color: '#60A5FA' }, flexShrink: 0 }}>
            <CameraAltIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton onClick={toggleRecording} disabled={transcribing} size="small"
            sx={{ flexShrink: 0, color: recording ? '#EF4444' : transcribing ? '#C084FC' : '#475569', '&:hover': { color: recording ? '#F87171' : '#C084FC' }, ...((recording || transcribing) && { animation: 'micPulse 1s ease-in-out infinite', '@keyframes micPulse': { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.6, transform: 'scale(1.2)' } } }) }}>
            <MicIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <TextField fullWidth multiline maxRows={4}
            placeholder={transcribing ? 'Gemma 4 is correcting medical terms...' : recording ? 'Listening…' : 'Ask anything, or say what medicine you need…'}
            value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            variant="standard" slotProps={{ input: { disableUnderline: true, sx: { color: '#E0F2F1', fontSize: '0.9rem' } } }} sx={{ flex: 1 }} />
          <IconButton onClick={() => sendMessage()} disabled={(!input.trim() && !attachedImage) || loading}
            sx={{ color: (input.trim() || attachedImage) ? '#00E5A0' : '#475569', '&:hover': { color: '#4ADE80' }, flexShrink: 0 }}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Location + phone setup */}
      <Dialog open={setupOpen} onClose={() => setSetupOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#0D1526', border: '1px solid rgba(0,229,160,0.2)', borderRadius: '16px', maxWidth: 340, width: '100%', m: 2 } } }}>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1', mb: 0.5 }}>One more thing</Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mb: 2.5 }}>To find pharmacists near you, I need your location and contact number.</Typography>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>Location</Typography>
          <TextField fullWidth size="small" placeholder="e.g. Manchester, London, Lagos…" value={userState} onChange={(e) => setUserState(e.target.value)}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(0,229,160,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#00E5A0' } } }} />
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>Phone number</Typography>
          <TextField fullWidth size="small" placeholder="+44 7700 900123" value={userPhone}
            onChange={(e) => { setUserPhone(e.target.value); setPhoneError(''); }} error={!!phoneError} helperText={phoneError}
            sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(0,229,160,0.3)' }, '&.Mui-focused fieldset': { borderColor: '#00E5A0' } } }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={() => setSetupOpen(false)}
              sx={{ flex: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#64748B', textTransform: 'none', borderRadius: '10px' }}>Cancel</Button>
            <Button variant="contained" disabled={!userState.trim() || !userPhone.trim()} onClick={handleSetupConfirm}
              sx={{ flex: 2, bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700, textTransform: 'none', borderRadius: '10px', '&:hover': { bgcolor: '#00C987' }, '&.Mui-disabled': { bgcolor: 'rgba(0,229,160,0.15)', color: '#334155' } }}>
              Find Pharmacists
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

// ── Detail form card (collect strength / form / qty / notes before dispatch) ──

const FORM_OPTIONS = ['Tablet', 'Capsule', 'Syrup', 'Cream', 'Injection', 'Nebules', 'Drops', 'Patch', 'Suppository'];
const UNIT_OPTIONS = ['Tablet', 'Strip', 'Sachet', 'Bottle', 'Tube', 'Vial', 'Pack'];

function DetailFormCard({ medicines, onSubmit }: {
  medicines: Medicine[];
  onSubmit: (medicines: Medicine[], patientNotes: string) => void;
}) {
  const [details, setDetails] = useState<{ strength: string; form: string; unit: string; quantity: string }[]>(
    medicines.map((m) => ({ strength: m.strength ?? '', form: m.form ?? '', unit: '', quantity: m.quantity ? String(m.quantity) : '' }))
  );
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const update = (idx: number, field: string, val: string) =>
    setDetails((prev) => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));

  const handleSubmit = () => {
    if (submitted) return;
    setSubmitted(true);
    const enriched = medicines.map((m, i) => ({
      ...m,
      strength: details[i].strength || m.strength,
      form: details[i].form || m.form,
      unit: details[i].unit || undefined,
      quantity: details[i].quantity ? Number(details[i].quantity) : m.quantity,
    }));
    onSubmit(enriched, notes);
  };

  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(0,229,160,0.15)', flexShrink: 0 }}>
        <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
      </Avatar>
      <Box sx={{ flex: 1, borderRadius: '4px 16px 16px 16px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', p: 2 }}>
        <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1', fontWeight: 500, mb: 0.25 }}>
          A few quick details — fill in what you know
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', color: '#64748B', mb: 2 }}>
          All optional. If you're unsure, skip — the pharmacist will suggest.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
          {medicines.map((m, idx) => (
            <Box key={idx} sx={{ p: 1.5, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', bgcolor: 'rgba(15,23,42,0.4)' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#C084FC', mb: 1.25 }}>
                {m.name}
              </Typography>

              {/* Strength */}
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
                Strength / dose
              </Typography>
              <TextField fullWidth size="small" placeholder="e.g. 5mg, 250mg/5ml" value={details[idx].strength}
                onChange={(e) => update(idx, 'strength', e.target.value)} disabled={submitted}
                sx={{ mb: 1.25, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.6)', color: '#E0F2F1', borderRadius: '8px', fontSize: '0.85rem', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&.Mui-focused fieldset': { borderColor: '#00E5A0' } }, '& .MuiInputBase-input::placeholder': { color: '#475569' } }} />

              {/* Form */}
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
                Form
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.25 }}>
                {FORM_OPTIONS.map((f) => (
                  <Box key={f} onClick={() => !submitted && update(idx, 'form', details[idx].form === f ? '' : f)}
                    sx={{ px: 1, py: 0.4, borderRadius: '6px', cursor: submitted ? 'default' : 'pointer', fontSize: '0.72rem', fontWeight: details[idx].form === f ? 700 : 400, color: details[idx].form === f ? '#0F172A' : '#64748B', bgcolor: details[idx].form === f ? '#00E5A0' : 'rgba(255,255,255,0.05)', border: `1px solid ${details[idx].form === f ? '#00E5A0' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.12s' }}>
                    {f}
                  </Box>
                ))}
              </Box>

              {/* Qty + Unit */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>Quantity</Typography>
                  <TextField fullWidth size="small" type="number" placeholder="e.g. 30" value={details[idx].quantity}
                    onChange={(e) => update(idx, 'quantity', e.target.value)} disabled={submitted}
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.6)', color: '#E0F2F1', borderRadius: '8px', fontSize: '0.85rem', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&.Mui-focused fieldset': { borderColor: '#00E5A0' } }, '& .MuiInputBase-input::placeholder': { color: '#475569' } }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>Unit</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                    {UNIT_OPTIONS.map((u) => (
                      <Box key={u} onClick={() => !submitted && update(idx, 'unit', details[idx].unit === u ? '' : u)}
                        sx={{ px: 0.75, py: 0.35, borderRadius: '5px', cursor: submitted ? 'default' : 'pointer', fontSize: '0.68rem', fontWeight: details[idx].unit === u ? 700 : 400, color: details[idx].unit === u ? '#0F172A' : '#64748B', bgcolor: details[idx].unit === u ? '#00E5A0' : 'rgba(255,255,255,0.05)', border: `1px solid ${details[idx].unit === u ? '#00E5A0' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.12s' }}>
                        {u}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Notes */}
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.5 }}>
          Notes for pharmacist
        </Typography>
        <TextField fullWidth size="small" placeholder="e.g. Original brand only, no generic" value={notes}
          onChange={(e) => setNotes(e.target.value)} disabled={submitted}
          sx={{ mb: 2, '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.6)', color: '#E0F2F1', borderRadius: '8px', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&.Mui-focused fieldset': { borderColor: '#00E5A0' } }, '& .MuiInputBase-input::placeholder': { color: '#475569', fontSize: '0.85rem' } }} />

        <Button variant="contained" fullWidth disabled={submitted} onClick={handleSubmit}
          sx={{ bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700, textTransform: 'none', borderRadius: '10px', '&:hover': { bgcolor: '#00C987' }, '&.Mui-disabled': { bgcolor: 'rgba(0,229,160,0.15)', color: '#334155' } }}>
          {submitted ? 'Sending request…' : 'Send Request →'}
        </Button>
      </Box>
    </Box>
  );
}

// ── Inline dispatch card ──

function DispatchCard({ medicines, requestId, onSelect }: {
  medicines: Medicine[];
  requestId: string;
  onSelect: (r: PharmacistResponse) => void;
}) {
  const [responses, setResponses] = useState<PharmacistResponse[]>([]);
  const [waitingTooLong, setWaitingTooLong] = useState(false);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/dispatch/${requestId}`);
        if (res.ok) { const data = await res.json(); setResponses(data.responses ?? []); }
      } catch { /* ignore */ }
    };
    poll();
    const iv = setInterval(poll, 2500);
    const t = setTimeout(() => setWaitingTooLong(true), 45000);
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [requestId]);

  const available = responses.filter((r) => r.available);

  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(0,229,160,0.15)', flexShrink: 0 }}>
        <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
      </Avatar>
      <Box sx={{ flex: 1, borderRadius: '4px 16px 16px 16px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,229,160,0.15)', p: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
          {medicines.map((m, i) => (
            <Chip key={i} icon={<MedicationIcon style={{ fontSize: 12 }} />}
              label={`${m.name}${m.strength ? ` ${m.strength}` : ''}`} size="small"
              sx={{ bgcolor: 'rgba(192,132,252,0.1)', color: '#C084FC', fontSize: '0.7rem', border: '1px solid rgba(192,132,252,0.2)' }} />
          ))}
        </Box>

        {available.length === 0 ? (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Box sx={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                {[1, 2].map((r) => (
                  <Box key={r} sx={{
                    position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(0,229,160,0.5)',
                    animation: 'radarRing 2s ease-out infinite', animationDelay: `${(r - 1) * 0.9}s`,
                    '@keyframes radarRing': { '0%': { transform: 'scale(0.2)', opacity: 1 }, '100%': { transform: 'scale(1)', opacity: 0 } },
                  }} />
                ))}
                <Box sx={{ position: 'absolute', inset: '30%', borderRadius: '50%', bgcolor: '#00E5A0' }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#E0F2F1' }}>Contacting pharmacists…</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>
                  {responses.length > 0 ? `${responses.length} responded, none available yet` : 'Waiting for responses'}
                </Typography>
              </Box>
            </Box>
            {waitingTooLong && (
              <Typography sx={{ fontSize: '0.72rem', color: '#475569' }}>Taking longer than usual — pharmacists have been notified.</Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#00E5A0', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
              {available.length} pharmacist{available.length > 1 ? 's' : ''} available
            </Typography>
            {available.map((r, i) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: '10px', bgcolor: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.15)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: r.items?.length ? 1 : 0 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#E0F2F1' }}>{r.pharmacistName}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>{r.pharmacistAddress} · {r.distance}km</Typography>
                  </Box>
                  <Button variant="contained" size="small" onClick={() => onSelect(r)}
                    sx={{ bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#00C987' }, flexShrink: 0 }}>
                    Select →
                  </Button>
                </Box>
                {r.items?.length ? (
                  <Box sx={{ mt: 0.75 }}>
                    {r.items.map((item, j) => (
                      <Box key={j} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4, borderBottom: j < r.items!.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <Typography sx={{ fontSize: '0.78rem', color: item.available ? '#94A3B8' : '#475569' }}>
                          {item.available ? '' : '✗ '}{item.name}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: item.available ? '#E0F2F1' : '#475569' }}>
                          {item.available ? item.price.toLocaleString() : 'Not available'}
                        </Typography>
                      </Box>
                    ))}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 0.75, mt: 0.25 }}>
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B' }}>Total</Typography>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#00E5A0' }}>{r.price.toLocaleString()}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#00E5A0', mt: 0.5 }}>{r.price.toLocaleString()}</Typography>
                )}
                {r.pharmacistNotes && (
                  <Typography sx={{ fontSize: '0.72rem', color: '#64748B', mt: 0.75, fontStyle: 'italic' }}>
                    "{r.pharmacistNotes}"
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── Suggestion card (condition → two-step: choice → checklist) ──

function SuggestionCard({ medicines, condition, onDispatch, onConsult }: {
  medicines: Medicine[];
  condition?: string;
  onDispatch: (medicines: Medicine[]) => void;
  onConsult: () => void;
}) {
  const [phase, setPhase] = useState<'choice' | 'list'>('choice');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dispatched, setDispatched] = useState(false);
  const [consulted, setConsulted] = useState(false);

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const handleDispatch = () => {
    if (dispatched || selected.size === 0) return;
    setDispatched(true);
    onDispatch(medicines.filter((_, i) => selected.has(i)));
  };

  const handleConsult = () => {
    if (consulted) return;
    setConsulted(true);
    onConsult();
  };

  const label = condition ?? 'this condition';

  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(0,229,160,0.15)', flexShrink: 0 }}>
        <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
      </Avatar>
      <Box sx={{ flex: 1, borderRadius: '4px 16px 16px 16px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', p: 2 }}>

        {phase === 'choice' ? (
          <>
            <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1', mb: 0.5, fontWeight: 500 }}>
              You mentioned{' '}
              <Box component="span" sx={{ color: '#C084FC', fontWeight: 700 }}>{label}</Box>
              {'. '}How would you like to proceed?
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748B', mb: 2 }}>
              You can look up your medicine or talk to a pharmacist.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box
                onClick={() => setPhase('list')}
                sx={{
                  px: 1.5, py: 1.25, borderRadius: '10px', cursor: 'pointer',
                  border: '1px solid rgba(0,229,160,0.25)',
                  '&:hover': { borderColor: '#00E5A0', bgcolor: 'rgba(0,229,160,0.04)' },
                  transition: 'all 0.15s',
                }}
              >
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#00E5A0' }}>
                  💊 Help me find the right medicine
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748B', mt: 0.25 }}>
                  See common options — pick and we'll find who has it nearby
                </Typography>
              </Box>
              <Box
                onClick={handleConsult}
                sx={{
                  px: 1.5, py: 1.25, borderRadius: '10px',
                  cursor: consulted ? 'default' : 'pointer',
                  border: `1px solid ${consulted ? 'rgba(192,132,252,0.4)' : 'rgba(192,132,252,0.25)'}`,
                  bgcolor: consulted ? 'rgba(192,132,252,0.06)' : 'transparent',
                  '&:hover': !consulted ? { borderColor: '#C084FC', bgcolor: 'rgba(192,132,252,0.04)' } : {},
                  transition: 'all 0.15s',
                }}
              >
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#C084FC' }}>
                  🩺 Talk to a pharmacist
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748B', mt: 0.25 }}>
                  {consulted ? 'Connecting…' : 'Get expert advice on exactly what to take'}
                </Typography>
              </Box>
            </Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1', mb: 0.25, fontWeight: 500 }}>
              Common medicines for{' '}
              <Box component="span" sx={{ color: '#C084FC', fontWeight: 700 }}>{label}</Box>
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#64748B', mb: 1.5 }}>
              Select all that apply — we'll find pharmacists who have them.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
              {medicines.map((m, i) => (
                <Box
                  key={i}
                  onClick={() => !dispatched && toggle(i)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25,
                    px: 1.5, py: 1, borderRadius: '8px',
                    cursor: dispatched ? 'default' : 'pointer',
                    border: `1px solid ${selected.has(i) ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    bgcolor: selected.has(i) ? 'rgba(0,229,160,0.06)' : 'transparent',
                    transition: 'all 0.15s',
                    '&:hover': !dispatched ? { borderColor: 'rgba(0,229,160,0.3)', bgcolor: 'rgba(0,229,160,0.03)' } : {},
                  }}
                >
                  <Box sx={{
                    width: 16, height: 16, borderRadius: '4px', flexShrink: 0,
                    border: `2px solid ${selected.has(i) ? '#00E5A0' : '#475569'}`,
                    bgcolor: selected.has(i) ? '#00E5A0' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {selected.has(i) && (
                      <Typography sx={{ fontSize: '0.55rem', color: '#0F172A', fontWeight: 900, lineHeight: 1 }}>✓</Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: selected.has(i) ? 600 : 400, color: selected.has(i) ? '#E0F2F1' : '#94A3B8' }}>
                      {m.name}{m.strength ? ` ${m.strength}` : ''}
                    </Typography>
                    {m.form && <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>{m.form}</Typography>}
                  </Box>
                </Box>
              ))}
            </Box>
            <Button
              variant="contained"
              fullWidth
              disabled={selected.size === 0 || dispatched}
              onClick={handleDispatch}
              sx={{
                bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700,
                textTransform: 'none', borderRadius: '10px',
                '&:hover': { bgcolor: '#00C987' },
                '&.Mui-disabled': { bgcolor: 'rgba(0,229,160,0.12)', color: '#334155' },
              }}
            >
              {dispatched
                ? 'Searching for pharmacists…'
                : selected.size === 0
                  ? 'Select at least one'
                  : `Find who has ${selected.size === 1 ? 'this' : `these ${selected.size}`} →`}
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

// ── Message bubble ──

const FEEDBACK_OPTIONS: { pattern: FailurePattern; label: string }[] = [
  { pattern: 'double_response', label: 'Double response' },
  { pattern: 'thinking_leak', label: 'Thinking leaked into reply' },
  { pattern: 'hallucination', label: 'Wrong medicine / wrong dose' },
  { pattern: 'off_topic', label: 'Off topic / not useful' },
  { pattern: 'excessive_length', label: 'Too long' },
];

function MessageBubble({ msg, onSuggestedAction, onRetry, onSpeak, isScanningMsg }: { msg: Message; onSuggestedAction?: (a: SuggestedAction) => void; onRetry?: (query: string) => void; onSpeak?: (text: string) => void; isScanningMsg?: boolean }) {
  const isUser = msg.role === 'user';
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<FailurePattern | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [actionTaken, setActionTaken] = useState(false);

  const submitFeedback = () => {
    if (!selectedPattern) return;
    reportFeedback('askrx', selectedPattern, msg.text.substring(0, 150));
    setFeedbackOpen(false);
    setFeedbackDone(true);
    setSelectedPattern(null);
  };

  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <Avatar sx={{ width: 32, height: 32, flexShrink: 0, bgcolor: isUser ? 'rgba(96,165,250,0.15)' : 'rgba(0,229,160,0.15)' }}>
        {isUser ? <PersonIcon sx={{ fontSize: 18, color: '#60A5FA' }} /> : <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />}
      </Avatar>

      {/* Outer row: bubble column + speaker button (AI only) */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', maxWidth: isUser ? '78%' : { xs: 'calc(100% - 48px)', md: 620 }, flex: isUser ? undefined : 1 }}>

        {/* Bubble + flagged indicator */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{
            px: 2, py: 1.5,
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            bgcolor: isUser ? 'rgba(96,165,250,0.1)' : msg.isError ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${isUser ? 'rgba(96,165,250,0.15)' : msg.isError ? 'rgba(239,68,68,0.2)' : msg.flagged ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            {msg.imagePreview && (
              <Box sx={{ position: 'relative', display: 'inline-block', mb: msg.text ? 1 : 0, width: '100%' }}>
                <Box component="img" src={msg.imagePreview} alt="Attached" sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: '8px', display: 'block' }} />
                {isScanningMsg && (
                  <Box sx={{ position: 'absolute', inset: 0, borderRadius: '8px', overflow: 'hidden', pointerEvents: 'none' }}>
                    <Box sx={{
                      position: 'absolute', left: 0, right: 0, height: '1.5px',
                      background: 'linear-gradient(90deg, transparent 0%, rgba(0,229,160,0.7) 30%, rgba(0,229,160,0.9) 50%, rgba(0,229,160,0.7) 70%, transparent 100%)',
                      boxShadow: '0 0 8px rgba(0,229,160,0.5), 0 0 20px rgba(0,229,160,0.2)',
                      animation: 'scanSweep 2s linear infinite',
                      '@keyframes scanSweep': {
                        '0%': { top: '-2px' },
                        '100%': { top: 'calc(100% + 2px)' },
                      },
                    }} />
                  </Box>
                )}
              </Box>
            )}
            <Typography variant="body2" sx={{ color: msg.isError ? '#FCA5A5' : '#E0F2F1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</Typography>
            {msg.isError && msg.failedQuery && onRetry && (
              <Box
                onClick={() => onRetry(msg.failedQuery!)}
                sx={{
                  mt: 1, px: 1.25, py: 0.7, borderRadius: '7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.75,
                  border: '1px solid rgba(239,68,68,0.35)', bgcolor: 'rgba(239,68,68,0.08)',
                  '&:hover': { bgcolor: 'rgba(239,68,68,0.14)', borderColor: 'rgba(239,68,68,0.5)' }, transition: 'all 0.15s',
                }}
              >
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#FCA5A5' }}>↺ Retry</Typography>
              </Box>
            )}
            {msg.suggestedAction && !isUser && (
              <Box
                onClick={() => {
                  if (actionTaken || !onSuggestedAction) return;
                  setActionTaken(true);
                  onSuggestedAction(msg.suggestedAction!);
                }}
                sx={{
                  mt: 1.25, px: 1.5, py: 0.9, borderRadius: '8px', cursor: actionTaken ? 'default' : 'pointer',
                  border: `1px solid ${actionTaken ? 'rgba(0,229,160,0.15)' : 'rgba(0,229,160,0.35)'}`,
                  bgcolor: actionTaken ? 'rgba(0,229,160,0.03)' : 'rgba(0,229,160,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s',
                  '&:hover': !actionTaken ? { bgcolor: 'rgba(0,229,160,0.12)', borderColor: '#00E5A0' } : {},
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: actionTaken ? '#475569' : '#00E5A0' }}>
                  {actionTaken
                    ? 'On it…'
                    : msg.suggestedAction.medicines.length === 1
                      ? `Find ${msg.suggestedAction.medicines[0].name} near me`
                      : msg.suggestedAction.medicines.length === 2
                        ? `Find ${msg.suggestedAction.medicines[0].name} & ${msg.suggestedAction.medicines[1].name}`
                        : `Find these ${msg.suggestedAction.medicines.length} medicines`}
                </Typography>
                {!actionTaken && <Typography sx={{ fontSize: '0.8rem', color: '#00E5A0' }}>→</Typography>}
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isUser ? 'flex-end' : 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.6rem', color: '#475569' }}>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
              {msg.role === 'ai' && (
                <Box sx={{ ml: 'auto' }}>
                  {!feedbackDone ? (
                    <IconButton size="small" onClick={() => setFeedbackOpen(true)} sx={{ p: 0.25, color: '#334155', '&:hover': { color: '#FBBF24' } }}>
                      <ThumbDownOutlinedIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  ) : (
                    <Typography sx={{ fontSize: '0.6rem', color: '#475569' }}>feedback logged</Typography>
                  )}
                </Box>
              )}
            </Box>
          </Box>
          {msg.role === 'ai' && msg.flagged && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: '6px', bgcolor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <Typography sx={{ fontSize: '0.6rem' }}>⚠️</Typography>
              <Typography sx={{ fontSize: '0.62rem', color: '#FBBF24', fontWeight: 600 }}>AI response flagged for review</Typography>
              {msg.patternsDetected && msg.patternsDetected.length > 0 && (
                <Typography sx={{ fontSize: '0.58rem', color: '#64748B' }}>({msg.patternsDetected.join(', ')})</Typography>
              )}
            </Box>
          )}
        </Box>

        {/* Prominent speak button — beside the bubble, visible to everyone */}
        {msg.role === 'ai' && onSpeak && (
          <IconButton
            onClick={() => onSpeak(msg.text)}
            sx={{
              flexShrink: 0,
              width: 42,
              height: 42,
              bgcolor: 'rgba(0,229,160,0.1)',
              border: '1px solid rgba(0,229,160,0.25)',
              borderRadius: '12px',
              color: '#00E5A0',
              '&:hover': { bgcolor: 'rgba(0,229,160,0.22)', borderColor: '#00E5A0', transform: 'scale(1.06)' },
              '&:active': { transform: 'scale(0.96)' },
              transition: 'all 0.15s',
            }}
          >
            <VolumeUpIcon sx={{ fontSize: 22 }} />
          </IconButton>
        )}
      </Box>

      {feedbackOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }} onClick={() => setFeedbackOpen(false)}>
          <Box onClick={(e) => e.stopPropagation()} sx={{ bgcolor: '#0D1526', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', p: 2.5, maxWidth: 340, width: '100%' }}>
            <Typography sx={{ fontWeight: 700, color: '#E0F2F1', mb: 0.5 }}>What went wrong?</Typography>
            <Typography sx={{ color: '#64748B', fontSize: '0.75rem', mb: 1.5 }}>Your feedback helps improve Gemma 4 responses.</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
              {FEEDBACK_OPTIONS.map(({ pattern, label }) => (
                <Box key={pattern} onClick={() => setSelectedPattern(pattern)}
                  sx={{ px: 1.5, py: 1, borderRadius: '8px', cursor: 'pointer', border: `1px solid ${selectedPattern === pattern ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.07)'}`, bgcolor: selectedPattern === pattern ? 'rgba(192,132,252,0.08)' : 'transparent', '&:hover': { borderColor: 'rgba(192,132,252,0.3)' } }}>
                  <Typography sx={{ fontSize: '0.82rem', color: selectedPattern === pattern ? '#C084FC' : '#94A3B8', fontWeight: selectedPattern === pattern ? 600 : 400 }}>{label}</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button fullWidth variant="outlined" size="small" onClick={() => setFeedbackOpen(false)} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#64748B', textTransform: 'none' }}>Cancel</Button>
              <Button fullWidth variant="contained" size="small" disabled={!selectedPattern} onClick={submitFeedback} sx={{ bgcolor: '#C084FC', '&:hover': { bgcolor: '#A855F7' }, textTransform: 'none', fontWeight: 700, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.05)', color: '#334155' } }}>Submit</Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
