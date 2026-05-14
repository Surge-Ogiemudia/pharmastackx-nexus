'use client'

import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1B5E20',
      light: '#4CAF50',
      dark: '#0D3B0D',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#7B1FA2',
      light: '#9c27b0',
      dark: '#4A148C',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0A0F1C',
      paper: '#111827',
    },
    text: {
      primary: '#E0F2F1',
      secondary: '#94A3B8',
    },
    info: {
      main: '#00E5A0', // Nexus Electric Mint — AI active state
    },
    success: {
      main: '#4CAF50',
    },
    warning: {
      main: '#FFB300',
    },
    error: {
      main: '#EF5350',
    },
  },
  typography: {
    fontFamily: '"Poppins", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
    },
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.75rem',
    },
    h4: {
      fontWeight: 500,
      fontSize: '1.5rem',
    },
    h5: {
      fontWeight: 500,
      fontSize: '1.25rem',
    },
    h6: {
      fontWeight: 500,
      fontSize: '1rem',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
        containedPrimary: {
          backgroundColor: '#1B5E20',
          '&:hover': {
            backgroundColor: '#2E7D32',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          backgroundColor: '#111827',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
  },
});
