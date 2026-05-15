'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  Avatar,
  Dialog,
  DialogContent,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import StarIcon from '@mui/icons-material/Star';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import PhoneIcon from '@mui/icons-material/Phone';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import EditLocationAltIcon from '@mui/icons-material/EditLocationAlt';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import type { PharmacistMatch, Medicine } from '@/lib/nexus-brain';
import type { PharmacistResponse } from '@/lib/dispatch-store';


type SearchPhase = 'idle' | 'scanning' | 'routing' | 'responses';

interface OrderData {
  pharmacist: PharmacistMatch;
  medicines: Medicine[];
  userState: string;
  userPhone: string;
}

function sortByBestDeal(arr: PharmacistResponse[]): PharmacistResponse[] {
  return [...arr].sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    const sa = a.price / 1000 + a.distance * 10;
    const sb = b.price / 1000 + b.distance * 10;
    return sa - sb;
  });
}

export default function SearchPage() {
  return (
    <React.Suspense fallback={
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ color: '#64748B' }}>Loading search engine...</Typography>
      </Box>
    }>
      <SearchContent />
    </React.Suspense>
  );
}

function SearchContent() {
  const [medicineName, setMedicineName] = useState('');
  const [strength, setStrength] = useState('');
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [responses, setResponses] = useState<PharmacistResponse[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [waitingTooLong, setWaitingTooLong] = useState(false);

  // Dispatch modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [userState, setUserState] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoObtained, setGeoObtained] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [pendingMedicines, setPendingMedicines] = useState<Medicine[]>([]);
  const [extracting, setExtracting] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { logger } = useNexusBrain();
  const searchParams = useSearchParams();
  const router = useRouter();

  // ── Live polling ──

  const poll = useCallback(async () => {
    if (!requestId) return;
    try {
      const res = await fetch(`/api/dispatch/${requestId}`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: PharmacistResponse[] = data.responses ?? [];
      let hadNew = false;
      for (const r of incoming) {
        if (!seenIds.current.has(r.pharmacistId)) {
          seenIds.current.add(r.pharmacistId);
          setResponses((prev) => sortByBestDeal([...prev, r]));
          hadNew = true;
          logger.emit(
            'CONNECT',
            `📱 ${r.pharmacistName}: ${r.available ? `AVAILABLE — price: ${r.price}` : 'NOT AVAILABLE'}`
          );
        }
      }
      if (hadNew && waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        setWaitingTooLong(false);
      }
    } catch { /* ignore network errors */ }
  }, [requestId, logger]);

  useEffect(() => {
    if (searchPhase !== 'responses' || !requestId) return;
    poll();
    const interval = setInterval(poll, 2500);
    // Show "no responses yet" hint after 45s
    waitTimerRef.current = setTimeout(() => setWaitingTooLong(true), 45000);
    return () => {
      clearInterval(interval);
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    };
  }, [searchPhase, requestId, poll]);

  // ── Geo ──

  const captureGeo = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoObtained(true);
        setGeoLoading(false);
        logger.emit('SYSTEM', `📍 Location captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      () => setGeoLoading(false),
      { timeout: 8000 }
    );
  };

  // ── Modal ──

  const openModal = (medicines: Medicine[]) => {
    setPendingMedicines(medicines);
    setModalOpen(true);
    if (navigator.geolocation) captureGeo();
  };

  const validatePhone = (v: string) => {
    const clean = v.replace(/[\s\-().]/g, '');
    if (!/^\+?[\d]{7,15}$/.test(clean)) {
      setPhoneError('Enter a valid phone number');
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handleDispatchSubmit = async () => {
    if (!userState) return;
    if (!validatePhone(userPhone)) return;
    setModalOpen(false);
    await runSearch(pendingMedicines, userState);
  };

  // ── Core Search (real dispatch) ──

  const runSearch = async (medicines: Medicine[], state: string) => {
    setSearchPhase('scanning');
    setResponses([]);
    setWaitingTooLong(false);
    seenIds.current = new Set();

    const summary = medicines.map((m) => `${m.name}${m.strength ? ' ' + m.strength : ''}`).join(', ');
    logger.emit('SYSTEM', `📢 Dispatching alert for ${medicines.length} medicine(s): ${summary}`);
    logger.emit('INTENT', `🎯 Intent: CONNECT_REQUEST — notifying pharmacists in ${state}`);

    await delay(2500);
    setSearchPhase('routing');
    logger.emit('ROUTE', `📡 Pinging registered pharmacists in ${state}...`);

    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicines, userState: state, userPhone }),
      });
      const data = await res.json();
      setRequestId(data.requestId);
      logger.emit('SYSTEM', `📋 Request created — ID: ${data.requestId}`);
      logger.emit('ROUTE', `⏳ Waiting for pharmacists to respond...`);

      await delay(1500);
      setSearchPhase('responses');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `Dispatch failed: ${msg}`);
      setSearchPhase('idle');
    }
  };

  // ── Triggers ──

  const startSearch = async () => {
    if (!medicineName.trim()) return;
    setExtracting(true);
    try {
      const res = await fetch('/api/extract-medicines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: medicineName }),
      });
      if (res.ok) {
        const data = await res.json();
        openModal(data.medicines);
      } else {
        openModal([{ name: medicineName, strength: strength || '', form: 'Tablet', quantity: 1 }]);
      }
    } catch {
      openModal([{ name: medicineName, strength: strength || '', form: 'Tablet', quantity: 1 }]);
    } finally {
      setExtracting(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get('q');
    const scan = searchParams.get('scan');
    const wa = searchParams.get('wa');
    const waMedicines = searchParams.get('medicines');

    if (wa && waMedicines) {
      try {
        const medicines: Medicine[] = JSON.parse(decodeURIComponent(waMedicines));
        if (medicines.length > 0) {
          setMedicineName(medicines.map((m) => `${m.name}${m.strength ? ' ' + m.strength : ''}`).join(', '));
          openModal(medicines);
        }
      } catch { /* ignore */ }
    } else if (scan) {
      try {
        const stored = localStorage.getItem('psx_scan_medicines');
        if (stored) {
          const medicines: Medicine[] = JSON.parse(stored);
          if (medicines.length > 0) {
            setMedicineName(medicines.map((m) => `${m.name}${m.strength ? ' ' + m.strength : ''}`).join(', '));
            openModal(medicines);
          }
        }
      } catch { /* ignore */ }
    } else if (q) {
      setMedicineName(q);
      openModal([{ name: q, strength: '', form: 'Tablet', quantity: 1 }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setSearchPhase('idle');
    setResponses([]);
    setRequestId(null);
    setWaitingTooLong(false);
    seenIds.current = new Set();
    setMedicineName('');
    setStrength('');
    setPendingMedicines([]);
  };

  // ── Payment ──

  const selectPharmacist = (r: PharmacistResponse) => {
    const pharmacist: PharmacistMatch = {
      id: r.pharmacistId,
      name: r.pharmacistName,
      address: r.pharmacistAddress,
      distance: r.distance,
      responseRate: r.responseRate,
      score: Math.round(100 - r.distance * 10 + r.responseRate),
      price: r.price,
      responseTime: r.distance < 2 ? '~30s' : r.distance < 5 ? '~1min' : '~2min',
      reason: 'Confirmed availability',
    };
    const order: OrderData = { pharmacist, medicines: pendingMedicines, userState, userPhone };
    localStorage.setItem('psx_order', JSON.stringify(order));
    router.push('/payment');
  };

  // ── Best deal index (first available in sorted list) ──
  const bestDealIdx = responses.findIndex((r) => r.available);

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
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(192,132,252,0.1)' }}>
          <SearchIcon sx={{ color: '#C084FC', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
            Smart Search
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Pharmacist Connection Engine • Powered by Gemma 4
          </Typography>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* Idle — Search Form */}
        {searchPhase === 'idle' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card sx={{ bgcolor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
                  What medicine do you need?
                </Typography>
                <TextField
                  fullWidth
                  placeholder="e.g. Tranexamic Acid, Diamicron CR, Augmentin..."
                  value={medicineName}
                  onChange={(e) => setMedicineName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startSearch()}
                  sx={inputSx}
                />
                <TextField
                  placeholder="Strength (e.g. 500mg) — optional"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  sx={inputSx}
                />
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<SearchIcon />}
                  onClick={startSearch}
                  disabled={!medicineName.trim() || extracting}
                  sx={{
                    bgcolor: '#1B5E20',
                    '&:hover': { bgcolor: '#2E7D32' },
                    py: 1.5,
                    fontWeight: 700,
                  }}
                >
                  {extracting ? 'Identifying medicines…' : 'Find Medicines'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Radar */}
        {(searchPhase === 'scanning' || searchPhase === 'routing') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 4 }}>
              <Box
                sx={{
                  width: 220, height: 220, position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {[1, 2, 3].map((ring) => (
                  <Box
                    key={ring}
                    sx={{
                      position: 'absolute',
                      width: `${ring * 33}%`, height: `${ring * 33}%`,
                      borderRadius: '50%',
                      border: '1px solid rgba(192,132,252,0.15)',
                      animation: 'radarPulse 2s ease-out infinite',
                      animationDelay: `${ring * 0.3}s`,
                      '@keyframes radarPulse': {
                        '0%': { transform: 'scale(0.8)', opacity: 0.6 },
                        '100%': { transform: 'scale(1.2)', opacity: 0 },
                      },
                    }}
                  />
                ))}
                <Box
                  sx={{
                    position: 'absolute', width: '50%', height: '100%',
                    top: 0, left: '50%', transformOrigin: 'left center',
                    background: 'linear-gradient(90deg, transparent, rgba(192,132,252,0.3), transparent)',
                    animation: 'radarSweep 3s linear infinite',
                    '@keyframes radarSweep': {
                      from: { transform: 'rotate(0deg)' },
                      to: { transform: 'rotate(360deg)' },
                    },
                  }}
                />
                {searchPhase === 'routing' &&
                  [
                    { top: '20%', left: '30%', delay: '0s' },
                    { top: '50%', left: '70%', delay: '0.3s' },
                    { top: '75%', left: '40%', delay: '0.6s' },
                    { top: '35%', left: '80%', delay: '0.9s' },
                  ].map((dot, i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'absolute', top: dot.top, left: dot.left,
                        width: 8, height: 8, borderRadius: '50%',
                        bgcolor: '#C084FC', boxShadow: '0 0 8px #C084FC',
                        animation: 'dotPulse 1.5s ease-in-out infinite',
                        animationDelay: dot.delay,
                        '@keyframes dotPulse': {
                          '0%, 100%': { transform: 'scale(0.5)', opacity: 0.5 },
                          '50%': { transform: 'scale(1.3)', opacity: 1 },
                        },
                      }}
                    />
                  ))}
                <Box
                  sx={{
                    width: 48, height: 48, borderRadius: '50%',
                    bgcolor: 'rgba(192,132,252,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1, border: '2px solid rgba(192,132,252,0.3)',
                  }}
                >
                  <LocalPharmacyIcon sx={{ color: '#C084FC' }} />
                </Box>
              </Box>

              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#C084FC' }}>
                  {searchPhase === 'scanning'
                    ? `Scanning pharmacists in ${userState || 'your area'}...`
                    : `Notifying pharmacists in ${userState || 'your area'}...`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                  {medicineName}
                </Typography>
              </Box>
            </Box>
          </motion.div>
        )}

        {/* Live responses */}
        {searchPhase === 'responses' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
                Pharmacist Responses
              </Typography>
              {responses.length > 0 && (
                <Chip
                  label={`${responses.length} received`}
                  size="small"
                  sx={{ bgcolor: 'rgba(0,229,160,0.1)', color: '#00E5A0', fontWeight: 700, fontSize: '0.65rem', height: 20 }}
                />
              )}
              {/* Live indicator */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                <Box
                  sx={{
                    width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ADE80',
                    boxShadow: '0 0 6px #4ADE80',
                    animation: 'livePulse 2s ease-in-out infinite',
                    '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                  }}
                />
                <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Live</Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <AnimatePresence>
                {responses.map((r, i) => {
                  const isBest = i === bestDealIdx && r.available;
                  return (
                    <motion.div
                      key={r.pharmacistId}
                      initial={{ opacity: 0, x: 40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                      <Card
                        sx={{
                          bgcolor: isBest ? 'rgba(0,229,160,0.04)' : 'rgba(15,23,42,0.6)',
                          border: `1px solid ${isBest ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.06)'}`,
                          transition: 'all 0.2s',
                          '&:hover': { border: `1px solid ${isBest ? 'rgba(0,229,160,0.4)' : 'rgba(192,132,252,0.2)'}` },
                        }}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                            <Avatar
                              sx={{
                                bgcolor: r.available ? (isBest ? 'rgba(0,229,160,0.15)' : 'rgba(74,222,128,0.1)') : 'rgba(248,113,113,0.08)',
                                width: 44, height: 44, flexShrink: 0,
                              }}
                            >
                              <LocalPharmacyIcon sx={{ color: r.available ? (isBest ? '#00E5A0' : '#4ADE80') : '#F87171', fontSize: 22 }} />
                            </Avatar>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                                <Typography sx={{ fontWeight: 700, color: '#E0F2F1', fontSize: '0.9rem' }}>
                                  {r.pharmacistName}
                                </Typography>
                                {isBest && (
                                  <Chip
                                    label="Best Deal"
                                    size="small"
                                    sx={{ bgcolor: 'rgba(0,229,160,0.15)', color: '#00E5A0', fontSize: '0.6rem', fontWeight: 700, height: 18 }}
                                  />
                                )}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                  {r.available
                                    ? <CheckCircleIcon sx={{ fontSize: 13, color: '#00E5A0' }} />
                                    : <CancelIcon sx={{ fontSize: 13, color: '#F87171' }} />}
                                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: r.available ? '#00E5A0' : '#F87171' }}>
                                    {r.available ? 'AVAILABLE' : 'NOT AVAILABLE'}
                                  </Typography>
                                </Box>
                              </Box>

                              <Typography sx={{ color: '#64748B', fontSize: '0.75rem' }}>{r.pharmacistAddress}</Typography>

                              <Box sx={{ display: 'flex', gap: 2, mt: 0.75, flexWrap: 'wrap' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                  <LocationOnIcon sx={{ fontSize: 13, color: '#94A3B8' }} />
                                  <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8' }}>{r.distance}km</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                  <StarIcon sx={{ fontSize: 13, color: '#FBBF24' }} />
                                  <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8' }}>{r.responseRate}% response</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                                  <AccessTimeIcon sx={{ fontSize: 13, color: '#94A3B8' }} />
                                  <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                                    {r.distance < 2 ? '~30s' : r.distance < 5 ? '~1min' : '~2min'}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>

                            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                              {r.available && r.price > 0 && (
                                <>
                                  <Typography sx={{ fontWeight: 700, color: '#00E5A0', fontSize: '1.05rem' }}>
                                    {r.price.toLocaleString()}
                                  </Typography>
                                  <Typography sx={{ color: '#64748B', fontSize: '0.65rem', mb: 0.75 }}>est. price</Typography>
                                </>
                              )}
                              <Button
                                variant={isBest ? 'contained' : 'outlined'}
                                size="small"
                                disabled={!r.available}
                                onClick={() => selectPharmacist(r)}
                                sx={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  py: 0.5,
                                  px: 1.5,
                                  minWidth: 80,
                                  textTransform: 'none',
                                  borderRadius: '8px',
                                  ...(isBest
                                    ? { bgcolor: '#00E5A0', color: '#0F172A', '&:hover': { bgcolor: '#00C987' } }
                                    : {
                                        borderColor: r.available ? 'rgba(192,132,252,0.4)' : 'rgba(255,255,255,0.08)',
                                        color: r.available ? '#C084FC' : '#334155',
                                      }),
                                }}
                              >
                                {r.available ? 'Select & Pay' : 'Unavailable'}
                              </Button>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Waiting indicator */}
              {responses.length === 0 && !waitingTooLong && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3, px: 2 }}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 7, height: 7, borderRadius: '50%', bgcolor: '#C084FC',
                          animation: 'dotBounce 1.2s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`,
                          '@keyframes dotBounce': {
                            '0%, 80%, 100%': { transform: 'scale(0.5)', opacity: 0.3 },
                            '40%': { transform: 'scale(1)', opacity: 1 },
                          },
                        }}
                      />
                    ))}
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>
                      Waiting for pharmacists to respond…
                    </Typography>
                    <Typography sx={{ color: '#475569', fontSize: '0.75rem' }}>
                      They were just notified — responses appear here in real time
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Streaming indicator below existing cards */}
              {responses.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.4 }}>
                    {[0, 1, 2].map((i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 5, height: 5, borderRadius: '50%', bgcolor: '#64748B',
                          animation: 'dotBounce 1.2s ease-in-out infinite',
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </Box>
                  <Typography sx={{ color: '#475569', fontSize: '0.72rem' }}>
                    More responses may arrive…
                  </Typography>
                </Box>
              )}

              {/* Timeout hint */}
              {waitingTooLong && responses.length === 0 && (
                <Box
                  sx={{
                    textAlign: 'center', py: 4, px: 3,
                    border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 3,
                  }}
                >
                  <Typography sx={{ color: '#64748B', fontWeight: 600, mb: 0.5 }}>
                    No responses yet
                  </Typography>
                  <Typography sx={{ color: '#475569', fontSize: '0.8rem', mb: 2 }}>
                    Pharmacists may be offline. Try again or search a different area.
                  </Typography>
                  <Button onClick={reset} sx={{ color: '#C084FC', textTransform: 'none', fontSize: '0.82rem' }}>
                    Start new search
                  </Button>
                </Box>
              )}
            </Box>

            <Button
              variant="outlined"
              size="small"
              onClick={reset}
              sx={{
                mt: 2,
                borderColor: 'rgba(255,255,255,0.1)',
                color: '#94A3B8',
                textTransform: 'none',
                '&:hover': { borderColor: '#C084FC', color: '#C084FC' },
              }}
            >
              ← New Search
            </Button>
          </Box>
        )}
      </Box>

      {/* ── Dispatch Modal ── */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#0D1526',
              border: '1px solid rgba(192,132,252,0.18)',
              borderRadius: '20px',
              maxWidth: 400,
              width: '100%',
              m: 2,
              overflow: 'hidden',
            },
          },
        }}
      >
        {/* Gradient header strip */}
        <Box
          sx={{
            px: 3,
            pt: 3,
            pb: 2.5,
            background: 'linear-gradient(135deg, rgba(192,132,252,0.12) 0%, rgba(139,92,246,0.06) 60%, transparent 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <Box
            sx={{
              width: 48, height: 48, borderRadius: '14px',
              bgcolor: 'rgba(192,132,252,0.12)',
              border: '1px solid rgba(192,132,252,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mb: 2,
            }}
          >
            <MyLocationIcon sx={{ color: '#C084FC', fontSize: 24 }} />
          </Box>

          <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#F1F5F9', letterSpacing: '-0.01em' }}>
            Where are you?
          </Typography>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem', mt: 0.5, lineHeight: 1.5 }}>
            We&apos;ll alert pharmacists in your state and find the best deals nearby.
          </Typography>
        </Box>

        <DialogContent sx={{ px: 3, pt: 2.5, pb: 3, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Location field */}
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
              Your Location
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="e.g. Manchester, London, Lagos, Nairobi…"
              value={userState}
              onChange={(e) => setUserState(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <EditLocationAltIcon sx={{ color: '#64748B', fontSize: 18, mr: 1 }} />
                  ),
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(192,132,252,0.35)' },
                  '&.Mui-focused fieldset': { borderColor: '#C084FC', borderWidth: '1.5px' },
                },
                '& .MuiInputBase-input::placeholder': { color: '#475569' },
              }}
            />
          </Box>

          {/* Phone field */}
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>
              Mobile Number
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="e.g. +44 7700 900123"
              value={userPhone}
              onChange={(e) => { setUserPhone(e.target.value); if (phoneError) validatePhone(e.target.value); }}
              error={!!phoneError}
              helperText={phoneError || 'Pharmacists will call or message this number'}
              slotProps={{
                input: {
                  startAdornment: (
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}>
                      <PhoneIcon sx={{ color: '#64748B', fontSize: 16 }} />
                    </Box>
                  ),
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px', fontSize: '0.9rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(192,132,252,0.35)' },
                  '&.Mui-focused fieldset': { borderColor: '#C084FC', borderWidth: '1.5px' },
                  '&.Mui-error fieldset': { borderColor: '#F87171' },
                },
                '& .MuiInputBase-input::placeholder': { color: '#475569' },
                '& .MuiFormHelperText-root': { color: phoneError ? '#F87171' : '#475569', fontSize: '0.72rem', mt: 0.5, ml: 0 },
              }}
            />
          </Box>

          {/* Geo row */}
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.5,
              px: 1.75, py: 1.25, borderRadius: '10px', mb: 2.5,
              bgcolor: geoObtained ? 'rgba(0,229,160,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${geoObtained ? 'rgba(0,229,160,0.22)' : 'rgba(255,255,255,0.07)'}`,
              transition: 'all 0.3s ease',
            }}
          >
            <Box
              sx={{
                width: 32, height: 32, borderRadius: '8px', flexShrink: 0,
                bgcolor: geoObtained ? 'rgba(0,229,160,0.12)' : 'rgba(100,116,139,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {geoLoading ? (
                <Box
                  sx={{
                    width: 14, height: 14, borderRadius: '50%',
                    border: '2px solid rgba(192,132,252,0.2)', borderTopColor: '#C084FC',
                    animation: 'spin 0.8s linear infinite',
                    '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                  }}
                />
              ) : (
                <MyLocationIcon sx={{ fontSize: 16, color: geoObtained ? '#00E5A0' : '#64748B' }} />
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: geoObtained ? '#00E5A0' : '#94A3B8', lineHeight: 1.3 }}>
                {geoObtained ? 'Location detected' : geoLoading ? 'Detecting location…' : 'Enable location access'}
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.3, mt: 0.2 }}>
                {geoObtained ? 'Closest pharmacist distance calculated' : 'Optional — for more accurate results'}
              </Typography>
            </Box>
            {!geoObtained && !geoLoading && (
              <Button
                size="small"
                onClick={captureGeo}
                sx={{
                  fontSize: '0.72rem', fontWeight: 700, color: '#C084FC', textTransform: 'none',
                  minWidth: 0, px: 1.25, py: 0.5, borderRadius: '8px', flexShrink: 0,
                  bgcolor: 'rgba(192,132,252,0.08)',
                  '&:hover': { bgcolor: 'rgba(192,132,252,0.15)' },
                }}
              >
                Allow
              </Button>
            )}
            {geoObtained && <CheckCircleIcon sx={{ fontSize: 18, color: '#00E5A0', flexShrink: 0 }} />}
          </Box>

          {/* CTA */}
          <Button
            variant="contained"
            fullWidth
            disabled={!userState || !userPhone.trim()}
            onClick={handleDispatchSubmit}
            sx={{
              background: userState && userPhone.trim()
                ? 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)'
                : 'rgba(255,255,255,0.05)',
              color: userState && userPhone.trim() ? '#fff' : '#334155',
              fontWeight: 700, fontSize: '0.92rem', py: 1.4, borderRadius: '12px',
              boxShadow: userState && userPhone.trim() ? '0 8px 24px rgba(168,85,247,0.35)' : 'none',
              textTransform: 'none', letterSpacing: '0.01em', transition: 'all 0.25s ease',
              '&:hover': {
                background: userState && userPhone.trim()
                  ? 'linear-gradient(135deg, #9333EA 0%, #6D28D9 100%)'
                  : 'rgba(255,255,255,0.05)',
                boxShadow: userState && userPhone.trim() ? '0 12px 32px rgba(168,85,247,0.45)' : 'none',
              },
              '&.Mui-disabled': { background: 'rgba(255,255,255,0.05)', color: '#334155' },
            }}
          >
            Notify Pharmacists →
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(15,23,42,0.8)', color: '#E0F2F1', fontSize: '0.9rem',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(192,132,252,0.3)' },
    '&.Mui-focused fieldset': { borderColor: '#C084FC' },
  },
  '& .MuiInputBase-input::placeholder': { color: '#64748B' },
};
