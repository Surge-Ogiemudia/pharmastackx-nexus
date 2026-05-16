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
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import { motion, AnimatePresence } from 'framer-motion';
import type { DispatchRequest } from '@/lib/dispatch-store';

type NotifStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

const MY_ID = 'psx-pharmacist';
const MY_NAME = 'PharmaStackX Hub';
const MY_ADDRESS = 'Innovation Quarter';

interface MedItem {
  available: boolean;
  price: string;
}

interface RespondingState {
  requestId: string;
  medicines: { name: string; strength?: string; form?: string }[];
  items: MedItem[];
  pharmacistNotes: string;
}

export default function PharmacistPage() {
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [responding, setResponding] = useState<RespondingState | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('idle');

  // Register SW and restore existing subscription on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setNotifStatus('denied');
      return;
    }
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (sub) {
          // Re-post to server in case it restarted since last visit
          fetch('/api/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub),
          });
          setNotifStatus('active');
        }
      })
      .catch(console.error);
  }, []);

  const enableNotifications = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setNotifStatus('requesting');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setNotifStatus('denied'); return; }
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
      setNotifStatus('active');
    } catch (err) {
      console.error('[push-subscribe]', err);
      setNotifStatus('idle');
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch('/api/dispatch');
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests ?? []);
      setLastRefresh(new Date());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 3000);
    return () => clearInterval(interval);
  }, [fetchRequests]);

  const hasResponded = (req: DispatchRequest) =>
    respondedIds.has(req.id) || req.responses.some((r) => r.pharmacistId === MY_ID);

  const myResponse = (req: DispatchRequest) =>
    req.responses.find((r) => r.pharmacistId === MY_ID);

  const submitResponse = async () => {
    if (!responding) return;
    setLoading(true);
    const { requestId, items, pharmacistNotes } = responding;
    const hasAny = items.some((i) => i.available);
    try {
      await fetch(`/api/dispatch/${requestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pharmacistId: MY_ID,
          pharmacistName: MY_NAME,
          pharmacistAddress: MY_ADDRESS,
          available: hasAny,
          items: items.map((item, idx) => ({
            medicineIndex: idx,
            name: responding.medicines[idx]?.name ?? '',
            available: item.available,
            price: item.available ? (Number(item.price) || 0) : 0,
          })),
          pharmacistNotes: pharmacistNotes.trim() || undefined,
          distance: 0.8,
          responseRate: 98,
          stockLikelihood: 90,
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

      {/* Notification status bar */}
      {notifStatus !== 'unsupported' && (
        <Box
          sx={{
            px: 3,
            py: 0.85,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            bgcolor: 'rgba(10,15,28,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexShrink: 0,
          }}
        >
          {notifStatus === 'active' ? (
            <Chip
              icon={<NotificationsActiveIcon style={{ fontSize: 13, color: '#00E5A0' }} />}
              label="Push notifications active — OS alert fires on every new request"
              size="small"
              sx={{
                bgcolor: 'rgba(0,229,160,0.07)',
                border: '1px solid rgba(0,229,160,0.2)',
                color: '#00E5A0',
                fontSize: '0.68rem',
                height: 24,
                '& .MuiChip-label': { pl: 0.5 },
              }}
            />
          ) : notifStatus === 'denied' ? (
            <Chip
              icon={<NotificationsIcon style={{ fontSize: 13, color: '#64748B' }} />}
              label="Notifications blocked — enable in browser site settings"
              size="small"
              sx={{
                bgcolor: 'transparent',
                border: '1px solid rgba(100,116,139,0.2)',
                color: '#64748B',
                fontSize: '0.68rem',
                height: 24,
                '& .MuiChip-label': { pl: 0.5 },
              }}
            />
          ) : (
            <Chip
              icon={<NotificationsIcon style={{ fontSize: 13, color: '#FBBF24' }} />}
              label={notifStatus === 'requesting' ? 'Requesting permission…' : 'Enable push notifications · Gemma alerts you on new requests'}
              size="small"
              onClick={notifStatus === 'idle' ? enableNotifications : undefined}
              sx={{
                bgcolor: 'rgba(251,191,36,0.07)',
                border: '1px solid rgba(251,191,36,0.25)',
                color: '#FBBF24',
                fontSize: '0.68rem',
                height: 24,
                cursor: notifStatus === 'idle' ? 'pointer' : 'default',
                '& .MuiChip-label': { pl: 0.5 },
                '&:hover': notifStatus === 'idle' ? { bgcolor: 'rgba(251,191,36,0.13)' } : {},
              }}
            />
          )}
        </Box>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
      <Box sx={{ maxWidth: { md: 700 }, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>

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
                        </Box>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: req.patientNotes ? 1 : 2 }}>
                          {req.medicines.map((med, i) => (
                            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <MedicationIcon sx={{ fontSize: 14, color: '#C084FC' }} />
                              <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1', fontWeight: 600 }}>
                                {med.name}{med.strength ? ` ${med.strength}` : ''}
                              </Typography>
                              {med.form && <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>· {med.form}</Typography>}
                              {med.quantity && <Typography sx={{ fontSize: '0.72rem', color: '#64748B' }}>· qty {med.quantity}</Typography>}
                            </Box>
                          ))}
                        </Box>
                        {req.patientNotes && (
                          <Box sx={{ mb: 2, px: 1.25, py: 0.75, borderRadius: '8px', bgcolor: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                            <Typography sx={{ fontSize: '0.72rem', color: '#FBBF24', fontStyle: 'italic' }}>"{req.patientNotes}"</Typography>
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => setResponding({
                            requestId: req.id,
                            medicines: req.medicines.map((m) => ({ name: m.name, strength: m.strength, form: m.form })),
                            items: req.medicines.map(() => ({ available: true, price: '' })),
                            pharmacistNotes: '',
                          })}
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
                            onClick={() => setResponding({
                              requestId: req.id,
                              medicines: req.medicines.map((m) => ({ name: m.name, strength: m.strength, form: m.form })),
                              items: req.medicines.map(() => ({ available: false, price: '' })),
                              pharmacistNotes: '',
                            })}
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
                            {mine?.available ? `${mine.price.toLocaleString()} · Available` : 'Not available'} · {timeAgo(mine?.respondedAt ?? req.createdAt)}
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
      </Box>
      </Box>

      {/* Per-medicine response dialog */}
      <Dialog
        open={!!responding}
        onClose={() => setResponding(null)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#0D1526',
              border: '1px solid rgba(0,229,160,0.2)',
              borderRadius: '16px',
              maxWidth: 400,
              width: '100%',
              m: 2,
            },
          },
        }}
      >
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1', mb: 0.5 }}>
            Respond to request
          </Typography>
          <Typography sx={{ color: '#64748B', fontSize: '0.82rem', mb: 2 }}>
            Set availability and price for each medicine.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
            {responding?.items.map((item, idx) => {
              const med = responding.medicines[idx];
              return (
                <Box key={idx} sx={{ p: 1.5, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', bgcolor: 'rgba(15,23,42,0.5)' }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#E0F2F1', mb: 1 }}>
                    {med?.name}{med?.strength ? ` ${med.strength}` : ''}{med?.form ? ` · ${med.form}` : ''}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: item.available ? 1 : 0 }}>
                    <Button
                      size="small"
                      onClick={() => setResponding((p) => p ? { ...p, items: p.items.map((it, i) => i === idx ? { ...it, available: true } : it) } : null)}
                      sx={{
                        flex: 1, textTransform: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                        bgcolor: item.available ? 'rgba(0,229,160,0.15)' : 'transparent',
                        color: item.available ? '#00E5A0' : '#64748B',
                        border: `1px solid ${item.available ? 'rgba(0,229,160,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >✓ In stock</Button>
                    <Button
                      size="small"
                      onClick={() => setResponding((p) => p ? { ...p, items: p.items.map((it, i) => i === idx ? { ...it, available: false, price: '' } : it) } : null)}
                      sx={{
                        flex: 1, textTransform: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                        bgcolor: !item.available ? 'rgba(248,113,113,0.1)' : 'transparent',
                        color: !item.available ? '#F87171' : '#64748B',
                        border: `1px solid ${!item.available ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >✗ Not available</Button>
                  </Box>
                  {item.available && (
                    <TextField
                      fullWidth size="small" type="number" placeholder="Price"
                      value={item.price}
                      onChange={(e) => setResponding((p) => p ? { ...p, items: p.items.map((it, i) => i === idx ? { ...it, price: e.target.value } : it) } : null)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 700,
                          '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                          '&:hover fieldset': { borderColor: 'rgba(0,229,160,0.3)' },
                          '&.Mui-focused fieldset': { borderColor: '#00E5A0' },
                        },
                        '& .MuiInputBase-input::placeholder': { color: '#475569', fontWeight: 400 },
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Total */}
          {responding && responding.items.some((i) => i.available && i.price) && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, px: 0.5 }}>
              <Typography sx={{ fontSize: '0.82rem', color: '#64748B' }}>Total</Typography>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: '#00E5A0' }}>
                {responding.items.filter((i) => i.available && i.price).reduce((s, i) => s + Number(i.price), 0).toLocaleString()}
              </Typography>
            </Box>
          )}

          {/* Pharmacist notes */}
          <TextField
            fullWidth size="small" placeholder="Notes to patient (optional)"
            value={responding?.pharmacistNotes ?? ''}
            onChange={(e) => setResponding((p) => p ? { ...p, pharmacistNotes: e.target.value } : null)}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px',
                '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                '&:hover fieldset': { borderColor: 'rgba(0,229,160,0.3)' },
                '&.Mui-focused fieldset': { borderColor: '#00E5A0' },
              },
              '& .MuiInputBase-input::placeholder': { color: '#475569', fontSize: '0.85rem' },
            }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={() => setResponding(null)}
              sx={{ flex: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#64748B', textTransform: 'none', borderRadius: '10px' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={loading || !responding?.items.some((i) => i.available ? !!i.price : true)}
              onClick={submitResponse}
              sx={{ flex: 2, bgcolor: '#00E5A0', color: '#0F172A', fontWeight: 700, textTransform: 'none', borderRadius: '10px', '&:hover': { bgcolor: '#00C987' }, '&.Mui-disabled': { bgcolor: 'rgba(0,229,160,0.15)', color: '#334155' } }}
            >
              Send Response
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
