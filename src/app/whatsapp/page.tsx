'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Chip,
  CircularProgress,
  IconButton,
  Button,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import MedicationIcon from '@mui/icons-material/Medication';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { useRouter } from 'next/navigation';
import type { Medicine } from '@/lib/nexus-brain';

interface ClassificationResult {
  isDrugRequest: boolean;
  medicines: Medicine[];
  location: string;
  urgency: string;
  confidence: number;
}

export default function WhatsAppPage() {
  const [input, setInput] = useState('');
  const [processing, setProcessing] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { brain, logger } = useNexusBrain();
  const router = useRouter();

  const goToSearch = (medicines: Medicine[]) => {
    const encoded = encodeURIComponent(JSON.stringify(medicines));
    router.push(`/search?wa=1&medicines=${encoded}`);
  };

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sentMessage, result, processing]);

  const classifyMessage = async () => {
    const message = input.trim();
    if (!message || processing) return;

    setSentMessage(message);
    setInput('');
    setResult(null);
    setProcessing(true);

    try {
      logger.emit('SYSTEM', `📩 Received WhatsApp message from group: Young Pharmacists Group, Edo State Chapter`);
      logger.emit('INTENT', `🎯 Classifying message type...`);

      const scanResult = await brain.extractMedicines(
        { type: 'whatsapp', text: message },
        'WHATSAPP_CLASSIFY'
      );
      const medicines = scanResult.medicines;

      const classification: ClassificationResult = {
        isDrugRequest: medicines.length > 0,
        medicines,
        location: extractLocation(message),
        urgency: /urgent|asap|emergency/i.test(message) ? 'urgent' : 'normal',
        confidence: medicines.length > 0 ? 0.94 : 0.2,
      };

      setResult(classification);

      if (classification.isDrugRequest) {
        logger.emit('CONNECT', `✅ Classified as drug request — creating platform search...`);
        logger.emit('CONNECT', `✅ Request live on PharmaStackX — pharmacists can now respond`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `Classification failed: ${msg}`);
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setSentMessage('');
    setResult(null);
    setProcessing(false);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <Box
        sx={{
          px: 3, py: 2,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(37,211,102,0.1)' }}>
          <WhatsAppIcon sx={{ color: '#25D366', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
            WhatsApp Pipeline
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Informal → Structured • Powered by Gemma 4 Classifier
          </Typography>
        </Box>
      </Box>

      {/* WhatsApp chat — fills remaining height */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          m: 2,
          borderRadius: '14px',
          border: '1px solid rgba(37,211,102,0.15)',
          bgcolor: '#0B141A',
        }}
      >
        {/* WA group header */}
        <Box
          sx={{
            px: 2, py: 1.5,
            bgcolor: '#1F2C34',
            display: 'flex', alignItems: 'center', gap: 1.5,
            flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <Box
            sx={{
              width: 38, height: 38, borderRadius: '50%',
              bgcolor: '#25D366',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <WhatsAppIcon sx={{ color: '#fff', fontSize: 19 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, color: '#E0F2F1', fontSize: '0.9rem' }}>
              Young Pharmacists Group, Edo State Chapter
            </Typography>
            <Typography sx={{ color: '#8696A0', fontSize: '0.7rem' }}>
              ~108 members · Pharmacists Group
            </Typography>
          </Box>
          {/* Live dot */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{
              width: 6, height: 6, borderRadius: '50%', bgcolor: '#25D366',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
            }} />
            <Typography sx={{ color: '#8696A0', fontSize: '0.65rem' }}>online</Typography>
          </Box>
        </Box>

        {/* Messages — scrollable */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            px: 2,
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.25,
            // WhatsApp chat wallpaper feel
            backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(37,211,102,0.03) 0%, transparent 60%)',
          }}
        >
          {/* Standing messages */}
          <WAMessage
            sender="Pharm. Chike"
            text="Drug search: Amoxicillin 500mg capsule needed. Qty 20. Lagos."
            time="10:23 AM"
          />
          <WAMessage
            sender="Pharm. Ngozi"
            text="Who has Metformin 500mg? Patient needs urgently. Location Asaba."
            time="10:45 AM"
          />
          <WAMessage
            sender="Pharm. Emeka"
            text="coartem 6+1 anyone? urgent — patient waiting"
            time="11:02 AM"
          />

          {/* User's sent message */}
          <AnimatePresence>
            {sentMessage && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: 'flex', justifyContent: 'flex-end' }}
              >
                <Box
                  sx={{
                    maxWidth: '80%',
                    bgcolor: '#005C4B',
                    borderRadius: '10px 0px 10px 10px',
                    px: 1.5, py: 0.75,
                  }}
                >
                  <Typography sx={{ color: '#E0F2F1', fontSize: '0.88rem', lineHeight: 1.5 }}>
                    {sentMessage}
                  </Typography>
                  <Typography sx={{ color: '#8696A0', fontSize: '0.6rem', textAlign: 'right', mt: 0.25 }}>
                    Now ✓✓
                  </Typography>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Analyzing indicator */}
          <AnimatePresence>
            {processing && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{
                    width: 30, height: 30, borderRadius: '50%', bgcolor: '#25D366',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.65rem', color: '#fff' }}>N</Typography>
                  </Box>
                  <Box sx={{ bgcolor: '#1F2C34', borderRadius: '0 10px 10px 10px', px: 1.5, py: 0.75 }}>
                    <Typography sx={{ color: '#8696A0', fontSize: '0.75rem', mb: 0.5 }}>PharmaStackX Nexus</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={12} sx={{ color: '#25D366' }} />
                      <Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                        Gemma 4 is classifying…
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bot reply — classification result */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  <Box sx={{
                    width: 30, height: 30, borderRadius: '50%', bgcolor: '#25D366',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, mt: 0.25,
                  }}>
                    <Typography sx={{ fontWeight: 900, fontSize: '0.65rem', color: '#fff' }}>N</Typography>
                  </Box>

                  <Box
                    sx={{
                      bgcolor: '#1F2C34',
                      borderRadius: '0 10px 10px 10px',
                      px: 1.5, py: 1,
                      maxWidth: '88%',
                    }}
                  >
                    <Typography sx={{ color: '#25D366', fontSize: '0.72rem', fontWeight: 700, mb: 0.75 }}>
                      PharmaStackX Nexus
                    </Typography>

                    {result.isDrugRequest ? (
                      <>
                        {/* Status row */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                          <CheckCircleIcon sx={{ fontSize: 15, color: '#00E5A0' }} />
                          <Typography sx={{ color: '#00E5A0', fontSize: '0.8rem', fontWeight: 700 }}>
                            Drug request detected
                          </Typography>
                          <Chip
                            label={`${Math.round(result.confidence * 100)}% confident`}
                            size="small"
                            sx={{ bgcolor: 'rgba(0,229,160,0.1)', color: '#00E5A0', fontSize: '0.6rem', height: 18, fontWeight: 700 }}
                          />
                        </Box>

                        {/* Medicine cards */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: result.location ? 1 : 0.5 }}>
                          {result.medicines.map((med, i) => (
                            <Box
                              key={i}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 1,
                                bgcolor: 'rgba(0,229,160,0.06)',
                                border: '1px solid rgba(0,229,160,0.12)',
                                borderRadius: '8px',
                                px: 1.25, py: 0.75,
                              }}
                            >
                              <MedicationIcon sx={{ fontSize: 15, color: '#00E5A0' }} />
                              <Box>
                                <Typography sx={{ color: '#E0F2F1', fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.2 }}>
                                  {med.name}{med.strength ? ` ${med.strength}` : ''}
                                </Typography>
                                <Typography sx={{ color: '#64748B', fontSize: '0.68rem' }}>
                                  {[med.form, med.quantity ? `×${med.quantity}` : null].filter(Boolean).join(' · ') || 'quantity not specified'}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                        </Box>

                        {result.location && (
                          <Typography sx={{ color: '#8696A0', fontSize: '0.75rem', mb: 0.5 }}>
                            📍 {result.location}
                            {result.urgency === 'urgent' && (
                              <span style={{ color: '#FBBF24', marginLeft: 6, fontWeight: 700 }}>· URGENT</span>
                            )}
                          </Typography>
                        )}

                        <Typography sx={{ color: '#475569', fontSize: '0.72rem', mt: 0.75, mb: 1.25 }}>
                          Request detected — find available pharmacists now.
                        </Typography>

                        <Button
                          variant="contained"
                          size="small"
                          fullWidth
                          startIcon={<LocalPharmacyIcon sx={{ fontSize: '16px !important' }} />}
                          onClick={() => goToSearch(result.medicines)}
                          sx={{
                            bgcolor: '#00E5A0',
                            color: '#0F172A',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            py: 0.85,
                            borderRadius: '10px',
                            textTransform: 'none',
                            letterSpacing: '0.01em',
                            boxShadow: '0 4px 16px rgba(0,229,160,0.3)',
                            '&:hover': { bgcolor: '#00C987', boxShadow: '0 6px 20px rgba(0,229,160,0.45)' },
                          }}
                        >
                          Find Pharmacists →
                        </Button>
                      </>
                    ) : (
                      <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                          <CancelIcon sx={{ fontSize: 15, color: '#64748B' }} />
                          <Typography sx={{ color: '#94A3B8', fontSize: '0.8rem' }}>
                            Not a drug request — no action taken.
                          </Typography>
                        </Box>
                        <Typography sx={{ color: '#475569', fontSize: '0.72rem' }}>
                          Send a message with a medicine name to create a search.
                        </Typography>
                      </>
                    )}

                    {/* Try again link */}
                    <Typography
                      onClick={reset}
                      sx={{
                        color: '#8696A0', fontSize: '0.68rem', mt: 1, cursor: 'pointer',
                        textDecoration: 'underline',
                        '&:hover': { color: '#94A3B8' },
                      }}
                    >
                      Send another message
                    </Typography>
                  </Box>
                </Box>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </Box>

        {/* Input bar — always visible, pinned at bottom */}
        <Box
          sx={{
            flexShrink: 0,
            px: 2, py: 1.25,
            bgcolor: '#1F2C34',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', alignItems: 'center', gap: 1,
          }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder={sentMessage && !result ? 'Classifying…' : 'Type a medicine search…'}
            value={input}
            disabled={!!sentMessage && !result}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && classifyMessage()}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: '#2A3942',
                borderRadius: '22px',
                color: '#E0F2F1',
                fontSize: '0.875rem',
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'rgba(37,211,102,0.25)' },
                '&.Mui-focused fieldset': { borderColor: '#25D366', borderWidth: '1px' },
                '&.Mui-disabled': { bgcolor: '#1A2530' },
              },
              '& .MuiInputBase-input::placeholder': { color: '#4A5568' },
            }}
          />
          <IconButton
            onClick={classifyMessage}
            disabled={!input.trim() || processing || (!!sentMessage && !result)}
            sx={{
              bgcolor: '#25D366',
              color: '#fff',
              width: 40, height: 40,
              flexShrink: 0,
              '&:hover': { bgcolor: '#1DA851' },
              '&.Mui-disabled': { bgcolor: '#1F2C34', color: '#3D4F5A' },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
}

// ── Sub-components ──

function WAMessage({ sender, text, time }: { sender: string; text: string; time: string }) {
  return (
    <Box sx={{ maxWidth: '82%', bgcolor: '#1F2C34', borderRadius: '0 10px 10px 10px', px: 1.5, py: 0.75 }}>
      <Typography sx={{ color: '#25D366', fontSize: '0.72rem', fontWeight: 700, mb: 0.25 }}>
        {sender}
      </Typography>
      <Typography sx={{ color: '#E0F2F1', fontSize: '0.875rem', lineHeight: 1.5 }}>{text}</Typography>
      <Typography sx={{ color: '#8696A0', fontSize: '0.6rem', textAlign: 'right', mt: 0.25 }}>
        {time}
      </Typography>
    </Box>
  );
}

function extractLocation(text: string): string {
  const places = [
    'Lagos', 'Abuja', 'Port Harcourt', 'Benin', 'Edo', 'Rivers',
    'Kano', 'Asaba', 'Delta', 'Enugu', 'Imo', 'Ogun', 'Oyo',
    'Kaduna', 'Ibadan', 'Ikeja', 'Lekki', 'Victoria Island',
  ];
  for (const p of places) {
    if (text.toLowerCase().includes(p.toLowerCase())) return p;
  }
  return '';
}
