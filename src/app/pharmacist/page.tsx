'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Avatar,
  TextField,
  MenuItem,
  Select,
  FormControl,
  Dialog,
  DialogContent,
} from '@mui/material';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import MedicationIcon from '@mui/icons-material/Medication';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion, AnimatePresence } from 'framer-motion';
import { REAL_PHARMACISTS } from '@/lib/pharmacist-data';
import type { DispatchRequest } from '@/lib/dispatch-store';

interface RespondingState {
  requestId: string;
  price: string;
}

export default function PharmacistPage() {
  const [pharmacistId, setPharmacistId] = useState('');
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [responding, setResponding] = useState<RespondingState | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // Load saved pharmacist from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('psx_pharmacist_id');
    if (saved) setPharmacistId(saved);
  }, []);

  const savePharmacist = (id: string) => {
    setPharmacistId(id);
    localStorage.setItem('psx_pharmacist_id', id);
    // Reset responded set when switching identity
    setRespondedIds(new Set());
  };

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/dispatch');
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests ?? []);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
  }, []);

  // Initial fetch + 3s polling
  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const selectedPharmacist = REAL_PHARMACISTS.find((p) => p.id === pharmacistId);

  const hasResponded = (req: DispatchRequest) => {
    return respondedIds.has(req.id) ||
      req.responses.some((r) => r.pharmacistId === pharmacistId);
  };

  const myResponse = (req: DispatchRequest) =>
    req.responses.find((r) => r.pharmacistId === pharmacistId);

  const submitResponse = async (requestId: string, available: boolean, price?: number) => {
    if (!selectedPharmacist) return;
    setLoading(true);
    try {
      await fetch(`/api/dispatch/${requestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacistId: selectedPharmacist.id,
          pharmacistName: selectedPharmacist.name,
          pharmacistAddress: selectedPharmacist.address,
          available,
          price: available ? (price ?? selectedPharmacist.price) : 0,
          distance: selectedPharmacist.distance,
          responseRate: selectedPharmacist.responseRate,
          stockLikelihood: selectedPharmacist.stockLikelihood,
        }),
      });
      setRespondedIds((prev) => new Set([...prev, requestId]));
      setResponding(null);
      fetchRequests();
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const timeAgo = (iso: string) => {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const pendingRequests = requests.filter((r) => !hasResponded(r));
  const answeredRequests = requests.filter((r) => hasResponded(r));

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(0,229,160,0.1)' }}>
          <LocalPharmacyIcon sx={{ color: '#00E5A0', fontSize: 24 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
            Pharmacist Portal
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Respond to patient medicine requests
          </Typography>
        </Box>
        {lastRefresh && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ADE80',
                boxShadow: '0 0 6px #4ADE80',
                animation: 'livePulse 2s ease-in-out infinite',
                '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.4 } },
              }}
            />
            <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Live</Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* Identity selector */}
        <Card
          sx={{
            bgcolor: pharmacistId ? 'rgba(0,229,160,0.04)' : 'rgba(15,23,42,0.6)',
            border: `1px solid ${pharmacistId ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1 }}>
              You are responding as
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                displayEmpty
                value={pharmacistId}
                onChange={(e) => savePharmacist(e.target.value)}
                renderValue={(v) => {
                  const p = REAL_PHARMACISTS.find((ph) => ph.id === v);
                  return p
                    ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocalPharmacyIcon sx={{ fontSize: 16, color: '#00E5A0' }} />
                        <Typography sx={{ color: '#E0F2F1', fontSize: '0.875rem' }}>{p.name}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: '0.75rem' }}>· {p.address}</Typography>
                      </Box>
                    : <span style={{ color: '#475569' }}>Select your pharmacy…</span>;
                }}
                sx={{
                  bgcolor: 'rgba(15,23,42,0.7)',
                  color: '#E0F2F1',
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,229,160,0.3)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00E5A0' },
                  '& .MuiSvgIcon-root': { color: '#64748B' },
                }}
                MenuProps={{
                  slotProps: {
                    paper: {
                      sx: {
                        bgcolor: '#1A2540',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        '& .MuiMenuItem-root': {
                          color: '#CBD5E1',
                          fontSize: '0.875rem',
                          py: 1,
                          '&:hover': { bgcolor: 'rgba(0,229,160,0.06)', color: '#E0F2F1' },
                          '&.Mui-selected': { bgcolor: 'rgba(0,229,160,0.12)', color: '#00E5A0' },
                        },
                      },
                    },
                  },
                }}
              >
                {REAL_PHARMACISTS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography sx={{ fontWeight: 600 }}>{p.name}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: '#64748B' }}>{p.address} · {p.distance}km</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </CardContent>
        </Card>

        {!pharmacistId ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <LocalPharmacyIcon sx={{ fontSize: 48, color: '#334155', mb: 2 }} />
            <Typography sx={{ color: '#64748B' }}>Select your pharmacy above to see requests</Typography>
          </Box>
        ) : (
          <>
            {/* Pending requests */}
            {pendingRequests.length > 0 && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
                    Pending Requests
                  </Typography>
                  <Chip
                    label={pendingRequests.length}
                    size="small"
                    sx={{ bgcolor: 'rgba(251,191,36,0.15)', color: '#FBBF24', fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <AnimatePresence>
                    {pendingRequests.map((req) => (
                      <motion.div
                        key={req.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                      >
                        <Card
                          sx={{
                            bgcolor: 'rgba(15,23,42,0.7)',
                            border: '1px solid rgba(251,191,36,0.15)',
                            '&:hover': { border: '1px solid rgba(251,191,36,0.3)' },
                            transition: 'border 0.2s',
                          }}
                        >
                          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                            {/* Request meta */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                              <Chip
                                label={req.userState}
                                size="small"
                                icon={<LocationOnIcon style={{ fontSize: 12 }} />}
                                sx={{ bgcolor: 'rgba(192,132,252,0.1)', color: '#C084FC', fontSize: '0.65rem', height: 20 }}
                              />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <AccessTimeIcon sx={{ fontSize: 12, color: '#64748B' }} />
                                <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>{timeAgo(req.createdAt)}</Typography>
                              </Box>
                              <Box sx={{ flex: 1 }} />
                              <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>
                                {req.responses.length} responded
                              </Typography>
                            </Box>

                            {/* Medicines */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                              {req.medicines.map((med, i) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <MedicationIcon sx={{ fontSize: 14, color: '#C084FC' }} />
                                  <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1', fontWeight: 600 }}>
                                    {med.name}
                                    {med.strength ? ` ${med.strength}` : ''}
                                  </Typography>
                                  {med.form && (
                                    <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>
                                      · {med.form}
                                    </Typography>
                                  )}
                                </Box>
                              ))}
                            </Box>

                            {/* Action buttons */}
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => setResponding({ requestId: req.id, price: String(selectedPharmacist?.price ?? '') })}
                                sx={{
                                  flex: 1,
                                  bgcolor: '#00E5A0',
                                  color: '#0F172A',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  textTransform: 'none',
                                  borderRadius: '8px',
                                  '&:hover': { bgcolor: '#00C987' },
                                }}
                              >
                                ✓ I have it — set price
                              </Button>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => submitResponse(req.id, false)}
                                disabled={loading}
                                sx={{
                                  borderColor: 'rgba(248,113,113,0.3)',
                                  color: '#F87171',
                                  fontWeight: 700,
                                  fontSize: '0.78rem',
                                  textTransform: 'none',
                                  borderRadius: '8px',
                                  '&:hover': { borderColor: '#F87171', bgcolor: 'rgba(248,113,113,0.05)' },
                                }}
                              >
                                ✗ Not available
                              </Button>
                            </Box>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </Box>
              </Box>
            )}

            {/* No pending */}
            {pendingRequests.length === 0 && (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 5,
                  border: '1px dashed rgba(255,255,255,0.06)',
                  borderRadius: 3,
                }}
              >
                <RefreshIcon sx={{ fontSize: 36, color: '#334155', mb: 1.5 }} />
                <Typography sx={{ color: '#64748B', fontWeight: 600 }}>No pending requests</Typography>
                <Typography sx={{ color: '#475569', fontSize: '0.8rem', mt: 0.5 }}>
                  New patient requests will appear here automatically
                </Typography>
              </Box>
            )}

            {/* Already answered */}
            {answeredRequests.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#64748B', mb: 1.5 }}>
                  Already Responded ({answeredRequests.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {answeredRequests.map((req) => {
                    const mine = myResponse(req);
                    return (
                      <Card
                        key={req.id}
                        sx={{ bgcolor: 'rgba(15,23,42,0.4)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar
                              sx={{
                                width: 30, height: 30,
                                bgcolor: mine?.available ? 'rgba(0,229,160,0.12)' : 'rgba(248,113,113,0.12)',
                              }}
                            >
                              {mine?.available
                                ? <CheckCircleIcon sx={{ fontSize: 16, color: '#00E5A0' }} />
                                : <CancelIcon sx={{ fontSize: 16, color: '#F87171' }} />}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: '0.82rem', color: '#94A3B8', fontWeight: 600 }} noWrap>
                                {req.medicines.map((m) => m.name).join(', ')}
                              </Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: '#475569' }}>
                                {mine?.available ? `₦${mine.price.toLocaleString()} · Available` : 'Not available'} · {timeAgo(mine?.respondedAt ?? req.createdAt)}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Price dialog */}
      <Dialog
        open={!!responding}
        onClose={() => setResponding(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#0D1526',
              border: '1px solid rgba(0,229,160,0.2)',
              borderRadius: '16px',
              maxWidth: 340,
              width: '100%',
              m: 2,
            },
          },
        }}
      >
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1', mb: 0.5 }}>
            Set your price
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mb: 2.5 }}>
            Enter the total price for all medicines in this request
          </Typography>

          <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
            Price (₦)
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="number"
            placeholder="e.g. 3500"
            value={responding?.price ?? ''}
            onChange={(e) => setResponding((prev) => prev ? { ...prev, price: e.target.value } : null)}
            sx={{
              mb: 2.5,
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(15,23,42,0.7)',
                color: '#E0F2F1',
                borderRadius: '10px',
                fontSize: '1.1rem',
                fontWeight: 700,
                '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                '&:hover fieldset': { borderColor: 'rgba(0,229,160,0.3)' },
                '&.Mui-focused fieldset': { borderColor: '#00E5A0' },
              },
              '& .MuiInputBase-input::placeholder': { color: '#475569', fontWeight: 400, fontSize: '0.9rem' },
            }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              onClick={() => setResponding(null)}
              sx={{ flex: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#64748B', textTransform: 'none', borderRadius: '10px' }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!responding?.price || loading}
              onClick={() => {
                if (responding) submitResponse(responding.requestId, true, Number(responding.price));
              }}
              sx={{
                flex: 2,
                bgcolor: '#00E5A0',
                color: '#0F172A',
                fontWeight: 700,
                textTransform: 'none',
                borderRadius: '10px',
                '&:hover': { bgcolor: '#00C987' },
                '&.Mui-disabled': { bgcolor: 'rgba(0,229,160,0.15)', color: '#334155' },
              }}
            >
              Confirm & Send
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
