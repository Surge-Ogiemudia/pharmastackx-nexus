'use client';

import React, { useState, useEffect } from 'react';
import { ThemeProvider, CssBaseline, Button, IconButton, Typography } from '@mui/material';
import { theme } from '@/theme/theme';
import { NexusBrainProvider } from '@/components/NexusBrainProvider';
import Navigation from '@/components/Navigation';
import DevConsole from '@/components/DevConsole';
import { Box } from '@mui/material';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CloseIcon from '@mui/icons-material/Close';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

function NotificationBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Notification API not available at all — skip
    if (!('Notification' in window)) return;
    if (Notification.permission === 'denied') return;

    if (Notification.permission === 'granted') {
      // Silently re-post existing subscription on every load — server may have
      // restarted and lost the in-memory subscription map
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => {
            if (sub) fetch('/api/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(sub),
            });
          })
          .catch(() => {});
      }
      return;
    }

    // permission === 'default' — show banner once, regardless of push support
    if (!localStorage.getItem('psx_notif_asked')) setShow(true);
  }, []);

  const handleAllow = async () => {
    setShow(false);
    localStorage.setItem('psx_notif_asked', 'prompted');
    try {
      const permission = await Notification.requestPermission();
      localStorage.setItem('psx_notif_asked', permission);
      if (permission !== 'granted') return;
      // Subscribe to push only if the browser supports it
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
        await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub),
        });
      }
    } catch (err) {
      console.error('[push-subscribe]', err);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('psx_notif_asked', 'dismissed');
  };

  return (
    <AnimatePresence>
      {show && (
        <Box
          component={motion.div}
          initial={{ y: -72, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -72, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          sx={{
            position: 'fixed',
            top: 12,
            left: 16,
            right: 16,
            zIndex: 1400,
            maxWidth: 480,
            mx: 'auto',
          }}
        >
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.25,
            borderRadius: '14px',
            bgcolor: '#0D1526',
            border: '1px solid rgba(0,229,160,0.25)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          }}>
            <Box sx={{
              width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
              bgcolor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <NotificationsIcon sx={{ fontSize: 16, color: '#00E5A0' }} />
            </Box>
            <Typography sx={{ flex: 1, fontSize: '0.8rem', color: '#CBD5E1', lineHeight: 1.4 }}>
              Allow notifications for the full experience
            </Typography>
            <Button size="small" variant="contained" onClick={handleAllow}
              sx={{
                bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700,
                fontSize: '0.75rem', textTransform: 'none',
                borderRadius: '8px', px: 1.5, py: 0.5, flexShrink: 0,
                '&:hover': { bgcolor: '#00C987' },
              }}>
              Allow
            </Button>
            <IconButton size="small" onClick={handleDismiss}
              sx={{ color: '#475569', p: 0.25, flexShrink: 0, '&:hover': { color: '#94A3B8' } }}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      )}
    </AnimatePresence>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { demoMode } = useNexusBrain();
  const pathname = usePathname();

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      width: '100vw',
      overflow: 'hidden',
    }}>
      {/* Main row: sidebar (desktop) + content + DevConsole side panel (desktop) */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <Navigation />

        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Page content */}
          <Box sx={{ flex: 1, overflow: 'auto', position: 'relative', transition: 'all 0.3s ease' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{ height: '100%' }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </Box>

          {/* Dev Console — side panel, desktop only */}
          {demoMode && (
            <Box sx={{
              display: { xs: 'none', md: 'flex' },
              width: { md: 420, lg: 480 },
              flexShrink: 0,
              transition: 'width 0.3s ease',
            }}>
              <DevConsole />
            </Box>
          )}
        </Box>
      </Box>

      <NotificationBanner />

      {/* Spacer that matches the mobile bottom nav height so content never
          slides under it. Hidden on desktop. */}
      <Box sx={{ flexShrink: 0, display: { xs: 'block', md: 'none' }, height: 56 }} />

      {/* Dev Console — full-screen overlay on mobile when Console is toggled.
          zIndex 1200 sits below the bottom nav (1300) so the Console button
          stays tappable and acts as the dismiss button. */}
      {demoMode && (
        <Box sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 56,
          zIndex: 1200,
          flexDirection: 'column',
        }}>
          <DevConsole />
        </Box>
      )}
    </Box>
  );
}

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NexusBrainProvider>
        <AppShell>{children}</AppShell>
      </NexusBrainProvider>
    </ThemeProvider>
  );
}
