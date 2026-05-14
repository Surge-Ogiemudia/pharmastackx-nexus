'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  CircularProgress,
  Chip,
  Button,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseIcon from '@mui/icons-material/Close';
import MicIcon from '@mui/icons-material/Mic';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { reportFeedback, type FailurePattern } from '@/lib/nexus-safety';
import type { ConsultResult } from '@/lib/nexus-brain';

interface Message {
  id: string;
  role: 'user' | 'ai' | 'pharmacist' | 'system';
  text: string;
  imagePreview?: string;
  timestamp: Date;
  flagged?: boolean;
  patternsDetected?: FailurePattern[];
}

const SUGGESTED_QUESTIONS = [
  'Can I take paracetamol and ibuprofen together?',
  'What are the side effects of Amlodipine?',
  'Is Augmentin safe during pregnancy?',
  'What is the difference between Diamicron and Metformin?',
  'How should I store insulin at home?',
];

export default function AskRXPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [consultationRoom, setConsultationRoom] = useState<string | null>(null);
  const [pharmacistJoined, setPharmacistJoined] = useState(false);
  const [isPharmacistView, setIsPharmacistView] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechLang, setSpeechLang] = useState('en-US');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const { brain, logger } = useNexusBrain();

  // Read URL params on mount — avoids useSearchParams Suspense requirement
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const pharmacist = params.get('pharmacist') === 'true';
    setRoomId(room);
    setIsPharmacistView(pharmacist);

    if (pharmacist && room) {
      // Load conversation history from localStorage
      const stored = localStorage.getItem(`psx_room_${room}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((m: Message & { timestamp: string }) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })));
      }

      // Open channel, announce arrival, listen for live patient messages
      const ch = new BroadcastChannel(`psx_${room}`);
      channelRef.current = ch;
      ch.postMessage({ type: 'pharmacist_joined' });

      ch.onmessage = (e) => {
        if (e.data.type === 'patient_message' || e.data.type === 'ai_message') {
          setMessages((prev) => [
            ...prev,
            {
              id: `live_${Date.now()}_${Math.random()}`,
              role: e.data.type === 'ai_message' ? 'ai' : 'user',
              text: e.data.text,
              timestamp: new Date(e.data.timestamp),
            },
          ]);
        }
      };

      return () => ch.close();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Keep localStorage in sync — strip imagePreview to avoid 5MB quota overflow
  useEffect(() => {
    if (consultationRoom) {
      const forStorage = messages.map((m) => ({ id: m.id, role: m.role, text: m.text, timestamp: m.timestamp }));
      localStorage.setItem(`psx_room_${consultationRoom}`, JSON.stringify(forStorage));
    }
  }, [messages, consultationRoom]);

  // ── Image selection — compress to ≤800px so vision API doesn't choke on 5MB phone photos ──

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
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setAttachedImage({ base64: compressed, mimeType: 'image/jpeg', preview: dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ── Voice input — Gemma 4 E2B corrects medical terms after transcription ──

  const toggleRecording = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      logger.emit('ERROR', 'Voice input not supported in this browser — try Chrome or Edge');
      return;
    }

    transcriptRef.current = '';
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = speechLang;
    recognitionRef.current = recognition;

    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const transcript = Array.from(e.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join('');
      transcriptRef.current = transcript;
      setInput(transcript); // show live interim text as user speaks
    };

    recognition.onend = async () => {
      setRecording(false);
      const raw = transcriptRef.current.trim();
      if (!raw) return;
      // Hand off to Gemma 4 E2B to fix medical terminology
      setTranscribing(true);
      const corrected = await brain.correctTranscript(raw, speechLang);
      setInput(corrected);
      setTranscribing(false);
      transcriptRef.current = '';
    };

    recognition.onerror = () => {
      setRecording(false);
      setTranscribing(false);
    };

    recognition.start();
    setRecording(true);
  };

  // ── Patient: send to AI (and broadcast to pharmacist if in a room) ──

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    const image = attachedImage;
    if (!messageText && !image) return;
    if (loading) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: messageText,
      imagePreview: image?.preview,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);

    if (channelRef.current && pharmacistJoined) {
      channelRef.current.postMessage({
        type: 'patient_message',
        text: messageText || '📷 [Image attached]',
        timestamp: new Date().toISOString(),
      });
    }

    setLoading(true);
    try {
      const history = messages
        .filter((m) => (m.role === 'user' || m.role === 'ai') && m.text.length > 3)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      const result: ConsultResult = image
        ? await brain.consultWithImage(messageText || 'What is this?', image.base64, image.mimeType, history)
        : await brain.consult(messageText, history);
      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        role: 'ai',
        text: result.text,
        timestamp: new Date(),
        flagged: result.flagged,
        patternsDetected: result.patternsDetected,
      };
      setMessages((prev) => [...prev, aiMsg]);

      if (channelRef.current && pharmacistJoined) {
        channelRef.current.postMessage({
          type: 'ai_message',
          text: result.text,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `AskRX Error: ${errorMessage}`);
      setMessages((prev) => [...prev, {
        id: `err_${Date.now()}`,
        role: 'ai',
        text: errorMessage,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Patient: open pharmacist console in new tab ──

  const connectToPharmacist = () => {
    const room = `room_${Date.now()}`;
    setConsultationRoom(room);
    localStorage.setItem(`psx_room_${room}`, JSON.stringify(messages));

    const ch = new BroadcastChannel(`psx_${room}`);
    channelRef.current = ch;

    ch.onmessage = (e) => {
      if (e.data.type === 'pharmacist_joined') {
        setPharmacistJoined(true);
        setMessages((prev) => [...prev, {
          id: `sys_${Date.now()}`,
          role: 'system',
          text: '✅ A licensed pharmacist has joined your consultation.',
          timestamp: new Date(),
        }]);
      }
      if (e.data.type === 'pharmacist_message') {
        setMessages((prev) => [...prev, {
          id: `pharm_${Date.now()}`,
          role: 'pharmacist',
          text: e.data.text,
          timestamp: new Date(e.data.timestamp),
        }]);
      }
    };

    window.open(`/ask-rx?room=${room}&pharmacist=true`, '_blank');
  };

  // ── Pharmacist: send reply to patient ──

  const sendPharmacistReply = () => {
    const replyText = input.trim();
    if (!replyText || !channelRef.current) return;
    setInput('');

    const msg: Message = {
      id: `pharm_${Date.now()}`,
      role: 'pharmacist',
      text: replyText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, msg]);

    channelRef.current.postMessage({
      type: 'pharmacist_message',
      text: replyText,
      timestamp: new Date().toISOString(),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isPharmacistView ? sendPharmacistReply() : sendMessage();
    }
  };

  // ── Pharmacist console view ──

  if (isPharmacistView) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{
          px: 3, py: 2, flexShrink: 0,
          borderBottom: '1px solid rgba(0,229,160,0.15)',
          display: 'flex', alignItems: 'center', gap: 2,
          bgcolor: 'rgba(0,229,160,0.03)',
        }}>
          <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(0,229,160,0.1)' }}>
            <LocalPharmacyIcon sx={{ color: '#00E5A0', fontSize: 24 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
              Pharmacist Console
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
              Live consultation — full conversation visible below
            </Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Chip
            label="LIVE"
            size="small"
            sx={{
              bgcolor: 'rgba(0,229,160,0.15)', color: '#00E5A0', fontWeight: 700,
              animation: 'livePulse 2s ease-in-out infinite',
              '@keyframes livePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
            }}
          />
        </Box>

        <Box ref={scrollRef} sx={{ flex: 1, overflow: 'auto', px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: '0.7rem', color: '#475569', textAlign: 'center', mb: 1 }}>
            — Patient conversation history —
          </Typography>
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <MessageBubble msg={msg} />
              </motion.div>
            ))}
          </AnimatePresence>
        </Box>

        <Box sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,229,160,0.15)', flexShrink: 0, bgcolor: 'rgba(0,229,160,0.02)' }}>
          <Typography sx={{ fontSize: '0.7rem', color: '#00E5A0', fontWeight: 700, mb: 1 }}>
            Reply as Licensed Pharmacist
          </Typography>
          <Box sx={{
            display: 'flex', gap: 1, alignItems: 'flex-end',
            bgcolor: 'rgba(15,23,42,0.6)', borderRadius: '12px',
            border: '1px solid rgba(0,229,160,0.2)', px: 2, py: 1,
            '&:focus-within': { borderColor: 'rgba(0,229,160,0.5)' },
            transition: 'border-color 0.2s',
          }}>
            <TextField
              fullWidth multiline maxRows={4}
              placeholder="Type your clinical response..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              variant="standard"
              slotProps={{ input: { disableUnderline: true, sx: { color: '#E0F2F1', fontSize: '0.9rem' } } }}
              sx={{ flex: 1 }}
            />
            <IconButton onClick={sendPharmacistReply} disabled={!input.trim()} sx={{ color: input.trim() ? '#00E5A0' : '#475569' }}>
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Patient view (default) ──

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        px: 3, py: 2, flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 2,
      }}>
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(96,165,250,0.1)' }}>
          <SmartToyIcon sx={{ color: '#60A5FA', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>AskRX</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            {pharmacistJoined ? '💊 Pharmacist is live in this consultation' : 'AI Pharmacist Consultation • Powered by Gemma 4'}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {consultationRoom && !pharmacistJoined && (
          <Chip label="Waiting for pharmacist..." size="small" sx={{ bgcolor: 'rgba(251,191,36,0.1)', color: '#FBBF24', fontSize: '0.65rem', animation: 'livePulse 2s ease-in-out infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
        )}
        {pharmacistJoined && (
          <Chip label="Pharmacist online" size="small" sx={{ bgcolor: 'rgba(0,229,160,0.1)', color: '#00E5A0', fontWeight: 700, fontSize: '0.65rem' }} />
        )}
      </Box>

      <Box ref={scrollRef} sx={{ flex: 1, overflow: 'auto', px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {messages.length === 0 && (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '16px', background: 'linear-gradient(135deg, #60A5FA 0%, #00E5A0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 30px rgba(96,165,250,0.2)' }}>
              <SmartToyIcon sx={{ color: '#fff', fontSize: 32 }} />
            </Box>
            <Typography sx={{ color: '#64748B', textAlign: 'center', maxWidth: 400 }}>
              Ask any medicine question. I'm powered by Gemma 4 and specialize in the Nigerian pharmaceutical context.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 500 }}>
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <Chip key={i} label={q} onClick={() => sendMessage(q)} sx={{ bgcolor: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)', color: '#94A3B8', fontSize: '0.75rem', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(96,165,250,0.15)', color: '#E0F2F1' } }} />
              ))}
            </Box>
          </Box>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {msg.role === 'system' ? (
                <Box sx={{ textAlign: 'center', py: 0.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#00E5A0', fontStyle: 'italic' }}>{msg.text}</Typography>
                </Box>
              ) : (
                <MessageBubble
                  msg={msg}
                  onConnect={msg.role === 'ai' && !consultationRoom ? connectToPharmacist : undefined}
                />
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
                <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.8rem' }}>Gemma 4 is thinking...</Typography>
              </Box>
            </Box>
          </motion.div>
        )}
      </Box>

      <Box sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {/* Image preview */}
        {attachedImage && (
          <Box sx={{ mb: 1.5, position: 'relative', display: 'inline-block' }}>
            <Box
              component="img"
              src={attachedImage.preview}
              alt="Attached"
              sx={{ height: 72, borderRadius: '8px', display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <IconButton
              size="small"
              onClick={() => setAttachedImage(null)}
              sx={{
                position: 'absolute', top: -8, right: -8,
                bgcolor: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.15)',
                width: 20, height: 20, p: 0,
                '&:hover': { bgcolor: 'rgba(239,68,68,0.3)' },
              }}
            >
              <CloseIcon sx={{ fontSize: 12, color: '#94A3B8' }} />
            </IconButton>
          </Box>
        )}
        {/* Language selector — only visible when mic is active or about to be used */}
        <Box sx={{ display: 'flex', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
          {[
            { code: 'en-US', label: 'EN' },
            { code: 'yo', label: 'Yoruba' },
            { code: 'ig', label: 'Igbo' },
            { code: 'ha', label: 'Hausa' },
          ].map((lang) => (
            <Chip
              key={lang.code}
              label={lang.label}
              size="small"
              onClick={() => setSpeechLang(lang.code)}
              sx={{
                fontSize: '0.65rem',
                height: 20,
                cursor: 'pointer',
                bgcolor: speechLang === lang.code ? 'rgba(192,132,252,0.15)' : 'rgba(255,255,255,0.04)',
                color: speechLang === lang.code ? '#C084FC' : '#475569',
                border: `1px solid ${speechLang === lang.code ? 'rgba(192,132,252,0.4)' : 'rgba(255,255,255,0.06)'}`,
                fontWeight: speechLang === lang.code ? 700 : 400,
                '&:hover': { bgcolor: 'rgba(192,132,252,0.1)', color: '#C084FC' },
              }}
            />
          ))}
          <Typography sx={{ fontSize: '0.6rem', color: '#334155', alignSelf: 'center', ml: 0.5 }}>
            voice language
          </Typography>
        </Box>

        <Box sx={{
          display: 'flex', gap: 1, alignItems: 'flex-end',
          bgcolor: 'rgba(15,23,42,0.6)', borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)', px: 2, py: 1,
          transition: 'border-color 0.2s ease',
          '&:focus-within': { borderColor: 'rgba(0,229,160,0.3)' },
        }}>
          <input type="file" accept="image/*" hidden ref={fileInputRef} onChange={handleImageSelect} />
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            size="small"
            sx={{ color: attachedImage ? '#60A5FA' : '#475569', '&:hover': { color: '#60A5FA' }, flexShrink: 0 }}
          >
            <CameraAltIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <IconButton
            onClick={toggleRecording}
            disabled={transcribing}
            size="small"
            sx={{
              flexShrink: 0,
              color: recording ? '#EF4444' : transcribing ? '#C084FC' : '#475569',
              '&:hover': { color: recording ? '#F87171' : '#C084FC' },
              ...((recording || transcribing) && {
                animation: 'micPulse 1s ease-in-out infinite',
                '@keyframes micPulse': {
                  '0%,100%': { opacity: 1, transform: 'scale(1)' },
                  '50%': { opacity: 0.6, transform: 'scale(1.2)' },
                },
              }),
            }}
          >
            <MicIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <TextField
            fullWidth multiline maxRows={4}
            placeholder={
              transcribing ? 'Gemma 4 is fixing medical terms...' :
              recording ? 'Listening — speak now...' :
              pharmacistJoined ? 'Message the pharmacist...' :
              'Ask any medicine question or snap a drug image...'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="standard"
            slotProps={{ input: { disableUnderline: true, sx: { color: '#E0F2F1', fontSize: '0.9rem' } } }}
            sx={{ flex: 1 }}
          />
          <IconButton
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !attachedImage) || loading}
            sx={{ color: (input.trim() || attachedImage) ? '#00E5A0' : '#475569', '&:hover': { color: '#4ADE80' }, flexShrink: 0 }}
          >
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

// ── Shared message bubble ──

const FEEDBACK_OPTIONS: { pattern: FailurePattern; label: string }[] = [
  { pattern: 'double_response', label: 'Double response' },
  { pattern: 'thinking_leak', label: 'Thinking leaked into reply' },
  { pattern: 'hallucination', label: 'Wrong medicine / wrong dose' },
  { pattern: 'off_topic', label: 'Off topic / not useful' },
  { pattern: 'excessive_length', label: 'Too long' },
];

function MessageBubble({ msg, onConnect }: { msg: Message; onConnect?: () => void }) {
  const isUser = msg.role === 'user';
  const isPharmacist = msg.role === 'pharmacist';
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
      <Avatar sx={{
        width: 32, height: 32, flexShrink: 0,
        bgcolor: isUser ? 'rgba(96,165,250,0.15)' : isPharmacist ? 'rgba(0,229,160,0.2)' : 'rgba(0,229,160,0.15)',
      }}>
        {isUser
          ? <PersonIcon sx={{ fontSize: 18, color: '#60A5FA' }} />
          : isPharmacist
          ? <LocalPharmacyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />
          : <SmartToyIcon sx={{ fontSize: 18, color: '#00E5A0' }} />}
      </Avatar>

      <Box sx={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {isPharmacist && (
          <Typography sx={{ fontSize: '0.65rem', color: '#00E5A0', fontWeight: 700, ml: 0.5 }}>
            Licensed Pharmacist
          </Typography>
        )}
        <Box sx={{
          px: 2, py: 1.5,
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          bgcolor: isUser ? 'rgba(96,165,250,0.1)' : isPharmacist ? 'rgba(0,229,160,0.06)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isUser ? 'rgba(96,165,250,0.15)' : isPharmacist ? 'rgba(0,229,160,0.2)' : msg.flagged ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          {msg.imagePreview && (
            <Box
              component="img"
              src={msg.imagePreview}
              alt="Attached image"
              sx={{ maxWidth: '100%', maxHeight: 200, borderRadius: '8px', display: 'block', mb: msg.text ? 1 : 0 }}
            />
          )}
          <Typography variant="body2" sx={{ color: '#E0F2F1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {msg.text}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isUser ? 'flex-end' : 'space-between', mt: 0.5 }}>
            <Typography sx={{ fontSize: '0.6rem', color: '#475569' }}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
            {msg.role === 'ai' && !isUser && !feedbackDone && (
              <IconButton
                size="small"
                onClick={() => setFeedbackOpen(true)}
                title="Flag this response"
                sx={{ ml: 'auto', p: 0.25, color: '#334155', '&:hover': { color: '#FBBF24' } }}
              >
                <ThumbDownOutlinedIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
            {msg.role === 'ai' && feedbackDone && (
              <Typography sx={{ fontSize: '0.6rem', color: '#475569', ml: 'auto' }}>feedback logged</Typography>
            )}
          </Box>
        </Box>

        {/* Safety badge */}
        {msg.role === 'ai' && msg.flagged && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: '6px', bgcolor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <Typography sx={{ fontSize: '0.6rem' }}>⚠️</Typography>
            <Typography sx={{ fontSize: '0.62rem', color: '#FBBF24', fontWeight: 600 }}>
              AI response flagged for review
            </Typography>
            {msg.patternsDetected && msg.patternsDetected.length > 0 && (
              <Typography sx={{ fontSize: '0.58rem', color: '#64748B' }}>
                ({msg.patternsDetected.join(', ')})
              </Typography>
            )}
          </Box>
        )}

        {msg.role === 'ai' && onConnect && (
          <Button
            size="small"
            startIcon={<LocalPharmacyIcon sx={{ fontSize: '14px !important' }} />}
            onClick={onConnect}
            sx={{
              alignSelf: 'flex-start', fontSize: '0.65rem', fontWeight: 600,
              color: '#00E5A0', textTransform: 'none',
              px: 1.25, py: 0.4, borderRadius: '8px',
              border: '1px solid rgba(0,229,160,0.2)',
              bgcolor: 'rgba(0,229,160,0.04)',
              '&:hover': { bgcolor: 'rgba(0,229,160,0.1)', borderColor: 'rgba(0,229,160,0.4)' },
            }}
          >
            Connect to a real pharmacist →
          </Button>
        )}
      </Box>

      {/* Feedback modal */}
      {feedbackOpen && (
        <Box
          sx={{
            position: 'fixed', inset: 0, zIndex: 1300,
            bgcolor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            p: 2,
          }}
          onClick={() => setFeedbackOpen(false)}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              bgcolor: '#0D1526', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', p: 2.5, maxWidth: 340, width: '100%',
            }}
          >
            <Typography sx={{ fontWeight: 700, color: '#E0F2F1', mb: 0.5, fontSize: '0.95rem' }}>
              What went wrong?
            </Typography>
            <Typography sx={{ color: '#64748B', fontSize: '0.75rem', mb: 1.5 }}>
              Your feedback helps improve Gemma 4 responses.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
              {FEEDBACK_OPTIONS.map(({ pattern, label }) => (
                <Box
                  key={pattern}
                  onClick={() => setSelectedPattern(pattern)}
                  sx={{
                    px: 1.5, py: 1, borderRadius: '8px', cursor: 'pointer',
                    border: `1px solid ${selectedPattern === pattern ? 'rgba(192,132,252,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    bgcolor: selectedPattern === pattern ? 'rgba(192,132,252,0.08)' : 'transparent',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: 'rgba(192,132,252,0.3)', bgcolor: 'rgba(192,132,252,0.04)' },
                  }}
                >
                  <Typography sx={{ fontSize: '0.82rem', color: selectedPattern === pattern ? '#C084FC' : '#94A3B8', fontWeight: selectedPattern === pattern ? 600 : 400 }}>
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                fullWidth
                variant="outlined"
                size="small"
                onClick={() => setFeedbackOpen(false)}
                sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#64748B', textTransform: 'none', fontSize: '0.8rem' }}
              >
                Cancel
              </Button>
              <Button
                fullWidth
                variant="contained"
                size="small"
                disabled={!selectedPattern}
                onClick={submitFeedback}
                sx={{ bgcolor: '#C084FC', '&:hover': { bgcolor: '#A855F7' }, textTransform: 'none', fontSize: '0.8rem', fontWeight: 700, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.05)', color: '#334155' } }}
              >
                Submit
              </Button>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
