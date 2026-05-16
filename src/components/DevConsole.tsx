'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, Chip, TextField, IconButton, CircularProgress, Button } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from './NexusBrainProvider';
import type { LogType } from '@/lib/nexus-logger';
import type { FailurePattern, SafetyEvent } from '@/lib/nexus-safety';
import type { Medicine } from '@/lib/nexus-brain';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SendIcon from '@mui/icons-material/Send';
import MedicationIcon from '@mui/icons-material/Medication';

// ── Log type config ──────────────────────────────────────────────────────────

const LOG_CONFIG: Record<LogType, { icon: string; color: string; label: string }> = {
  INTENT:    { icon: '🎯', color: '#60A5FA', label: 'INTENT' },
  EXTRACT:   { icon: '💊', color: '#4ADE80', label: 'EXTRACT' },
  ROUTE:     { icon: '🔗', color: '#C084FC', label: 'ROUTE' },
  INFERENCE: { icon: '⚡', color: '#FBBF24', label: 'INFERENCE' },
  CONNECT:   { icon: '✅', color: '#00E5A0', label: 'CONNECT' },
  SYSTEM:    { icon: '⚙️', color: '#94A3B8', label: 'SYSTEM' },
  TOKEN:     { icon: '📊', color: '#F472B6', label: 'TOKEN' },
  ERROR:     { icon: '❌', color: '#EF4444', label: 'ERROR' },
};

const PATTERN_LABELS: Record<FailurePattern, string> = {
  double_response: 'Double',
  thinking_leak: 'Think Leak',
  incomplete: 'Incomplete',
  off_topic: 'Off-Topic',
  excessive_length: 'Too Long',
  preamble: 'Preamble',
  disclaimer: 'Disclaimer',
  hallucination: 'Hallucination',
  wrong_routing: 'Bad Route',
};

const SAFETY_EVENT_COLORS: Record<SafetyEvent['type'], string> = {
  detected: '#FBBF24',
  corrected: '#4ADE80',
  correction_failed: '#EF4444',
  feedback: '#C084FC',
  scanner_flagged: '#F97316',
};

const SAFETY_EVENT_ICONS: Record<SafetyEvent['type'], string> = {
  detected: '🔍',
  corrected: '✅',
  correction_failed: '⚠️',
  feedback: '👎',
  scanner_flagged: '📷',
};

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractLocation(text: string): string {
  const m = text.match(/location[:\s]+([^,.!?\n]+)/i)
    ?? text.match(/\b(lagos|abuja|kano|ibadan|manchester|london|nairobi|accra|kampala)\b/i);
  return m?.[1]?.trim() ?? '';
}

// ── WA chat types ────────────────────────────────────────────────────────────

interface WAChatMsg {
  id: string;
  from: 'incoming' | 'self' | 'bot';
  sender?: string;
  text: string;
  time: string;
}

const INITIAL_MSGS: WAChatMsg[] = [
  { id: 'init_1', from: 'incoming', sender: 'Pharm. Patel', text: 'Drug search: Amoxicillin 500mg capsule. Qty 20. Location Manchester.', time: '10:23' },
  { id: 'init_2', from: 'incoming', sender: 'Pharm. Garcia', text: 'coartem 6+1 anyone? urgent — patient waiting', time: '11:02' },
];

const QUICK_MSGS = [
  'Drug search: Coartem 6+1, Lagos',
  'Drug search: Amoxicillin 500mg',
  'Need Metformin 500mg urgently, Abuja',
  'Good morning everyone 👋',
];

// ── Dev Console ──────────────────────────────────────────────────────────────

