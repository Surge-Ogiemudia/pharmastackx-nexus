'use client';

import React, { useEffect, useRef } from 'react';
import { Box, Typography, Chip, Divider } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from './NexusBrainProvider';
import type { LogType } from '@/lib/nexus-logger';

// ── Log Type Config ──────────────────────────────────────────────────────────

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

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

// ── Dev Console Component ────────────────────────────────────────────────────

export default function DevConsole() {
  const { logs, stats, inferenceMode, isOnline, edgeStatus } = useNexusBrain();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const modeLabel = inferenceMode === 'cloud' ? '☁️ CLOUD' : '📱 EDGE';
  const modeColor = inferenceMode === 'cloud' ? '#60A5FA' : '#00E5A0';

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
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: '#00E5A0',
              boxShadow: '0 0 8px #00E5A0',
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.4 },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: '#E0F2F1',
              letterSpacing: '0.05em',
              fontFamily: 'inherit',
            }}
          >
            NEXUS BRAIN v1.0
          </Typography>
          <Typography
            sx={{
              fontSize: '0.65rem',
              color: '#64748B',
              fontFamily: 'inherit',
            }}
          >
            Gemma 4
          </Typography>
        </Box>

        <Chip
          label={modeLabel}
          size="small"
          sx={{
            bgcolor: 'transparent',
            border: `1px solid ${modeColor}`,
            color: modeColor,
            fontSize: '0.65rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            height: 22,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Box>

      {/* ── Log Body ── */}
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
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1,
                    py: 0.4,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' },
                  }}
                >
                  {/* Timestamp */}
                  <Typography
                    sx={{
                      fontSize: '0.6rem',
                      color: '#475569',
                      fontFamily: 'inherit',
                      flexShrink: 0,
                      mt: '1px',
                      minWidth: 75,
                    }}
                  >
                    {formatTimestamp(entry.timestamp)}
                  </Typography>

                  {/* Type Badge */}
                  <Chip
                    label={`${config.icon} ${config.label}`}
                    size="small"
                    sx={{
                      bgcolor: `${config.color}15`,
                      border: `1px solid ${config.color}30`,
                      color: config.color,
                      fontSize: '0.55rem',
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      height: 18,
                      flexShrink: 0,
                      '& .MuiChip-label': { px: 0.75 },
                    }}
                  />

                  {/* Message */}
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      color: '#CBD5E1',
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      wordBreak: 'break-word',
                    }}
                  >
                    {entry.message}
                    {entry.duration && (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.6rem',
                          color: '#64748B',
                          ml: 1,
                          fontFamily: 'inherit',
                        }}
                      >
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

      {/* ── Footer Stats ── */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          gap: 2.5,
          flexShrink: 0,
          background: 'linear-gradient(0deg, rgba(15,23,42,1) 0%, rgba(10,15,28,1) 100%)',
        }}
      >
        <StatItem label="TOKENS" value={stats.totalTokens.toString()} color="#F472B6" />
        <StatItem label="LATENCY" value={`${stats.avgLatency}ms`} color="#FBBF24" />
        <StatItem label="CALLS" value={stats.inferenceCount.toString()} color="#60A5FA" />
        <StatItem
          label="STATUS"
          value={isOnline ? 'ONLINE' : 'OFFLINE'}
          color={isOnline ? '#4ADE80' : '#EF4444'}
        />
      </Box>
    </Box>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.55rem',
          color: '#475569',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.75rem',
          color,
          fontWeight: 700,
          fontFamily: '"JetBrains Mono", monospace',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
