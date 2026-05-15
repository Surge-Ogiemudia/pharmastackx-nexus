'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Chip, Divider } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from './NexusBrainProvider';
import type { LogType } from '@/lib/nexus-logger';
import type { FailurePattern, SafetyEvent } from '@/lib/nexus-safety';

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
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

// ── Dev Console ──────────────────────────────────────────────────────────────

export default function DevConsole() {
  const { logs, stats, safetyStats, inferenceMode, isOnline } = useNexusBrain();
  const scrollRef = useRef<HTMLDivElement>(null);
  const safetyScrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'brain' | 'safety'>('brain');

  useEffect(() => {
    if (activeTab === 'brain' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  useEffect(() => {
    if (activeTab === 'safety' && safetyScrollRef.current) {
      safetyScrollRef.current.scrollTop = safetyScrollRef.current.scrollHeight;
    }
  }, [safetyStats.recentEvents, activeTab]);

  const modeLabel = inferenceMode === 'cloud' ? '☁️ CLOUD' : '📱 EDGE';
  const modeColor = inferenceMode === 'cloud' ? '#60A5FA' : '#00E5A0';
  const correctionRate = safetyStats.correctionRate;

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        bgcolor: '#0A0F1C',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8, height: 8, borderRadius: '50%', bgcolor: '#00E5A0',
              boxShadow: '0 0 8px #00E5A0',
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
            }}
          />
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#E0F2F1', letterSpacing: '0.05em', fontFamily: 'inherit' }}>
            NEXUS BRAIN v1.0
          </Typography>
          <Typography sx={{ fontSize: '0.65rem', color: '#64748B', fontFamily: 'inherit' }}>Gemma 4</Typography>
        </Box>
        <Chip
          label={modeLabel}
          size="small"
          sx={{ bgcolor: 'transparent', border: `1px solid ${modeColor}`, color: modeColor, fontSize: '0.65rem', fontWeight: 700, fontFamily: 'inherit', height: 22, '& .MuiChip-label': { px: 1 } }}
        />
      </Box>

      {/* ── Tab switcher ── */}
      <Box
        sx={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}
      >
        {(['brain', 'safety'] as const).map((tab) => {
          const isActive = activeTab === tab;
          const hasBadge = tab === 'safety' && safetyStats.totalFailures > 0;
          return (
            <Box
              key={tab}
              onClick={() => setActiveTab(tab)}
              sx={{
                flex: 1,
                py: 0.75,
                textAlign: 'center',
                cursor: 'pointer',
                borderBottom: isActive ? '2px solid #00E5A0' : '2px solid transparent',
                bgcolor: isActive ? 'rgba(0,229,160,0.04)' : 'transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  letterSpacing: '0.08em',
                  color: isActive ? '#00E5A0' : '#475569',
                  textTransform: 'uppercase',
                }}
              >
                {tab === 'brain' ? '🧠 Brain' : '🛡️ Safety'}
              </Typography>
              {hasBadge && (
                <Box
                  sx={{
                    width: 16, height: 16, borderRadius: '50%',
                    bgcolor: safetyStats.totalFailures > 0 ? 'rgba(251,191,36,0.2)' : 'transparent',
                    border: safetyStats.totalFailures > 0 ? '1px solid rgba(251,191,36,0.4)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Typography sx={{ fontSize: '0.5rem', color: '#FBBF24', fontFamily: 'inherit', fontWeight: 700 }}>
                    {safetyStats.totalFailures}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Brain tab ── */}
      {activeTab === 'brain' && (
        <>
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: 1.5,
              py: 1,
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
            }}
          >
            <AnimatePresence initial={false}>
              {logs.map((entry) => {
                const config = LOG_CONFIG[entry.type] || LOG_CONFIG.SYSTEM;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <Typography sx={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'inherit', flexShrink: 0, mt: '1px', minWidth: 75 }}>
                        {formatTimestamp(entry.timestamp)}
                      </Typography>
                      <Chip
                        label={`${config.icon} ${config.label}`}
                        size="small"
                        sx={{ bgcolor: `${config.color}15`, border: `1px solid ${config.color}30`, color: config.color, fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }}
                      />
                      <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontFamily: 'inherit', lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {entry.message}
                        {entry.duration && (
                          <Typography component="span" sx={{ fontSize: '0.6rem', color: '#64748B', ml: 1, fontFamily: 'inherit' }}>
                            ({entry.duration}ms)
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {logs.length === 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.3 }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'inherit' }}>
                  Waiting for brain activity...
                </Typography>
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
          {/* Stats row */}
          <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 2, flexShrink: 0, flexWrap: 'wrap' }}>
            <StatItem label="RESPONSES" value={safetyStats.totalResponses.toString()} color="#60A5FA" />
            <StatItem label="FAILURES" value={safetyStats.totalFailures.toString()} color="#FBBF24" />
            <StatItem label="CORRECTIONS" value={safetyStats.totalCorrections.toString()} color="#C084FC" />
            <StatItem label="SUCCESS RATE" value={`${correctionRate}%`} color={correctionRate >= 70 ? '#4ADE80' : correctionRate >= 40 ? '#FBBF24' : '#EF4444'} />
          </Box>

          {/* Pattern breakdown */}
          {Object.keys(safetyStats.patternCounts).length > 0 && (
            <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 0.75, flexWrap: 'wrap', flexShrink: 0 }}>
              {(Object.entries(safetyStats.patternCounts) as [FailurePattern, number][]).map(([pattern, count]) => (
                <Chip
                  key={pattern}
                  label={`${PATTERN_LABELS[pattern] ?? pattern} ×${count}`}
                  size="small"
                  sx={{ bgcolor: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#FBBF24', fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, '& .MuiChip-label': { px: 0.75 } }}
                />
              ))}
            </Box>
          )}

          {/* Live events log */}
          <Box
            ref={safetyScrollRef}
            sx={{
              flex: 1,
              overflowY: 'auto',
              px: 1.5,
              py: 1,
              '&::-webkit-scrollbar': { width: 4 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
            }}
          >
            <AnimatePresence initial={false}>
              {safetyStats.recentEvents.map((event) => {
                const color = SAFETY_EVENT_COLORS[event.type] ?? '#94A3B8';
                const icon = SAFETY_EVENT_ICONS[event.type] ?? '🛡️';
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    transition={{ duration: 0.2 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.4, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <Typography sx={{ fontSize: '0.6rem', color: '#475569', fontFamily: 'inherit', flexShrink: 0, mt: '1px', minWidth: 75 }}>
                        {formatTimestamp(event.timestamp)}
                      </Typography>
                      <Chip
                        label={`${icon} ${event.type.replace('_', ' ').toUpperCase()}`}
                        size="small"
                        sx={{ bgcolor: `${color}15`, border: `1px solid ${color}30`, color, fontSize: '0.55rem', fontWeight: 700, fontFamily: 'inherit', height: 18, flexShrink: 0, '& .MuiChip-label': { px: 0.75 } }}
                      />
                      <Typography sx={{ fontSize: '0.7rem', color: '#CBD5E1', fontFamily: 'inherit', lineHeight: 1.5, wordBreak: 'break-word' }}>
                        {event.message}
                      </Typography>
                    </Box>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {safetyStats.recentEvents.length === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, gap: 1 }}>
                <Typography sx={{ fontSize: '1.5rem' }}>🛡️</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748B', fontFamily: 'inherit', textAlign: 'center' }}>
                  No safety events yet.{'\n'}All Gemma outputs are being monitored.
                </Typography>
              </Box>
            )}
          </Box>

          {/* Footer */}
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, background: 'linear-gradient(0deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)' }}>
            <Typography sx={{ fontSize: '0.6rem', color: '#334155', fontFamily: 'inherit', textAlign: 'center' }}>
              Nexus Safety Layer v1.0 · {safetyStats.totalResponses} responses monitored
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.55rem', color: '#475569', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.75rem', color, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}
