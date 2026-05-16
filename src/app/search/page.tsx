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
  CircularProgress,
  IconButton,
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
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import CloseIcon from '@mui/icons-material/Close';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter } from 'next/navigation';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import type { PharmacistMatch, Medicine } from '@/lib/nexus-brain';
import type { PharmacistResponse } from '@/lib/dispatch-store';

type SearchPhase = 'idle' | 'scanning' | 'routing' | 'responses';
type ScanMode = 'medicine' | 'prescription';

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
  // ── Text search ──
  const [medicineName, setMedicineName] = useState('');
  const [strength, setStrength] = useState('');
  const [searchPhase, setSearchPhase] = useState<SearchPhase>('idle');
  const [responses, setResponses] = useState<PharmacistResponse[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [waitingTooLong, setWaitingTooLong] = useState(false);

  // ── Dispatch modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [userState, setUserState] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoObtained, setGeoObtained] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [pendingMedicines, setPendingMedicines] = useState<Medicine[]>([]);
  const [extracting, setExtracting] = useState(false);

  // ── Scanner ──
  const [scanMode, setScanMode] = useState<ScanMode>('medicine');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<Medicine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanFileRef = useRef<HTMLInputElement>(null);

  const { brain, logger } = useNexusBrain();
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
          logger.emit('CONNECT', `📱 ${r.pharmacistName}: ${r.available ? `AVAILABLE — price: ${r.price}` : 'NOT AVAILABLE'}`);
        }
      }
      if (hadNew && waitTimerRef.current) {
        clearTimeout(waitTimerRef.current);
        setWaitingTooLong(false);
      }
    } catch { /* ignore */ }
  }, [requestId, logger]);

  useEffect(() => {
    if (searchPhase !== 'responses' || !requestId) return;
    poll();
    const interval = setInterval(poll, 2500);
    waitTimerRef.current = setTimeout(() => setWaitingTooLong(true), 45000);
    return () => {
      clearInterval(interval);
      if (waitTimerRef.current) clearTimeout(waitTimerRef.current);
    };
  }, [searchPhase, requestId, poll]);

  // Attach camera stream once <video> is mounted
  useEffect(() => {
    if (showCamera && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [showCamera]);

  // ── Geo ──
  const captureGeo = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoObtained(true);
        setGeoLoading(false);
        logger.emit('SYSTEM', `📍 Location: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
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
    if (!/^\+?[\d]{7,15}$/.test(clean)) { setPhoneError('Enter a valid phone number'); return false; }
    setPhoneError('');
    return true;
  };

  const handleDispatchSubmit = async () => {
    if (!userState) return;
    if (!validatePhone(userPhone)) return;
    setModalOpen(false);
    await runSearch(pendingMedicines, userState);
  };

  // ── Core dispatch ──
  const runSearch = async (medicines: Medicine[], state: string) => {
    setSearchPhase('scanning');
    setResponses([]);
    setWaitingTooLong(false);
    seenIds.current = new Set();

    const summary = medicines.map((m) => `${m.name}${m.strength ? ' ' + m.strength : ''}`).join(', ');
    logger.emit('SYSTEM', `📢 Dispatching for ${medicines.length} medicine(s): ${summary}`);
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
      logger.emit('SYSTEM', `📋 Request ID: ${data.requestId}`);
      logger.emit('ROUTE', `⏳ Waiting for pharmacist responses...`);
      await delay(1500);
      setSearchPhase('responses');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `Dispatch failed: ${msg}`);
      setSearchPhase('idle');
    }
  };

  // ── Text search trigger ──
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

  // ── URL param triggers ──
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
    resetScan();
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

  // ── Scanner helpers ──
  const compressImage = (dataUrl: string, maxDim = 1024): Promise<string> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = dataUrl;
    });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      setCapturedImage(null);
      setScanResults([]);
      setScanError(null);
      setShowCamera(true);
    } catch {
      logger.emit('ERROR', 'Camera access denied or unavailable');
      setScanError('Camera access denied — please allow camera permission and try again.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const raw = canvas.toDataURL('image/jpeg', 0.85);
      const compressed = await compressImage(raw, 1024);
      setCapturedImage(compressed);
      setScanError(null);
      stopCamera();
      processScan(compressed);
    }
  };

  const handleScanFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const compressed = await compressImage(raw, 1024);
      setCapturedImage(compressed);
      setScanResults([]);
      setScanError(null);
      processScan(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processScan = async (imageData: string) => {
    setScanning(true);
    setScanResults([]);
    setScanError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intent: any = scanMode === 'medicine' ? 'SCAN_MEDICINE' : 'SCAN_PRESCRIPTION';
      logger.emit('SYSTEM', `📸 Starting ${scanMode} scan...`);

      const scanResult = await brain.extractMedicines(
        { type: 'image', image: imageData, mimeType: 'image/jpeg' },
        intent
      );

      if (scanResult.medicines.length > 0) {
        setScanResults(scanResult.medicines);
        setMedicineName(scanResult.medicines.map((m) => m.name).join(', '));
        logger.emit('CONNECT', `✅ Scan complete — ${scanResult.medicines.length} medicine(s) found`);
      } else {
        setScanError('No medicines could be extracted. Try a clearer or closer image.');
        logger.emit('ERROR', '⚠️ No medicines found in image.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `Scan failed: ${msg}`);
      const isTimeout = msg.includes('timed out') || msg.includes('unavailable');
      setScanError(
        isTimeout
          ? scanMode === 'prescription'
            ? 'Prescription scan timed out — try again or use a printed prescription.'
            : 'Scan timed out — please try again.'
          : 'Scan failed — check your connection and try again.'
      );
    } finally {
      setScanning(false);
    }
  };

  const resetScan = () => {
    setCapturedImage(null);
    setScanResults([]);
    setScanError(null);
    setScanning(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  };

  const bestDealIdx = responses.findIndex((r) => r.available);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(192,132,252,0.1)' }}>
          <SearchIcon sx={{ color: '#C084FC', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>Smart Search</Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Type or scan · Pharmacist Connection Engine · Powered by Gemma 4
          </Typography>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* Idle — unified search + scan form */}
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
                  sx={{ bgcolor: '#1B5E20', '&:hover': { bgcolor: '#2E7D32' }, py: 1.5, fontWeight: 700 }}
                >
                  {extracting ? 'Identifying medicines…' : 'Find Medicines'}
                </Button>

                {/* ── Scanner section ── */}
                <Box>
                  {/* Hairline divider */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.05)' }} />
                    <Typography sx={{ fontSize: '0.63rem', color: '#2D3748', letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                      or scan it
                    </Typography>
                    <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(255,255,255,0.05)' }} />
                  </Box>

                  {/* Mode chips + dismiss */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    {(['medicine', 'prescription'] as ScanMode[]).map((mode) => (
                      <Chip
                        key={mode}
                        label={mode === 'medicine' ? '💊 Medicine Box' : '📋 Prescription'}
                        onClick={() => { setScanMode(mode); resetScan(); }}
                        size="small"
                        sx={{
                          bgcolor: scanMode === mode ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${scanMode === mode ? 'rgba(74,222,128,0.22)' : 'rgba(255,255,255,0.06)'}`,
                          color: scanMode === mode ? '#4ADE80' : '#475569',
                          fontWeight: scanMode === mode ? 700 : 400,
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          transition: 'all 0.18s',
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    ))}
                    {(capturedImage || showCamera) && (
                      <IconButton size="small" onClick={resetScan} sx={{ ml: 'auto', color: '#2D3748', '&:hover': { color: '#64748B' } }}>
                        <CloseIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    )}
                  </Box>

                  {/* Drop zone */}
                  {!capturedImage && !showCamera && (
                    <Box sx={{
                      border: '1.5px dashed rgba(74,222,128,0.14)',
                      borderRadius: '10px',
                      p: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1.25,
                      bgcolor: 'rgba(74,222,128,0.015)',
                    }}>
                      <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <Button size="small" startIcon={<CameraAltIcon sx={{ fontSize: 15 }} />} onClick={startCamera}
                          sx={{ border: '1px solid rgba(74,222,128,0.2)', color: '#4ADE80', textTransform: 'none', fontSize: '0.78rem', borderRadius: '8px', px: 1.5, '&:hover': { borderColor: '#4ADE80', bgcolor: 'rgba(74,222,128,0.06)' } }}>
                          Camera
                        </Button>
                        <Button size="small" startIcon={<ImageIcon sx={{ fontSize: 15 }} />} onClick={() => scanFileRef.current?.click()}
                          sx={{ border: '1px solid rgba(255,255,255,0.08)', color: '#475569', textTransform: 'none', fontSize: '0.78rem', borderRadius: '8px', px: 1.5, '&:hover': { borderColor: 'rgba(74,222,128,0.2)', color: '#4ADE80' } }}>
                          Gallery
                        </Button>
                      </Box>
                      <Typography sx={{ fontSize: '0.63rem', color: '#2D3748', textAlign: 'center' }}>
                        Gemma 4 Vision reads the box or prescription automatically
                      </Typography>
                    </Box>
                  )}

                  {/* Live camera */}
                  {showCamera && (
                    <Box sx={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', bgcolor: '#000', height: 220 }}>
                      <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <IconButton onClick={stopCamera}
                        sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', p: 0.75, '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}>
                        <CloseIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                      <Box sx={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)' }}>
                        <IconButton onClick={capturePhoto}
                          sx={{ width: 54, height: 54, bgcolor: '#4ADE80', color: '#fff', border: '3px solid rgba(255,255,255,0.3)', '&:hover': { bgcolor: '#22C55E' } }}>
                          <CameraAltIcon sx={{ fontSize: 24 }} />
                        </IconButton>
                      </Box>
                    </Box>
                  )}

                  {/* Captured image */}
                  {capturedImage && (
                    <Box sx={{
                      position: 'relative', borderRadius: '10px', overflow: 'hidden',
                      border: `2px solid ${scanning ? '#FBBF24' : scanResults.length > 0 ? '#4ADE80' : scanError ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.06)'}`,
                      transition: 'border-color 0.3s',
                    }}>
                      <img src={capturedImage} alt="Scan" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
                      {scanning && (
                        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                          <CircularProgress sx={{ color: '#00E5A0' }} size={26} />
                          <Typography sx={{ color: '#00E5A0', fontSize: '0.78rem', fontWeight: 600 }}>Gemma 4 Vision analyzing…</Typography>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Scan results */}
                  {scanResults.length > 0 && !scanning && (
                    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '10px', bgcolor: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.16)' }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#4ADE80', mb: 1 }}>
                        ✅ {scanResults.length} medicine{scanResults.length > 1 ? 's' : ''} found
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                        {scanResults.map((m, i) => (
                          <Chip key={i}
                            label={`${m.name}${m.strength ? ` ${m.strength}` : ''}`}
                            size="small"
                            sx={{ bgcolor: 'rgba(74,222,128,0.08)', color: '#4ADE80', fontSize: '0.68rem', border: '1px solid rgba(74,222,128,0.16)', height: 22, '& .MuiChip-label': { px: 0.75 } }}
                          />
                        ))}
                      </Box>
                      <Button variant="contained" fullWidth size="small" startIcon={<SearchIcon />}
                        onClick={() => openModal(scanResults)}
                        sx={{ bgcolor: '#1B5E20', '&:hover': { bgcolor: '#2E7D32' }, textTransform: 'none', fontWeight: 700, borderRadius: '8px', py: 0.85 }}>
                        Search these medicines →
                      </Button>
                    </Box>
                  )}

                  {/* Scan error */}
                  {scanError && !scanning && (
                    <Box sx={{ mt: 1.5, p: 1.25, borderRadius: '10px', bgcolor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#F87171', fontWeight: 600, mb: 0.4 }}>Scan failed</Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: '#94A3B8', mb: 1, lineHeight: 1.5 }}>{scanError}</Typography>
                      <Box sx={{ display: 'flex', gap: 1.5 }}>
                        <Typography onClick={() => capturedImage && processScan(capturedImage)}
                          sx={{ fontSize: '0.72rem', color: '#4ADE80', cursor: 'pointer', '&:hover': { color: '#86EFAC' } }}>
                          Try again
                        </Typography>
                        <Typography sx={{ fontSize: '0.72rem', color: '#2D3748' }}>·</Typography>
                        <Typography onClick={resetScan}
                          sx={{ fontSize: '0.72rem', color: '#475569', cursor: 'pointer', '&:hover': { color: '#94A3B8' } }}>
                          Scan another
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* Scan another after success */}
                  {capturedImage && !scanning && scanResults.length > 0 && (
                    <Typography onClick={resetScan}
                      sx={{ fontSize: '0.7rem', color: '#2D3748', mt: 1, cursor: 'pointer', display: 'inline-block', '&:hover': { color: '#475569' } }}>
                      ← Scan another
                    </Typography>
                  )}

                  <input ref={scanFileRef} type="file" accept="image/*" hidden onChange={handleScanFileUpload} />
                </Box>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Radar animation */}
        {(searchPhase === 'scanning' || searchPhase === 'routing') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 4 }}>
              <Box sx={{ width: 220, height: 220, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {[1, 2, 3].map((ring) => (
                  <Box key={ring} sx={{
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
                  }} />
                ))}
                <Box sx={{
                  position: 'absolute', width: '50%', height: '100%',
                  top: 0, left: '50%', transformOrigin: 'left center',
                  background: 'linear-gradient(90deg, transparent, rgba(192,132,252,0.3), transparent)',
                  animation: 'radarSweep 3s linear infinite',
                  '@keyframes radarSweep': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
                }} />
                {searchPhase === 'routing' && [
                  { top: '20%', left: '30%', delay: '0s' },
                  { top: '50%', left: '70%', delay: '0.3s' },
                  { top: '75%', left: '40%', delay: '0.6s' },
                  { top: '35%', left: '80%', delay: '0.9s' },
                ].map((dot, i) => (
                  <Box key={i} sx={{
                    position: 'absolute', top: dot.top, left: dot.left,
                    width: 8, height: 8, borderRadius: '50%',
                    bgcolor: '#C084FC', boxShadow: '0 0 8px #C084FC',
                    animation: 'dotPulse 1.5s ease-in-out infinite',
                    animationDelay: dot.delay,
                    '@keyframes dotPulse': {
                      '0%, 100%': { transform: 'scale(0.5)', opacity: 0.5 },
                      '50%': { transform: 'scale(1.3)', opacity: 1 },
                    },
                  }} />
                ))}
                <Box sx={{
                  width: 48, height: 48, borderRadius: '50%',
                  bgcolor: 'rgba(192,132,252,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 1, border: '2px solid rgba(192,132,252,0.3)',
                }}>
                  <LocalPharmacyIcon sx={{ color: '#C084FC' }} />
                </Box>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#C084FC' }}>
                  {searchPhase === 'scanning'
                    ? `Scanning pharmacists in ${userState || 'your area'}...`
                    : `Notifying pharmacists in ${userState || 'your area'}...`}
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>{medicineName}</Typography>
              </Box>
            </Box>
          </motion.div>
        )}

        {/* Live responses */}
        {searchPhase === 'responses' && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#E0F2F1' }}>Pharmacist Responses</Typography>
              {responses.length > 0 && (
                <Chip label={`${responses.length} received`} size="small"
                  sx={{ bgcolor: 'rgba(0,229,160,0.1)', color: '#00E5A0', fontWeight: 700, fontSize: '0.65rem', height: 20 }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                <Box sx={{
                  width: 6, height: 6, borderRadius: '50%', bgcolor: '#4ADE80', boxShadow: '0 0 6px #4ADE80',
                  animation: 'livePulse 2s ease-in-out infinite',
                  '@keyframes livePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } },
                }} />
                <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>Live</Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <AnimatePresence>
                {responses.map((r, i) => {
                  const isBest = i === bestDealIdx && r.available;
                  return (
                    <motion.div key={r.pharmacistId} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
                      <Card sx={{
                        bgcolor: isBest ? 'rgba(0,229,160,0.04)' : 'rgba(15,23,42,0.6)',
                        border: `1px solid ${isBest ? 'rgba(0,229,160,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        transition: 'all 0.2s',
                        '&:hover': { border: `1px solid ${isBest ? 'rgba(0,229,160,0.4)' : 'rgba(192,132,252,0.2)'}` },
                      }}>
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                            <Avatar sx={{
                              bgcolor: r.available ? (isBest ? 'rgba(0,229,160,0.15)' : 'rgba(74,222,128,0.1)') : 'rgba(248,113,113,0.08)',
                              width: 44, height: 44, flexShrink: 0,
                            }}>
                              <LocalPharmacyIcon sx={{ color: r.available ? (isBest ? '#00E5A0' : '#4ADE80') : '#F87171', fontSize: 22 }} />
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                                <Typography sx={{ fontWeight: 700, color: '#E0F2F1', fontSize: '0.9rem' }}>{r.pharmacistName}</Typography>
                                {isBest && <Chip label="Best Deal" size="small" sx={{ bgcolor: 'rgba(0,229,160,0.15)', color: '#00E5A0', fontSize: '0.6rem', fontWeight: 700, height: 18 }} />}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                  {r.available ? <CheckCircleIcon sx={{ fontSize: 13, color: '#00E5A0' }} /> : <CancelIcon sx={{ fontSize: 13, color: '#F87171' }} />}
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
                                  <Typography sx={{ fontWeight: 700, color: '#00E5A0', fontSize: '1.05rem' }}>{r.price.toLocaleString()}</Typography>
                                  <Typography sx={{ color: '#64748B', fontSize: '0.65rem', mb: 0.75 }}>est. price</Typography>
                                </>
                              )}
                              <Button variant={isBest ? 'contained' : 'outlined'} size="small" disabled={!r.available} onClick={() => selectPharmacist(r)}
                                sx={{
                                  fontSize: '0.7rem', fontWeight: 700, py: 0.5, px: 1.5, minWidth: 80, textTransform: 'none', borderRadius: '8px',
                                  ...(isBest
                                    ? { bgcolor: '#00E5A0', color: '#0F172A', '&:hover': { bgcolor: '#00C987' } }
                                    : { borderColor: r.available ? 'rgba(192,132,252,0.4)' : 'rgba(255,255,255,0.08)', color: r.available ? '#C084FC' : '#334155' }),
                                }}>
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

              {responses.length === 0 && !waitingTooLong && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3, px: 2 }}>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {[0, 1, 2].map((i) => (
                      <Box key={i} sx={{
                        width: 7, height: 7, borderRadius: '50%', bgcolor: '#C084FC',
                        animation: 'dotBounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s`,
                        '@keyframes dotBounce': { '0%, 80%, 100%': { transform: 'scale(0.5)', opacity: 0.3 }, '40%': { transform: 'scale(1)', opacity: 1 } },
                      }} />
                    ))}
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>Waiting for pharmacists to respond…</Typography>
                    <Typography sx={{ color: '#475569', fontSize: '0.75rem' }}>They were just notified — responses appear here in real time</Typography>
                  </Box>
                </Box>
              )}

              {responses.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, px: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.4 }}>
                    {[0, 1, 2].map((i) => (
                      <Box key={i} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#64748B', animation: 'dotBounce 1.2s ease-in-out infinite', animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </Box>
                  <Typography sx={{ color: '#475569', fontSize: '0.72rem' }}>More responses may arrive…</Typography>
                </Box>
              )}

              {waitingTooLong && responses.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4, px: 3, border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 3 }}>
                  <Typography sx={{ color: '#64748B', fontWeight: 600, mb: 0.5 }}>No responses yet</Typography>
                  <Typography sx={{ color: '#475569', fontSize: '0.8rem', mb: 2 }}>Pharmacists may be offline. Try again or search a different area.</Typography>
                  <Button onClick={reset} sx={{ color: '#C084FC', textTransform: 'none', fontSize: '0.82rem' }}>Start new search</Button>
                </Box>
              )}
            </Box>

            <Button variant="outlined" size="small" onClick={reset}
              sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.1)', color: '#94A3B8', textTransform: 'none', '&:hover': { borderColor: '#C084FC', color: '#C084FC' } }}>
              ← New Search
            </Button>
          </Box>
        )}
      </Box>

      {/* ── Dispatch Modal ── */}
      <Dialog open={modalOpen} onClose={() => setModalOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#0D1526', border: '1px solid rgba(192,132,252,0.18)', borderRadius: '20px', maxWidth: 400, width: '100%', m: 2, overflow: 'hidden' } } }}>
        <Box sx={{ px: 3, pt: 3, pb: 2.5, background: 'linear-gradient(135deg, rgba(192,132,252,0.12) 0%, rgba(139,92,246,0.06) 60%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '14px', bgcolor: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
            <MyLocationIcon sx={{ color: '#C084FC', fontSize: 24 }} />
          </Box>
          <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: '#F1F5F9', letterSpacing: '-0.01em' }}>Where are you?</Typography>
          <Typography sx={{ color: '#94A3B8', fontSize: '0.82rem', mt: 0.5, lineHeight: 1.5 }}>
            We&apos;ll alert pharmacists in your state and find the best deals nearby.
          </Typography>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 3, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>Your Location</Typography>
            <TextField fullWidth size="small" placeholder="e.g. Manchester, London, Lagos, Nairobi…" value={userState} onChange={(e) => setUserState(e.target.value)}
              slotProps={{ input: { startAdornment: <EditLocationAltIcon sx={{ color: '#64748B', fontSize: 18, mr: 1 }} /> } }}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(192,132,252,0.35)' }, '&.Mui-focused fieldset': { borderColor: '#C084FC', borderWidth: '1.5px' } }, '& .MuiInputBase-input::placeholder': { color: '#475569' } }} />
          </Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.75 }}>Mobile Number</Typography>
            <TextField fullWidth size="small" placeholder="e.g. +44 7700 900123" value={userPhone}
              onChange={(e) => { setUserPhone(e.target.value); if (phoneError) validatePhone(e.target.value); }}
              error={!!phoneError} helperText={phoneError || 'Pharmacists will call or message this number'}
              slotProps={{ input: { startAdornment: <Box sx={{ display: 'flex', alignItems: 'center', mr: 1 }}><PhoneIcon sx={{ color: '#64748B', fontSize: 16 }} /></Box> } }}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(15,23,42,0.7)', color: '#E0F2F1', borderRadius: '10px', fontSize: '0.9rem', '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' }, '&:hover fieldset': { borderColor: 'rgba(192,132,252,0.35)' }, '&.Mui-focused fieldset': { borderColor: '#C084FC', borderWidth: '1.5px' }, '&.Mui-error fieldset': { borderColor: '#F87171' } }, '& .MuiInputBase-input::placeholder': { color: '#475569' }, '& .MuiFormHelperText-root': { color: phoneError ? '#F87171' : '#475569', fontSize: '0.72rem', mt: 0.5, ml: 0 } }} />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, py: 1.25, borderRadius: '10px', mb: 2.5, bgcolor: geoObtained ? 'rgba(0,229,160,0.06)' : 'rgba(255,255,255,0.03)', border: `1px solid ${geoObtained ? 'rgba(0,229,160,0.22)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.3s ease' }}>
            <Box sx={{ width: 32, height: 32, borderRadius: '8px', flexShrink: 0, bgcolor: geoObtained ? 'rgba(0,229,160,0.12)' : 'rgba(100,116,139,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {geoLoading
                ? <Box sx={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(192,132,252,0.2)', borderTopColor: '#C084FC', animation: 'spin 0.8s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />
                : <MyLocationIcon sx={{ fontSize: 16, color: geoObtained ? '#00E5A0' : '#64748B' }} />}
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
              <Button size="small" onClick={captureGeo}
                sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#C084FC', textTransform: 'none', minWidth: 0, px: 1.25, py: 0.5, borderRadius: '8px', flexShrink: 0, bgcolor: 'rgba(192,132,252,0.08)', '&:hover': { bgcolor: 'rgba(192,132,252,0.15)' } }}>
                Allow
              </Button>
            )}
            {geoObtained && <CheckCircleIcon sx={{ fontSize: 18, color: '#00E5A0', flexShrink: 0 }} />}
          </Box>
          <Button variant="contained" fullWidth disabled={!userState || !userPhone.trim()} onClick={handleDispatchSubmit}
            sx={{
              background: userState && userPhone.trim() ? 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)' : 'rgba(255,255,255,0.05)',
              color: userState && userPhone.trim() ? '#fff' : '#334155',
              fontWeight: 700, fontSize: '0.92rem', py: 1.4, borderRadius: '12px',
              boxShadow: userState && userPhone.trim() ? '0 8px 24px rgba(168,85,247,0.35)' : 'none',
              textTransform: 'none', letterSpacing: '0.01em', transition: 'all 0.25s ease',
              '&:hover': {
                background: userState && userPhone.trim() ? 'linear-gradient(135deg, #9333EA 0%, #6D28D9 100%)' : 'rgba(255,255,255,0.05)',
                boxShadow: userState && userPhone.trim() ? '0 12px 32px rgba(168,85,247,0.45)' : 'none',
              },
              '&.Mui-disabled': { background: 'rgba(255,255,255,0.05)', color: '#334155' },
            }}>
            Notify Pharmacists →
          </Button>
        </DialogContent>
      </Dialog>

      <canvas ref={canvasRef} hidden />
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
