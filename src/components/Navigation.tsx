'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
} from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import SearchIcon from '@mui/icons-material/Search';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import HomeIcon from '@mui/icons-material/Home';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import CloudIcon from '@mui/icons-material/Cloud';
import TerminalIcon from '@mui/icons-material/Terminal';
import DownloadingIcon from '@mui/icons-material/Downloading';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useNexusBrain } from './NexusBrainProvider';

const NAV_ITEMS = [
  { path: '/', icon: <HomeIcon />, label: 'Nexus Hub' },
  { path: '/ask-rx', icon: <ChatIcon />, label: 'AskRX' },
  { path: '/scanner', icon: <CameraAltIcon />, label: 'Scanner' },
  { path: '/search', icon: <SearchIcon />, label: 'Search' },
  { path: '/pharmacist', icon: <LocalPharmacyIcon />, label: 'Pharmacist' },
  { path: '/whatsapp', icon: <WhatsAppIcon />, label: 'WhatsApp' },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { demoMode, setDemoMode, forceEdge, setForceEdge, isOnline, edgeStatus, edgeProgress, edgeDownloadedMB, edgeTotalMB } = useNexusBrain();

  return (
    <Box
      sx={{
        width: 72,
        height: '100vh',
        bgcolor: '#0F172A',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        py: 2,
        gap: 0.5,
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #1B5E20 0%, #00E5A0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(0,229,160,0.3)',
        }}
        onClick={() => router.push('/')}
      >
        <Typography sx={{ fontWeight: 900, fontSize: '1rem', color: '#fff' }}>N</Typography>
      </Box>

      {/* Nav Items */}
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.path;
        return (
          <Tooltip key={item.path} title={item.label} placement="right" arrow>
            <IconButton
              onClick={() => router.push(item.path)}
              sx={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                color: isActive ? '#00E5A0' : '#64748B',
                bgcolor: isActive ? 'rgba(0,229,160,0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(0,229,160,0.3)' : '1px solid transparent',
                transition: 'all 0.2s ease',
                '&:hover': {
                  color: '#00E5A0',
                  bgcolor: 'rgba(0,229,160,0.05)',
                },
              }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        );
      })}

      <Box sx={{ flex: 1 }} />

      {/* Mode Indicators */}
      <Divider sx={{ width: 32, borderColor: 'rgba(255,255,255,0.06)', mb: 1 }} />

      {/* Demo Mode Toggle */}
      <Tooltip title={demoMode ? 'Console: ON' : 'Console: OFF'} placement="right" arrow>
        <IconButton
          onClick={() => setDemoMode(!demoMode)}
          sx={{
            width: 44,
            height: 44,
            borderRadius: '10px',
            color: demoMode ? '#FBBF24' : '#64748B',
            bgcolor: demoMode ? 'rgba(251,191,36,0.1)' : 'transparent',
          }}
        >
          <TerminalIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {/* Edge Model Status */}
      <Tooltip
        title={
          edgeStatus === 'loading'
            ? edgeTotalMB === 0
              ? 'Loading Gemma 4 E2B from device cache...'
              : `Downloading Gemma 4 E2B — ${edgeDownloadedMB} MB / ${edgeTotalMB} MB`
            : edgeStatus === 'ready'
            ? 'Gemma 4 E2B ready — offline inference enabled'
            : edgeStatus === 'unavailable'
            ? 'WebGPU unavailable — cloud only'
            : edgeStatus === 'error'
            ? 'Edge model failed to load'
            : forceEdge ? 'Edge Mode (Offline)' : 'Cloud Mode'
        }
        placement="right"
        arrow
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <Box sx={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

            {edgeStatus === 'loading' && (
              <>
                {/* Faint indeterminate spin behind — proves download is alive */}
                <CircularProgress
                  variant="indeterminate"
                  size={44}
                  thickness={1.5}
                  sx={{ color: 'rgba(251,191,36,0.2)', position: 'absolute' }}
                />
                {/* Solid determinate ring on top showing real % */}
                <CircularProgress
                  variant="determinate"
                  value={edgeProgress}
                  size={44}
                  thickness={2.5}
                  sx={{ color: '#FBBF24', position: 'absolute' }}
                />
              </>
            )}

            {edgeStatus === 'ready' && (
              <CircularProgress
                variant="determinate"
                value={100}
                size={44}
                thickness={2.5}
                sx={{ color: '#00E5A0', position: 'absolute' }}
              />
            )}

            <IconButton
              onClick={() => setForceEdge(!forceEdge)}
              sx={{
                width: 36,
                height: 36,
                borderRadius: '9px',
                color:
                  edgeStatus === 'ready'
                    ? '#00E5A0'
                    : edgeStatus === 'loading'
                    ? '#FBBF24'
                    : edgeStatus === 'error' || edgeStatus === 'unavailable'
                    ? '#EF4444'
                    : forceEdge ? '#00E5A0' : '#64748B',
                bgcolor:
                  edgeStatus === 'ready'
                    ? 'rgba(0,229,160,0.1)'
                    : edgeStatus === 'loading'
                    ? 'rgba(251,191,36,0.08)'
                    : 'transparent',
              }}
            >
              {edgeStatus === 'loading' ? (
                <DownloadingIcon fontSize="small" />
              ) : edgeStatus === 'ready' ? (
                <CheckCircleIcon fontSize="small" />
              ) : edgeStatus === 'error' || edgeStatus === 'unavailable' ? (
                <ErrorIcon fontSize="small" />
              ) : forceEdge ? (
                <WifiOffIcon fontSize="small" />
              ) : (
                <CloudIcon fontSize="small" />
              )}
            </IconButton>
          </Box>

          {/* Label under button */}
          {edgeStatus === 'loading' && (
            <Typography sx={{ fontSize: '0.5rem', color: '#FBBF24', fontWeight: 700, lineHeight: 1, textAlign: 'center' }}>
              {edgeTotalMB === 0 ? (
                'CACHE'
              ) : (
                <>
                  {edgeDownloadedMB}
                  <br />
                  <span style={{ fontWeight: 400, opacity: 0.7 }}>/{edgeTotalMB}MB</span>
                </>
              )}
            </Typography>
          )}
          {edgeStatus === 'ready' && (
            <Typography sx={{ fontSize: '0.55rem', color: '#00E5A0', fontWeight: 700, lineHeight: 1 }}>
              READY
            </Typography>
          )}
        </Box>
      </Tooltip>

      {/* Online/Offline Indicator */}
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: isOnline ? '#4ADE80' : '#EF4444',
          boxShadow: `0 0 6px ${isOnline ? '#4ADE80' : '#EF4444'}`,
          mb: 1,
        }}
      />
    </Box>
  );
}
