'use client';

import React from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from '@/theme/theme';
import { NexusBrainProvider } from '@/components/NexusBrainProvider';
import Navigation from '@/components/Navigation';
import DevConsole from '@/components/DevConsole';
import { Box } from '@mui/material';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

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
