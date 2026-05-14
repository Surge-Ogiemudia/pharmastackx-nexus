'use client';

import React from 'react';
import { Box, Typography, Card, CardContent, CardActionArea, Chip } from '@mui/material';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ChatIcon from '@mui/icons-material/Chat';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import SearchIcon from '@mui/icons-material/Search';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useNexusBrain } from '@/components/NexusBrainProvider';

const features = [
  {
    path: '/ask-rx',
    icon: <ChatIcon sx={{ fontSize: 32 }} />,
    title: 'AskRX',
    subtitle: 'AI Pharmacist Consultation',
    description: 'Ask any medicine question. Gemma 4 provides instant, context-aware guidance.',
    color: '#60A5FA',
  },
  {
    path: '/scanner',
    icon: <CameraAltIcon sx={{ fontSize: 32 }} />,
    title: 'AI Scanner',
    subtitle: 'Medicine & Prescription Reader',
    description: 'Photograph any medicine box or prescription. Gemma 4 extracts everything automatically.',
    color: '#4ADE80',
  },
  {
    path: '/search',
    icon: <SearchIcon sx={{ fontSize: 32 }} />,
    title: 'Smart Search',
    subtitle: 'Pharmacist Connection Engine',
    description: 'AI routes your request to the best pharmacists. Sorted by price, distance, and reliability.',
    color: '#C084FC',
  },
  {
    path: '/whatsapp',
    icon: <WhatsAppIcon sx={{ fontSize: 32 }} />,
    title: 'WhatsApp Pipeline',
    subtitle: 'Informal → Structured',
    description: 'Gemma 4 reads informal WhatsApp drug search messages and converts them into live requests.',
    color: '#25D366',
  },
];

export default function NexusHub() {
  const router = useRouter();
  const { stats, inferenceMode, isOnline, edgeStatus } = useNexusBrain();

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        p: { xs: 3, md: 5 },
        background: 'radial-gradient(ellipse at 20% 50%, rgba(27,94,32,0.08) 0%, transparent 60%)',
      }}
    >
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Box sx={{ mb: 5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 900,
                background: 'linear-gradient(135deg, #4CAF50 0%, #00E5A0 50%, #60A5FA 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'textPulse 4s ease-in-out infinite',
                '@keyframes textPulse': {
                  '0%, 100%': { opacity: 1, filter: 'brightness(1)' },
                  '50%': { opacity: 0.8, filter: 'brightness(1.2)' },
                },
              }}
            >
              PharmaStackX Nexus
            </Typography>
            <Chip
              label="Gemma 4"
              size="small"
              sx={{
                bgcolor: 'rgba(0,229,160,0.1)',
                border: '1px solid rgba(0,229,160,0.3)',
                color: '#00E5A0',
                fontWeight: 700,
                fontSize: '0.7rem',
              }}
            />
          </Box>
          <Typography variant="h6" sx={{ color: '#94A3B8', fontWeight: 400, maxWidth: 600 }}>
            AI-powered medicine discovery. One brain. Every decision. Connecting patients to the medicines they need.
          </Typography>
        </Box>
      </motion.div>

      {/* Brain Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card
          sx={{
            mb: 4,
            bgcolor: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <CardContent sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', py: 2 }}>
            <StatusPill label="Brain" value="Active" color="#00E5A0" />
            <StatusPill
              label="Mode"
              value={inferenceMode === 'cloud' ? 'Cloud (26B)' : 'Edge (E2B)'}
              color={inferenceMode === 'cloud' ? '#60A5FA' : '#00E5A0'}
            />
            <StatusPill label="Network" value={isOnline ? 'Online' : 'Offline'} color={isOnline ? '#4ADE80' : '#EF4444'} />
            <StatusPill label="Tokens" value={stats.totalTokens.toString()} color="#F472B6" />
            <StatusPill label="Avg Latency" value={`${stats.avgLatency}ms`} color="#FBBF24" />
            <StatusPill label="Inferences" value={stats.inferenceCount.toString()} color="#60A5FA" />
          </CardContent>
        </Card>
      </motion.div>

      {/* Feature Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
        {features.map((feature, index) => (
          <motion.div
            key={feature.path}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 + index * 0.1 }}
          >
            <Card
              sx={{
                bgcolor: 'rgba(15,23,42,0.6)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  border: `1px solid ${feature.color}40`,
                  boxShadow: `0 0 30px ${feature.color}15`,
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <CardActionArea onClick={() => router.push(feature.path)} sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: '12px',
                      bgcolor: `${feature.color}15`,
                      color: feature.color,
                      flexShrink: 0,
                    }}
                  >
                    {feature.icon}
                  </Box>
                  <Box>
                    <Box sx={{ mb: 0.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
                        {feature.title}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: feature.color, fontWeight: 600, mb: 0.5 }}>
                      {feature.subtitle}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94A3B8', lineHeight: 1.5 }}>
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
      <Typography sx={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', mb: 0.25 }}>
        {label.toUpperCase()}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', color, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
