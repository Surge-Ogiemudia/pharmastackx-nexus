'use client';

import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  TextField,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraAndroidIcon from '@mui/icons-material/FlipCameraAndroid';
import ImageIcon from '@mui/icons-material/Image';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SearchIcon from '@mui/icons-material/Search';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusBrain } from '@/components/NexusBrainProvider';
import type { Medicine } from '@/lib/nexus-brain';

type ScanMode = 'medicine' | 'prescription';

export default function ScannerPage() {
  const [scanMode, setScanMode] = useState<ScanMode>('medicine');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<Medicine[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { brain, logger } = useNexusBrain();
  const router = useRouter();

  const updateMedicine = (index: number, field: keyof Medicine, value: string | number) => {
    setResults((prev) => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const findMedicines = () => {
    localStorage.setItem('psx_scan_medicines', JSON.stringify(results));
    router.push('/search?scan=1');
  };

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
        video: { facingMode: 'environment', width: 1280, height: 720 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
      setCapturedImage(null);
      setResults([]);
    } catch (err) {
      logger.emit('ERROR', 'Camera access denied or unavailable');
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      const compressed = await compressImage(raw, 1024);
      setCapturedImage(compressed);
      setResults([]);
      setScanError(null);
      processScan(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const processScan = async (imageData: string) => {
    setScanning(true);
    setResults([]);
    setScanError(null);

    try {
      const intent = scanMode === 'medicine' ? 'SCAN_MEDICINE' : 'SCAN_PRESCRIPTION';
      logger.emit('SYSTEM', `📸 Starting ${scanMode} scan...`);

      const medicines = await brain.extractMedicines(
        { type: 'image', image: imageData, mimeType: 'image/jpeg' },
        intent as any
      );

      if (medicines.length > 0) {
        setResults(medicines);
        logger.emit('CONNECT', `✅ Scan complete — ${medicines.length} medicine(s) extracted and ready to search`);
      } else {
        setScanError('No medicines could be extracted. Try a clearer or closer image.');
        logger.emit('ERROR', '⚠️ No medicines could be extracted.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.emit('ERROR', `Scan failed: ${msg}`);
      const isTimeout = msg.includes('timed out') || msg.includes('unavailable');
      setScanError(
        isTimeout
          ? scanMode === 'prescription'
            ? 'Prescription scan timed out — handwritten prescriptions can take longer. Try again or use a printed prescription.'
            : 'Scan timed out — please try again.'
          : 'Scan failed — check your connection and try again.'
      );
    } finally {
      setScanning(false);
    }
  };

  const resetScan = () => {
    setCapturedImage(null);
    setResults([]);
    setScanning(false);
    setScanError(null);
  };

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
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(74,222,128,0.1)' }}>
          <CameraAltIcon sx={{ color: '#4ADE80', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
            AI Scanner
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Medicine & Prescription Reader • Powered by Gemma 4 Vision
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Mode Toggle */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {(['medicine', 'prescription'] as ScanMode[]).map((mode) => (
            <Chip
              key={mode}
              label={mode === 'medicine' ? '💊 Medicine Box' : '📋 Prescription'}
              onClick={() => setScanMode(mode)}
              sx={{
                bgcolor: scanMode === mode ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${scanMode === mode ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: scanMode === mode ? '#4ADE80' : '#94A3B8',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </Box>

        {/* Camera / Image Area */}
        {!capturedImage && !showCamera && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card
              sx={{
                bgcolor: 'rgba(15,23,42,0.6)',
                border: '2px dashed rgba(74,222,128,0.2)',
                minHeight: 300,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': {
                  borderColor: 'rgba(74,222,128,0.4)',
                  bgcolor: 'rgba(15,23,42,0.8)',
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center' }}>
                <Box
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, #4ADE80 0%, #00E5A0 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 2,
                    boxShadow: '0 0 40px rgba(74,222,128,0.2)',
                  }}
                >
                  <CameraAltIcon sx={{ fontSize: 40, color: '#fff' }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  {scanMode === 'medicine'
                    ? 'Photograph a Medicine Box'
                    : 'Photograph a Prescription'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#94A3B8', mb: 3, maxWidth: 350, mx: 'auto' }}>
                  Gemma 4 Vision will extract the medicine name, strength, dosage, and quantity automatically.
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                  <Button
                    variant="contained"
                    startIcon={<CameraAltIcon />}
                    onClick={startCamera}
                    sx={{
                      bgcolor: '#1B5E20',
                      '&:hover': { bgcolor: '#2E7D32' },
                      px: 3,
                    }}
                  >
                    Open Camera
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<ImageIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      borderColor: 'rgba(255,255,255,0.15)',
                      color: '#94A3B8',
                      '&:hover': { borderColor: '#4ADE80', color: '#4ADE80' },
                    }}
                  >
                    Upload Image
                  </Button>
                </Box>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleFileUpload}
                />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Camera View */}
        {showCamera && (
          <Box sx={{ position: 'relative', borderRadius: '12px', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: '12px' }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: 2,
              }}
            >
              <IconButton
                onClick={capturePhoto}
                sx={{
                  width: 64,
                  height: 64,
                  bgcolor: '#4ADE80',
                  color: '#fff',
                  '&:hover': { bgcolor: '#22C55E' },
                  boxShadow: '0 0 20px rgba(74,222,128,0.4)',
                }}
              >
                <CameraAltIcon sx={{ fontSize: 28 }} />
              </IconButton>
            </Box>
          </Box>
        )}

        {/* Captured Image + Results */}
        {capturedImage && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {/* Image Preview */}
              <Box sx={{ flex: '1 1 300px' }}>
                <Box
                  sx={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: scanning
                      ? '2px solid #FBBF24'
                      : results.length > 0
                      ? '2px solid #4ADE80'
                      : '2px solid rgba(255,255,255,0.06)',
                    transition: 'border-color 0.3s ease',
                    position: 'relative',
                  }}
                >
                  <img
                    src={capturedImage}
                    alt="Captured"
                    style={{ width: '100%', maxHeight: 350, objectFit: 'cover' }}
                  />
                  {scanning && (
                    <Box
                      sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <CircularProgress sx={{ color: '#00E5A0' }} />
                      <Typography sx={{ color: '#00E5A0', fontWeight: 600, fontSize: '0.85rem' }}>
                        Gemma 4 Vision analyzing...
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Button
                  size="small"
                  onClick={resetScan}
                  sx={{ mt: 1, color: '#94A3B8', textTransform: 'none' }}
                >
                  ← Scan another
                </Button>
              </Box>

              {/* Error state */}
              {scanError && !scanning && (
                <Box sx={{ flex: '1 1 250px' }}>
                  <Card sx={{ bgcolor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ErrorOutlineIcon sx={{ color: '#EF4444', fontSize: 20 }} />
                        <Typography sx={{ fontWeight: 700, color: '#EF4444', fontSize: '0.85rem' }}>
                          Scan Failed
                        </Typography>
                      </Box>
                      <Typography sx={{ color: '#94A3B8', fontSize: '0.8rem', lineHeight: 1.5 }}>
                        {scanError}
                      </Typography>
                      <Button
                        size="small"
                        startIcon={<RefreshIcon />}
                        onClick={() => capturedImage && processScan(capturedImage)}
                        sx={{
                          alignSelf: 'flex-start',
                          color: '#4ADE80',
                          borderColor: 'rgba(74,222,128,0.3)',
                          border: '1px solid',
                          textTransform: 'none',
                          fontSize: '0.75rem',
                          '&:hover': { bgcolor: 'rgba(74,222,128,0.08)' },
                        }}
                      >
                        Try again
                      </Button>
                    </CardContent>
                  </Card>
                </Box>
              )}

              {/* Results */}
              {results.length > 0 && (
                <Box sx={{ flex: '1 1 250px' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ color: '#4ADE80', fontWeight: 700 }}>
                      ✅ {results.length} Medicine{results.length > 1 ? 's' : ''} Found
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: '#475569' }}>
                      — tap any field to correct
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <AnimatePresence>
                      {results.map((med, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                        >
                          <Card sx={{ bgcolor: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
                            <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 }, display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {/* Medicine name */}
                              <TextField
                                value={med.name}
                                onChange={(e) => updateMedicine(i, 'name', e.target.value)}
                                variant="standard"
                                slotProps={{ input: { disableUnderline: false, sx: { color: '#E0F2F1', fontWeight: 700, fontSize: '0.9rem' } } }}
                                sx={{ '& .MuiInput-underline:before': { borderColor: 'rgba(255,255,255,0.08)' }, '& .MuiInput-underline:hover:before': { borderColor: 'rgba(74,222,128,0.3)' } }}
                              />
                              {/* Strength + Form + Qty row */}
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField
                                  value={med.strength || ''}
                                  onChange={(e) => updateMedicine(i, 'strength', e.target.value)}
                                  placeholder="Strength"
                                  variant="standard"
                                  size="small"
                                  slotProps={{ input: { disableUnderline: false, sx: { color: '#94A3B8', fontSize: '0.75rem' } } }}
                                  sx={{ flex: 1, '& .MuiInput-underline:before': { borderColor: 'rgba(255,255,255,0.06)' } }}
                                />
                                <TextField
                                  value={med.form || ''}
                                  onChange={(e) => updateMedicine(i, 'form', e.target.value)}
                                  placeholder="Form"
                                  variant="standard"
                                  size="small"
                                  slotProps={{ input: { disableUnderline: false, sx: { color: '#94A3B8', fontSize: '0.75rem' } } }}
                                  sx={{ flex: 1, '& .MuiInput-underline:before': { borderColor: 'rgba(255,255,255,0.06)' } }}
                                />
                                <TextField
                                  value={med.quantity || ''}
                                  onChange={(e) => updateMedicine(i, 'quantity', Number(e.target.value) || e.target.value)}
                                  placeholder="Qty"
                                  variant="standard"
                                  size="small"
                                  slotProps={{ input: { disableUnderline: false, sx: { color: '#94A3B8', fontSize: '0.75rem' } } }}
                                  sx={{ width: 48, '& .MuiInput-underline:before': { borderColor: 'rgba(255,255,255,0.06)' } }}
                                />
                              </Box>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </Box>

                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={<SearchIcon />}
                    onClick={findMedicines}
                    sx={{
                      mt: 2, py: 1.5, fontWeight: 700,
                      bgcolor: '#1B5E20', '&:hover': { bgcolor: '#2E7D32' },
                    }}
                  >
                    {results.length === 1
                      ? `Find ${results[0].name.split(' ')[0]}`
                      : `Find all ${results.length} medicines`}
                  </Button>
                </Box>
              )}
            </Box>
          </motion.div>
        )}
      </Box>

      <canvas ref={canvasRef} hidden />
    </Box>
  );
}
