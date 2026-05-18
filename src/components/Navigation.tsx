'use client';

import React from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box, Typography, IconButton, Tooltip, Divider, CircularProgress,
} from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import ChatIcon from '@mui/icons-material/Chat';
import HomeIcon from '@mui/icons-material/Home';

import WifiOffIcon from '@mui/icons-material/WifiOff';
import CloudIcon from '@mui/icons-material/Cloud';
import TerminalIcon from '@mui/icons-material/Terminal';
import DownloadingIcon from '@mui/icons-material/Downloading';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useNexusBrain } from './NexusBrainProvider';

type NavItem = {
  path: string;
  Icon: React.ComponentType<SvgIconProps>;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { path: '/', Icon: HomeIcon, label: 'Hub' },
  { path: '/ask-rx', Icon: ChatIcon, label: 'Nexus' },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    demoMode, setDemoMode, forceEdge, setForceEdge,
    isOnline, edgeStatus, edgeProgress, edgeDownloadedMB, edgeTotalMB,
  } = useNexusBrain();

  const edgeColor =
    edgeStatus === 'ready' ? '#00E5A0' :
    edgeStatus === 'loading' ? '#FBBF24' :
    (edgeStatus === 'error' || edgeStatus === 'unavailable') ? '#EF4444' :
    forceEdge ? '#00E5A0' : '#64748B';

  const EdgeIcon =
    edgeStatus === 'loading' ? DownloadingIcon :
    edgeStatus === 'ready' ? CheckCircleIcon :
    (edgeStatus === 'error' || edgeStatus === 'unavailable') ? ErrorIcon :
    forceEdge ? WifiOffIcon : CloudIcon;

  const edgeTooltip =
    edgeStatus === 'loading'
      ? (edgeTotalMB === 0 ? 'Loading Gemma 4 E2B from cache...' : `Downloading Gemma 4 E2B — ${edgeDownloadedMB}/${edgeTotalMB} MB`)
      : edgeStatus === 'ready' ? 'Gemma 4 E2B ready — offline inference enabled'
      : edgeStatus === 'unavailable' ? 'WebGPU unavailable — cloud only'
      : edgeStatus === 'error' ? 'Edge model failed to load'
      : forceEdge ? 'Edge Mode (Offline)' : 'Cloud Mode';

  return (
    <>
      {/* ── Desktop Sidebar (md+) ── */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          width: 72,
          height: '100%',
          bgcolor: '#0F172A',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 0.5,
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <Box
          onClick={() => router.push('/')}
          sx={{ width: 40, height: 40, mb: 2, cursor: 'pointer', flexShrink: 0 }}
        >
          <Image src="/nexus.png" alt="Nexus" width={40} height={40} style={{ borderRadius: 10, display: 'block' }} />
        </Box>

        {NAV_ITEMS.map(({ path, Icon, label }) => {
          const isActive = pathname === path;
          return (
            <Tooltip key={path} title={label} placement="right" arrow>
              <IconButton
                onClick={() => router.push(path)}
                sx={{
                  width: 44, height: 44, borderRadius: '10px',
                  color: isActive ? '#00E5A0' : '#64748B',
                  bgcolor: isActive ? 'rgba(0,229,160,0.1)' : 'transparent',
                  border: isActive ? '1px solid rgba(0,229,160,0.3)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  '&:hover': { color: '#00E5A0', bgcolor: 'rgba(0,229,160,0.05)' },
                }}
              >
                <Icon />
              </IconButton>
            </Tooltip>
          );
        })}

        <Box sx={{ flex: 1 }} />
        <Divider sx={{ width: 32, borderColor: 'rgba(255,255,255,0.06)', mb: 1 }} />

        <Tooltip title={demoMode ? 'Console: ON' : 'Console: OFF'} placement="right" arrow>
          <IconButton
            onClick={() => setDemoMode(!demoMode)}
            sx={{
              width: 44, height: 44, borderRadius: '10px',
              color: demoMode ? '#FBBF24' : '#64748B',
              bgcolor: demoMode ? 'rgba(251,191,36,0.1)' : 'transparent',
            }}
          >
            <TerminalIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Tooltip title={edgeTooltip} placement="right" arrow>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
            <Box sx={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {edgeStatus === 'loading' && (
                <>
                  <CircularProgress variant="indeterminate" size={44} thickness={1.5}
                    sx={{ color: 'rgba(251,191,36,0.2)', position: 'absolute' }} />
                  <CircularProgress variant="determinate" value={edgeProgress} size={44} thickness={2.5}
                    sx={{ color: '#FBBF24', position: 'absolute' }} />
                </>
              )}
              {edgeStatus === 'ready' && (
                <CircularProgress variant="determinate" value={100} size={44} thickness={2.5}
                  sx={{ color: '#00E5A0', position: 'absolute' }} />
              )}
              <IconButton
                onClick={() => setForceEdge(!forceEdge)}
                sx={{
                  width: 36, height: 36, borderRadius: '9px',
                  color: edgeColor,
                  bgcolor: edgeStatus === 'ready' ? 'rgba(0,229,160,0.1)' : edgeStatus === 'loading' ? 'rgba(251,191,36,0.08)' : 'transparent',
                }}
              >
                <EdgeIcon fontSize="small" />
              </IconButton>
            </Box>
            {edgeStatus === 'loading' && (
              <Typography sx={{ fontSize: '0.5rem', color: '#FBBF24', fontWeight: 700, lineHeight: 1, textAlign: 'center' }}>
                {edgeTotalMB === 0 ? 'CACHE' : <>{edgeDownloadedMB}<br /><span style={{ fontWeight: 400, opacity: 0.7 }}>/{edgeTotalMB}MB</span></>}
              </Typography>
            )}
            {edgeStatus === 'ready' && (
              <Typography sx={{ fontSize: '0.55rem', color: '#00E5A0', fontWeight: 700, lineHeight: 1 }}>READY</Typography>
            )}
          </Box>
        </Tooltip>

        <Box sx={{
          width: 8, height: 8, borderRadius: '50%', mb: 1,
          bgcolor: isOnline ? '#4ADE80' : '#EF4444',
          boxShadow: `0 0 6px ${isOnline ? '#4ADE80' : '#EF4444'}`,
        }} />
      </Box>

      {/* ── Mobile Bottom Nav (xs/sm) ── */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1300,
          bgcolor: '#0F172A',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          alignItems: 'center',
          justifyContent: 'space-around',
          px: 0.5,
          height: 56,
          // Extra padding for home-indicator on iPhone
          pb: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {NAV_ITEMS.map(({ path, Icon, label }) => {
          const isActive = pathname === path;
          return (
            <Box
              key={path}
              onClick={() => router.push(path)}
              sx={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '2px',
                minWidth: 44, height: 48, borderRadius: '10px',
                cursor: 'pointer',
                color: isActive ? '#00E5A0' : '#64748B',
                bgcolor: isActive ? 'rgba(0,229,160,0.1)' : 'transparent',
                transition: 'all 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
                '&:active': { transform: 'scale(0.9)', opacity: 0.8 },
              }}
            >
              <Icon sx={{ fontSize: 20 }} />
              <Typography sx={{
                fontSize: '0.48rem', lineHeight: 1,
                fontWeight: isActive ? 700 : 400,
                letterSpacing: '0.02em',
              }}>
                {label}
              </Typography>
            </Box>
          );
        })}

        {/* Console toggle */}
        <Box
          onClick={() => setDemoMode(!demoMode)}
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '2px',
            minWidth: 44, height: 48, borderRadius: '10px',
            cursor: 'pointer',
            color: demoMode ? '#FBBF24' : '#64748B',
            bgcolor: demoMode ? 'rgba(251,191,36,0.1)' : 'transparent',
            transition: 'all 0.15s ease',
            WebkitTapHighlightColor: 'transparent',
            '&:active': { transform: 'scale(0.9)', opacity: 0.8 },
          }}
        >
          <TerminalIcon sx={{ fontSize: 20 }} />
          <Typography sx={{ fontSize: '0.48rem', lineHeight: 1, fontWeight: 400, letterSpacing: '0.02em' }}>
            Console
          </Typography>
        </Box>
      </Box>
    </>
  );
}
