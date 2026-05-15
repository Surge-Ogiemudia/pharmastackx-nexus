'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box, Typography, TextField, IconButton, Avatar, CircularProgress,
  Chip, Button, Select, MenuItem, Dialog, DialogContent,
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
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { reportFeedback, type FailurePattern } from '@/lib/nexus-safety';
import { useRouter } from 'next/navigation';
import type { ConsultResult, Medicine } from '@/lib/nexus-brain';
import type { PharmacistResponse } from '@/lib/dispatch-store';

type MessageRole = 'user' | 'ai' | 'system' | 'dispatch' | 'suggestion';

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
}

const SUGGESTED = [
  'I need coartem',
  'Find me amoxicillin 500mg',
  'What are side effects of metformin?',
  'Is ibuprofen safe during pregnancy?',
  'I need something for high BP',
];

// Returns true if message looks like a medicine request (not a question)
function looksLikeRequest(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (/^(what is|what are|how do|how does|how to|why is|why does|is it|is this|are there|can i take|can you|should i|tell me|explain|i wonder)/i.test(q)) return false;
  if (/(side effect|adverse|dosage|dose of|interact|overdose|pregnant|safe during|how to take|how long|difference between|\bvs\b|versus)/i.test(q)) return false;
  return true;
}

export default function NexusPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
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

  const addMsg = (msg: Omit<Message, 'id' | 'timestamp'>) =>
    setMessages((prev) => [...prev, { ...msg, id: `${msg.role}_${Date.now()}_${Math.random()}`, timestamp: new Date() }]);

  // ── Image handling ──
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        setAttachedImage({ base64: canvas.toDataURL('image/jpeg', 0.82), mimeType: 'image/jpeg', preview: dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Voice input ──
  const toggleRecording = () => {
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { logger.emit('ERROR', 'Voice input not supported in this browser'); return; }
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
      setInput(corrected);
      setTranscribing(false);
      transcriptRef.current = '';
    };
    recognition.onerror = () => { setRecording(false); setTranscribing(false); };
    recognition.start();
    setRecording(true);
  };

  // ── Dispatch ──
  const doDispatch = async (medicines: Medicine[], state: string, phone: string) => {
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicines, userState: state, userPhone: phone }),
      });
      if (!res.ok) throw new Error('Dispatch failed');
      const { requestId } = await res.json();
      addMsg({ role: 'dispatch', text: '', medicines, requestId });
    } catch {
      addMsg({ role: 'ai', text: 'Could not reach pharmacists right now. Please try again.' });
    }
  };

  const triggerDispatch = async (medicines: Medicine[]) => {
    if (userState && userPhone) {
      await doDispatch(medicines, userState, userPhone);
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

  const consultFromCondition = async (query: string) => {
    setLoading(true);
    try {
      const history = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      const result: ConsultResult = await brain.consult(query, history);
      addMsg({ role: 'ai', text: result.text, flagged: result.flagged, patternsDetected: result.patternsDetected });
    } catch (err) {
      addMsg({ role: 'ai', text: err instanceof Error ? err.message : 'Could not connect. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Send message ──
  const sendMessage = async (text?: string) => {
    const messageText = text ?? input.trim();
    const image = attachedImage;
    if (!messageText && !image) return;
    if (loading || extracting) return;

    addMsg({ role: 'user', text: messageText, imagePreview: image?.preview });
    setInput('');
    setAttachedImage(null);

    // Image path: try medicine scan first, fall back to visual consultation
    if (image) {
      setLoading(true);
      try {
        const scanRes = await fetch('/api/scan-med', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: image.base64 }),
        });
        if (scanRes.ok) {
          const { medicines }: { medicines: Medicine[] } = await scanRes.json();
          if (medicines?.length > 0) {
            const names = medicines.map((m) => m.name).join(', ');
            addMsg({ role: 'ai', text: `Identified: ${names}. Searching for nearby pharmacists…` });
            setLoading(false);
            await triggerDispatch(medicines);
            return;
          }
        }
      } catch { /* fall through */ }
      // Visual consultation fallback
      try {
        const history = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
          .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
        const result: ConsultResult = await brain.consultWithImage(messageText || 'What is this?', image.base64, image.mimeType, history);
        addMsg({ role: 'ai', text: result.text, flagged: result.flagged, patternsDetected: result.patternsDetected });
      } catch (err) {
        addMsg({ role: 'ai', text: err instanceof Error ? err.message : 'Error processing image' });
      }
      setLoading(false);
      return;
    }

    // Text path: check intent
    if (looksLikeRequest(messageText)) {
      setExtracting(true);
      try {
        const extractRes = await fetch('/api/extract-medicines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: messageText }),
        });
        if (extractRes.ok) {
          const { medicines, needsConfirmation, condition }: { medicines: Medicine[]; needsConfirmation: boolean; condition?: string } = await extractRes.json();
          if (medicines?.length > 0) {
            setExtracting(false);
            if (needsConfirmation) {
              addMsg({ role: 'suggestion', text: '', suggestedMedicines: medicines, condition, originalQuery: messageText });
            } else {
              await triggerDispatch(medicines);
            }
            return;
          }
        }
      } catch { /* fall through */ }
      setExtracting(false);
      // Looked like a request but no medicine found — ask for clarification
      addMsg({ role: 'ai', text: "I couldn't identify a specific medicine in that. Could you name the medicine you need? For example: \"I need amoxicillin 500mg\"." });
      return;
    }

    // Consultation
    setLoading(true);
    try {
      const history = messages.filter((m) => m.role === 'user' || m.role === 'ai').slice(-6)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      const result: ConsultResult = await brain.consult(messageText, history);
      addMsg({ role: 'ai', text: result.text, flagged: result.flagged, patternsDetected: result.patternsDetected });
    } catch (err) {
      addMsg({ role: 'ai', text: err instanceof Error ? err.message : 'Unknown error' });
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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                  onDispatch={(meds) => triggerDispatch(meds)}
                  onConsult={() => consultFromCondition(msg.originalQuery ?? msg.text)}
                />
              ) : msg.role === 'system' ? (
                <Box sx={{ textAlign: 'center', py: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#00E5A0', fontStyle: 'italic' }}>{msg.text}</Typography>
                </Box>
              ) : (
                <MessageBubble msg={msg} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {(loading || extracting) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(0,229,160,0.15)' }}>
                <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
              </Avatar>
              <Box sx={{ px: 2, py: 1.5, borderRadius: '4px 16px 16px 16px', bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} sx={{ color: '#00E5A0' }} />
                <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.8rem' }}>
                  {extracting ? 'Identifying medicines…' : 'Gemma 4 is thinking…'}
                </Typography>
              </Box>
            </Box>
          </motion.div>
        )}
      </Box>

      {/* Input */}
      <Box sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
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
            sx={{ fontSize: '0.7rem', height: 24, color: '#C084FC', bgcolor: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.25)', borderRadius: '8px', '& .MuiOutlinedInput-notchedOutline': { border: 'none' }, '& .MuiSelect-select': { py: 0, px: 1 }, '& .MuiSvgIcon-root': { color: '#C084FC', fontSize: 16 } }}
            MenuProps={{ slotProps: { paper: { sx: { bgcolor: '#1A2540', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', mt: 0.5, '& .MuiMenuItem-root': { fontSize: '0.8rem', color: '#CBD5E1', py: 0.75, '&:hover': { bgcolor: 'rgba(192,132,252,0.1)', color: '#E0F2F1' }, '&.Mui-selected': { bgcolor: 'rgba(192,132,252,0.15)', color: '#C084FC', fontWeight: 700 } } } } } }}>
            <MenuItem value="en-US">English</MenuItem>
            <MenuItem value="fr-FR">French</MenuItem>
            <MenuItem value="es-ES">Spanish</MenuItem>
            <MenuItem value="ar">Arabic</MenuItem>
            <MenuItem value="pt-BR">Portuguese</MenuItem>
            <MenuItem value="sw">Swahili</MenuItem>
            <MenuItem value="yo">Yoruba</MenuItem>
            <MenuItem value="ig">Igbo</MenuItem>
            <MenuItem value="ha">Hausa</MenuItem>
          </Select>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', bgcolor: 'rgba(15,23,42,0.6)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', px: 2, py: 1, transition: 'border-color 0.2s ease', '&:focus-within': { borderColor: 'rgba(0,229,160,0.3)' } }}>
          <input type="file" accept="image/*" capture="environment" hidden ref={fileInputRef} onChange={handleImageSelect} />
          <IconButton onClick={() => fileInputRef.current?.click()} size="small"
            sx={{ color: attachedImage ? '#60A5FA' : '#475569', '&:hover': { color: '#60A5FA' }, flexShrink: 0 }}>
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
          <IconButton onClick={() => sendMessage()} disabled={(!input.trim() && !attachedImage) || loading || extracting}
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
              <Box key={i} sx={{ p: 1.5, borderRadius: '10px', bgcolor: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.15)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#E0F2F1' }}>{r.pharmacistName}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>{r.pharmacistAddress} · {r.distance}km</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#00E5A0', mt: 0.25 }}>{r.price.toLocaleString()}</Typography>
                </Box>
                <Button variant="contained" size="small" onClick={() => onSelect(r)}
                  sx={{ bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: '#00C987' }, flexShrink: 0 }}>
                  Select →
                </Button>
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

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<FailurePattern | null>(null);
  const [feedbackDone, setFeedbackDone] = useState(false);

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
      <Box sx={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{
          px: 2, py: 1.5,
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          bgcolor: isUser ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isUser ? 'rgba(96,165,250,0.15)' : msg.flagged ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          {msg.imagePreview && <Box component="img" src={msg.imagePreview} alt="Attached" sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: '8px', display: 'block', mb: msg.text ? 1 : 0 }} />}
          <Typography variant="body2" sx={{ color: '#E0F2F1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.text}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isUser ? 'flex-end' : 'space-between', mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.6rem', color: '#475569' }}>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Typography>
            {msg.role === 'ai' && !feedbackDone && (
              <IconButton size="small" onClick={() => setFeedbackOpen(true)} sx={{ ml: 'auto', p: 0.25, color: '#334155', '&:hover': { color: '#FBBF24' } }}>
                <ThumbDownOutlinedIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
            {msg.role === 'ai' && feedbackDone && <Typography sx={{ fontSize: '0.6rem', color: '#475569', ml: 'auto' }}>feedback logged</Typography>}
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
