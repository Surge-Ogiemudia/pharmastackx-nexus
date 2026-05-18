'use client';

import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, CardActionArea } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ChatIcon from '@mui/icons-material/Chat';
import SearchIcon from '@mui/icons-material/Search';
import Image from 'next/image';
import { useNexusBrain } from '@/components/NexusBrainProvider';

const CYCLING_WORDS = ['unfindable', 'unavailable', 'inaccessible'];

const features = [
  {
    path: '/ask-rx',
    icon: <ChatIcon sx={{ fontSize: 28 }} />,
    title: 'Nexus',
    subtitle: 'The Brain · Medicine Intelligence',
    description: 'Ask any medicine question. Gemma 4 provides instant, context-aware guidance.',
    color: '#60A5FA',
  },
  {
    path: '/search',
    icon: <SearchIcon sx={{ fontSize: 28 }} />,
    title: 'Smart Search',
    subtitle: 'Type or Scan · Pharmacist Finder',
    description: 'Search by name or photograph a box — Gemma 4 identifies the medicine and finds who has it nearby.',
    color: '#C084FC',
  },
];

function MissionStatement() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % CYCLING_WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        sx={{
          fontSize: { xs: '1.05rem', md: '1.35rem' },
          fontWeight: 300,
          color: '#94A3B8',
          lineHeight: 1.7,
          letterSpacing: '0.01em',
        }}
      >
        No patient left untreated, no medicine{' '}
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'center', minWidth: { xs: 130, md: 168 }, verticalAlign: 'bottom' }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={CYCLING_WORDS[wordIndex]}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: 'easeOut' }}
              style={{ display: 'inline-block', color: '#00E5A0', fontWeight: 600 }}
            >
              {CYCLING_WORDS[wordIndex]}
            </motion.span>
          </AnimatePresence>
        </Box>
      </Typography>
    </Box>
  );
}

function PhotoSection() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    >
      <Box
        sx={{
          width: '100%',
          mb: 2.5,
          borderRadius: '18px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0 4px 40px rgba(0,0,0,0.6)',
        }}
      >
        <Image
          src="/impactimages.png"
          alt="PharmaStackX Impact"
          width={1200}
          height={400}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 180,
            objectFit: 'cover',
            display: 'block',
            filter: 'brightness(0.55) saturate(0.7)',
          }}
          priority
        />
        {/* top fade — blends into page background */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(to bottom, #090E1A, transparent)',
        }} />
        {/* bottom fade */}
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(to top, #090E1A, transparent)',
        }} />
      </Box>
    </motion.div>
  );
}

export default function NexusHub() {
  const router = useRouter();
  const { stats, inferenceMode, isOnline } = useNexusBrain();

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        px: { xs: 3, md: 5 },
        pt: { xs: 2, md: 3 },
        pb: 4,
        background: [
          'radial-gradient(ellipse at 15% 40%, rgba(27,94,32,0.10) 0%, transparent 55%)',
          'radial-gradient(ellipse at 85% 80%, rgba(96,165,250,0.05) 0%, transparent 50%)',
        ].join(', '),
      }}
    >
      {/* ── Hero ── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 900,
              fontSize: { xs: '1.6rem', md: '2.1rem' },
              background: 'linear-gradient(135deg, #4CAF50 0%, #00E5A0 45%, #60A5FA 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              lineHeight: 1.1,
              mb: 0.5,
            }}
          >
            PharmaStackX Nexus
          </Typography>

          <MissionStatement />
        </Box>
      </motion.div>

      {/* ── Photo ── */}
      <PhotoSection />

      {/* ── Brain Status ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Card
          sx={{
            mb: 4,
            bgcolor: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(255,255,255,0.05)',
            backdropFilter: 'blur(12px)',
            borderRadius: '14px',
          }}
        >
          <CardContent sx={{ display: 'flex', gap: { xs: 3, md: 4 }, flexWrap: 'wrap', alignItems: 'center', py: '14px !important' }}>
            <StatusPill label="Brain" value="Active" color="#00E5A0" />
            <StatusPill
              label="Mode"
              value={inferenceMode === 'cloud' ? 'Cloud 26B' : 'Edge E2B'}
              color={inferenceMode === 'cloud' ? '#60A5FA' : '#00E5A0'}
            />
            <StatusPill label="Network" value={isOnline ? 'Online' : 'Offline'} color={isOnline ? '#4ADE80' : '#EF4444'} />
            <StatusPill label="Tokens" value={stats.totalTokens.toLocaleString()} color="#F472B6" />
            <StatusPill label="Latency" value={`${stats.avgLatency}ms`} color="#FBBF24" />
            <StatusPill label="Inferences" value={stats.inferenceCount.toString()} color="#60A5FA" />
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Feature Cards ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
        {features.map((feature, index) => (
          <motion.div
            key={feature.path}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
          >
            <Card
              sx={{
                bgcolor: 'rgba(15,23,42,0.55)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(10px)',
                borderRadius: '16px',
                transition: 'all 0.25s ease',
                '&:hover': {
                  border: `1px solid ${feature.color}35`,
                  boxShadow: `0 0 28px ${feature.color}12`,
                  transform: 'translateY(-3px)',
                },
              }}
            >
              <CardActionArea onClick={() => router.push(feature.path)} sx={{ p: 3, borderRadius: '16px' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: '12px',
                      bgcolor: `${feature.color}12`,
                      color: feature.color,
                      flexShrink: 0,
                      border: `1px solid ${feature.color}20`,
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#E2E8F0', mb: 0.25, fontSize: '1rem' }}>
                      {feature.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: feature.color, fontWeight: 600, mb: 0.75, fontSize: '0.75rem' }}>
                      {feature.subtitle}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#64748B', lineHeight: 1.6, fontSize: '0.8rem' }}>
                      {feature.description}
                    </Typography>
                  </Box>
                </Box>
              </CardActionArea>
            </Card>
          </motion.div>
        ))}
      </Box>

    </Box>
  );
}

function StatusPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: '0.6rem', color: '#334155', fontWeight: 700, letterSpacing: '0.07em', mb: 0.25 }}>
        {label.toUpperCase()}
      </Typography>
      <Typography sx={{ fontSize: '0.82rem', color, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