export default function DevConsole() {
  const { logs, stats, safetyStats, inferenceMode, isOnline, brain, logger } = useNexusBrain();
  const scrollRef = useRef<HTMLDivElement>(null);
  const safetyScrollRef = useRef<HTMLDivElement>(null);
  const waChatEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'brain' | 'safety' | 'whatsapp'>('brain');

  // ── WA state ──
  const [waChatMsgs, setWaChatMsgs] = useState<WAChatMsg[]>(INITIAL_MSGS);
  const [waInput, setWaInput] = useState('');
  const [waClassifying, setWaClassifying] = useState(false);

  const addWAMsg = useCallback((msg: Omit<WAChatMsg, 'id' | 'time'>) => {
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    setWaChatMsgs((prev) => [...prev, { ...msg, id: `msg_${Date.now()}_${Math.random()}`, time: timeStr }]);
  }, []);

  // Auto-scroll Brain tab
  useEffect(() => {
    if (activeTab === 'brain' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  // Auto-scroll Safety tab
  useEffect(() => {
    if (activeTab === 'safety' && safetyScrollRef.current) {
      safetyScrollRef.current.scrollTop = safetyScrollRef.current.scrollHeight;
    }
  }, [safetyStats.recentEvents, activeTab]);

  // Auto-scroll WA chat
  useEffect(() => {
    waChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [waChatMsgs, waClassifying]);

  // ── WA pipeline handler ──
  const handleWASend = async () => {
    const text = waInput.trim();
    if (!text || waClassifying) return;

    // Add user's message to chat immediately
    addWAMsg({ from: 'self', text });
    setWaInput('');
    setWaClassifying(true);

    try {
      logger.emit('SYSTEM', `📩 WhatsApp message intercepted from group`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scanResult = await brain.extractMedicines({ type: 'whatsapp', text }, 'WHATSAPP_CLASSIFY' as any);
      const medicines: Medicine[] = scanResult.medicines;

      setWaClassifying(false);

      if (medicines.length === 0) {
        // Normal group message — no action, stays in chat as-is
        logger.emit('INTENT', `💬 Regular group message — no drug search detected`);
        return;
      }

      // ── Drug search detected ──
      logger.emit('INTENT', `🎯 Drug search detected — ${medicines.map((m) => m.name).join(', ')}`);
      logger.emit('EXTRACT', `💊 ${medicines.length} medicine(s) extracted from WhatsApp message`);

      // Auto-switch to Brain tab so judges see the pipeline
      setActiveTab('brain');

      const location = extractLocation(text) || 'Lagos';
      logger.emit('ROUTE', `📡 Dispatching to pharmacists in ${location}…`);

      // Run the dispatch pipeline (bot identity — no user input needed)
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicines,
          userState: location,
          userPhone: '+2348000000000',
          patientNotes: 'Via WhatsApp pipeline',
        }),
      });

      if (!res.ok) throw new Error('Dispatch failed');
      const { requestId } = await res.json();
      logger.emit('SYSTEM', `📋 Request ID: ${requestId} — pharmacists being notified`);

      // Poll for pharmacist responses
      await delay(2500);
      const pollRes = await fetch(`/api/dispatch/${requestId}`);
      let botReply = `📩 Request active — pharmacists in ${location} have been notified. The patient will be contacted shortly.`;

      if (pollRes.ok) {
        const data = await pollRes.json();
        const available = (data.responses ?? []).filter((r: { available: boolean }) => r.available);
        if (available.length > 0) {
          const p = available[0] as { pharmacistName: string; price: number };
          logger.emit('CONNECT', `✅ ${p.pharmacistName} — AVAILABLE — ${p.price.toLocaleString()}`);
          await delay(600);
          logger.emit('CONNECT', `✅ Request dispatched · pharmacist notified · patient will be contacted on WhatsApp`);
          botReply = `✅ Done — ${p.pharmacistName} is available in ${location}. They'll contact the patient directly.`;
        } else {
          logger.emit('ROUTE', `⏳ Pharmacists notified — awaiting confirmations`);
          await delay(600);
          logger.emit('CONNECT', `✅ Alert sent to all registered pharmacists in ${location}`);
        }
      }

      // Add bot reply to WA chat (visible when user switches back)
      addWAMsg({ from: 'bot', text: botReply });

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `WA pipeline failed: ${msg}`);
      setWaClassifying(false);
    }
  };

  const modeLabel = inferenceMode === 'cloud' ? '☁️ CLOUD' : '📱 EDGE';
  const modeColor = inferenceMode === 'cloud' ? '#60A5FA' : '#00E5A0';
  const correctionRate = safetyStats.correctionRate;

  const TABS = [
    { id: 'brain' as const,    label: '🧠 Brain' },
    { id: 'safety' as const,   label: '🛡️ Safety' },
    { id: 'whatsapp' as const, label: '📱 WA Feed' },
  ];

  return (
    <Box
      sx={{
        width: '100%', height: '100%',
        bgcolor: '#0A0F1C',
        display: 'flex', flexDirection: 'column',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#00E5A0', boxShadow: '0 0 8px #00E5A0', animation: 'pulse 2s ease-in-out infinite', '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#E0F2F1', letterSpacing: '0.05em', fontFamily: 'inherit' }}>NEXUS BRAIN v1.0</Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#64748B', fontFamily: 'inherit' }}>Gemma 4</Typography>
        </Box>
        <Chip label={modeLabel} size="small" sx={{ bgcolor: 'transparent', border: `1px solid ${modeColor}`, color: modeColor, fontSize: '0.65rem', fontWeight: 700, fontFamily: 'inherit', height: 22, '& .MuiChip-label': { px: 1 } }} />
      </Box>

      {/* ── Tab switcher ── */}
      <Box sx={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const hasBadge = tab.id === 'safety' && safetyStats.totalFailures > 0;
          return (
            <Box key={tab.id} onClick={() => setActiveTab(tab.id)}
              sx={{ flex: 1, py: 0.75, textAlign: 'center', cursor: 'pointer', borderBottom: isActive ? '2px solid #00E5A0' : '2px solid transparent', bgcolor: isActive ? 'rgba(0,229,160,0.04)' : 'transparent', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.06em', color: isActive ? '#00E5A0' : '#475569', textTransform: 'uppercase' }}>
                {tab.label}
              </Typography>
              {hasBadge && (
                <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.5rem', color: '#FBBF24', fontFamily: 'inherit', fontWeight: 700 }}>{safetyStats.totalFailures}</Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Brain tab ── */}
      {activeTab === 'brain' && (
        <>
          <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 } }}>
            <AnimatePresence initial={false}>
              {logs.map((entry) => {
                const config = LOG_CONFIG[entry.type] || LOG_CONFIG.SYSTEM;
                return (
                  <motion.div key={entry.id} initial={{ opacity: 0, y: 8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} transition={{ duration: 0.2, ease: 'easeOut' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <Typography sx={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'inherit', flexShrink: 0, mt: '1px', minWidth: 75 }}>{formatTimestamp(entry.timestamp)}</Typography>
                      <Chip label={`${config.icon} ${config.label}`} size="small" sx={{ bgcolor: `${config.color}15`, border: `1px solid ${config.color}30`, color: config.color, fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }} />
                      <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontFamily: 'inherit', lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {entry.message}
                        {entry.duration && <Typography component="span" sx={{ fontSize: '0.6rem', color: '#64748B', ml: 1, fontFamily: 'inherit' }}>({entry.duration}ms)</Typography>}
                      </Typography>
                    </Box>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {logs.length === 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'inherit' }}>Waiting for brain activity...</Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 2.5, flexShrink: 0, background: 'linear-gradient(0deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)' }}>
            <StatItem label="TOKENS" value={stats.totalTokens.toString()} color="#F472B6" />
            <StatItem label="LATENCY" value={`${stats.avgLatency}ms`} color="#FBBF24" />
            <StatItem label="CALLS" value={stats.inferenceCount.toString()} color="#60A5FA" />
            <StatItem label="STATUS" value={isOnline ? 'ONLINE' : 'OFFLINE'} color={isOnline ? '#4ADE80' : '#EF4444'} />
          </Box>
        </>
      )}

      {/* ── Safety tab ── */}
      {activeTab === 'safety' && (
        <>
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 2, flexShrink: 0, flexWrap: 'wrap' }}>
            <StatItem label="RESPONSES" value={safetyStats.totalResponses.toString()} color="#60A5FA" />
            <StatItem label="FAILURES" value={safetyStats.totalFailures.toString()} color="#FBBF24" />
            <StatItem label="CORRECTIONS" value={safetyStats.totalCorrections.toString()} color="#C084FC" />
            <StatItem label="SUCCESS RATE" value={`${correctionRate}%`} color={correctionRate >= 70 ? '#4ADE80' : correctionRate >= 40 ? '#FBBF24' : '#EF4444'} />
          </Box>
          {Object.keys(safetyStats.patternCounts).length > 0 && (
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 0.75, flexWrap: 'wrap', flexShrink: 0 }}>
              {(Object.entries(safetyStats.patternCounts) as [FailurePattern, number][]).map(([pattern, count]) => (
                <Chip key={pattern} label={`${PATTERN_LABELS[pattern] ?? pattern} ×${count}`} size="small"
                  sx={{ bgcolor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#FBBF24', fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, '& .MuiChip-label': { px: 0.75 } }} />
              ))}
            </Box>
          )}
          <Box ref={safetyScrollRef} sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 } }}>
            <AnimatePresence initial={false}>
              {safetyStats.recentEvents.map((event) => {
                const color = SAFETY_EVENT_COLORS[event.type] ?? '#94A3B8';
                const icon = SAFETY_EVENT_ICONS[event.type] ?? '🛡️';
                return (
                  <motion.div key={event.id} initial={{ opacity: 0, y: 8, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} transition={{ duration: 0.2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <Typography sx={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'inherit', flexShrink: 0, mt: '1px', minWidth: 75 }}>{formatTimestamp(event.timestamp)}</Typography>
                      <Chip label={`${icon} ${event.type.replace('_', ' ').toUpperCase()}`} size="small"
                        sx={{ bgcolor: `${color}15`, border: `1px solid ${color}30`, color, fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }} />
                      <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontFamily: 'inherit', lineHeight: 1.5, wordBreak: 'break-word' }}>{event.message}</Typography>
                    </Box>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {safetyStats.recentEvents.length === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, gap: 1 }}>
                <Typography sx={{ fontSize: '1.5rem' }}>🛡️</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'inherit', textAlign: 'center' }}>No safety events yet.{'\n'}All Gemma outputs are being monitored.</Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'linear-gradient(0deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)' }}>
            <Typography sx={{ fontSize: '0.6rem', color: '#334155', fontFamily: 'inherit', textAlign: 'center' }}>
              Nexus Safety Layer v1.0 · {safetyStats.totalResponses} responses monitored
            </Typography>
          </Box>
        </>
      )}

      {/* ── WA Feed tab ── */}
      {activeTab === 'whatsapp' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#0B141A' }}>

          {/* WA group header */}
          <Box sx={{ px: 1.5, py: 1, bgcolor: '#1F2C34', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <WhatsAppIcon sx={{ color: '#fff', fontSize: 15 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, color: '#E0F2F1', fontSize: '0.7rem', fontFamily: 'inherit' }}>Pharmacist Network Group</Typography>
              <Typography sx={{ color: '#8696A0', fontSize: '0.58rem', fontFamily: 'inherit' }}>~340 members · live feed</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#25D366', animation: 'waPulse 2s infinite', '@keyframes waPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
              <Typography sx={{ color: '#8696A0', fontSize: '0.55rem', fontFamily: 'inherit' }}>online</Typography>
            </Box>
          </Box>

          {/* Messages */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 1.25, py: 1, display: 'flex', flexDirection: 'column', gap: 1, '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.08)', borderRadius: 2 } }}>
            <AnimatePresence initial={false}>
              {waChatMsgs.map((msg) => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  {msg.from === 'incoming' && (
                    <Box sx={{ maxWidth: '86%', bgcolor: '#1F2C34', borderRadius: '0 8px 8px 8px', px: 1.25, py: 0.65 }}>
                      <Typography sx={{ color: '#25D366', fontSize: '0.58rem', fontWeight: 700, mb: 0.2, fontFamily: 'inherit' }}>{msg.sender}</Typography>
                      <Typography sx={{ color: '#E0F2F1', fontSize: '0.7rem', lineHeight: 1.45, fontFamily: 'inherit' }}>{msg.text}</Typography>
                      <Typography sx={{ color: '#8696A0', fontSize: '0.52rem', textAlign: 'right', mt: 0.2, fontFamily: 'inherit' }}>{msg.time}</Typography>
                    </Box>
                  )}
                  {msg.from === 'self' && (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Box sx={{ maxWidth: '84%', bgcolor: '#005C4B', borderRadius: '10px 0 10px 10px', px: 1.25, py: 0.65 }}>
                        <Typography sx={{ color: '#E0F2F1', fontSize: '0.72rem', lineHeight: 1.5, fontFamily: 'inherit' }}>{msg.text}</Typography>
                        <Typography sx={{ color: '#8696A0', fontSize: '0.52rem', textAlign: 'right', mt: 0.2, fontFamily: 'inherit' }}>Now ✓✓</Typography>
                      </Box>
                    </Box>
                  )}
                  {msg.from === 'bot' && (
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.2 }}>
                        <Typography sx={{ fontWeight: 900, fontSize: '0.5rem', color: '#fff', fontFamily: 'inherit' }}>N</Typography>
                      </Box>
                      <Box sx={{ maxWidth: '82%', bgcolor: '#1F2C34', borderRadius: '0 8px 8px 8px', px: 1.25, py: 0.75 }}>
                        <Typography sx={{ color: '#25D366', fontSize: '0.56rem', fontWeight: 700, mb: 0.3, fontFamily: 'inherit' }}>PharmaStackX · Bot</Typography>
                        <Typography sx={{ color: '#E0F2F1', fontSize: '0.7rem', lineHeight: 1.45, fontFamily: 'inherit' }}>{msg.text}</Typography>
                        <Typography sx={{ color: '#8696A0', fontSize: '0.52rem', textAlign: 'right', mt: 0.2, fontFamily: 'inherit' }}>{msg.time}</Typography>
                      </Box>
                    </Box>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Classifying indicator */}
            <AnimatePresence>
              {waClassifying && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 900, fontSize: '0.5rem', color: '#fff', fontFamily: 'inherit' }}>N</Typography>
                    </Box>
                    <Box sx={{ bgcolor: '#1F2C34', borderRadius: '0 8px 8px 8px', px: 1.25, py: 0.65, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CircularProgress size={9} sx={{ color: '#25D366' }} />
                      <Typography sx={{ color: '#94A3B8', fontSize: '0.68rem', fontFamily: 'inherit' }}>Gemma 4 scanning…</Typography>
                    </Box>
                  </Box>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={waChatEndRef} />
          </Box>

          {/* Quick-tap chips */}
          <Box sx={{ px: 1.25, pt: 0.75, pb: 0.5, bgcolor: '#111B21', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {QUICK_MSGS.map((q) => (
              <Box key={q} onClick={() => setWaInput(q)}
                sx={{ px: 0.9, py: 0.3, borderRadius: '10px', bgcolor: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.18)', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(37,211,102,0.14)' }, transition: 'background 0.15s' }}>
                <Typography sx={{ fontSize: '0.58rem', color: '#4ADE80', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>{q}</Typography>
              </Box>
            ))}
          </Box>

          {/* Input bar */}
          <Box sx={{ flexShrink: 0, px: 1.25, py: 0.85, bgcolor: '#1F2C34', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <TextField fullWidth size="small"
              placeholder="Type a message…"
              value={waInput}
              disabled={waClassifying}
              onChange={(e) => setWaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleWASend()}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#2A3942', borderRadius: '18px', color: '#E0F2F1', fontSize: '0.7rem', fontFamily: 'inherit', '& fieldset': { borderColor: 'transparent' }, '&:hover fieldset': { borderColor: 'rgba(37,211,102,0.2)' }, '&.Mui-focused fieldset': { borderColor: '#25D366', borderWidth: '1px' }, '&.Mui-disabled': { bgcolor: '#1A2530' } },
                '& .MuiInputBase-input': { py: 0.7, fontFamily: 'inherit' },
                '& .MuiInputBase-input::placeholder': { color: '#4A5568', fontFamily: 'inherit', fontSize: '0.7rem' },
              }}
            />
            <IconButton onClick={handleWASend} disabled={!waInput.trim() || waClassifying}
              sx={{ bgcolor: '#25D366', color: '#fff', width: 32, height: 32, flexShrink: 0, '&:hover': { bgcolor: '#1DA851' }, '&.Mui-disabled': { bgcolor: '#1F2C34', color: '#3D4F5A' } }}>
              <SendIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.55rem', color: '#475569', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>{value}</Typography>
    </Box>
  );
}
