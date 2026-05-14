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
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Navigation />
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Main Content */}
        <Box
          sx={{
            flex: 1,
            overflow: 'auto',
            transition: 'all 0.3s ease',
            position: 'relative',
          }}
        >
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

        {/* Dev Console (Right Panel) */}
        {demoMode && (
          <Box
            sx={{
              width: { xs: 320, md: 420, lg: 480 },
              flexShrink: 0,
              transition: 'width 0.3s ease',
            }}
          >
            <DevConsole />
          </Box>
        )}
      </Box>
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
