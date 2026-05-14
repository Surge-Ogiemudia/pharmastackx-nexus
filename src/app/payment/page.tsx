'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Avatar,
  Divider,
} from '@mui/material';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PaymentIcon from '@mui/icons-material/Payment';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MedicationIcon from '@mui/icons-material/Medication';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { PharmacistMatch, Medicine } from '@/lib/nexus-brain';

interface OrderData {
  pharmacist: PharmacistMatch;
  medicines: Medicine[];
  userState: string;
  userPhone: string;
}

type PaymentPhase = 'summary' | 'processing' | 'success';

export default function PaymentPage() {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [phase, setPhase] = useState<PaymentPhase>('summary');
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem('psx_order');
      if (raw) setOrder(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const handlePay = async () => {
    setPhase('processing');
    // Simulate Paystack processing
    await delay(2800);
    setPhase('success');
    // Clear the order after success
    localStorage.removeItem('psx_order');
  };

  const handleNewSearch = () => {
    router.push('/search');
  };

  if (!order) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ color: '#64748B', mb: 2 }}>No order data found.</Typography>
          <Button onClick={() => router.push('/search')} sx={{ color: '#C084FC', textTransform: 'none' }}>
            ← Back to Search
          </Button>
        </Box>
      </Box>
    );
  }

  const { pharmacist, medicines, userState, userPhone } = order;
  const subtotal = pharmacist.price ?? 0;
  const deliveryFee = 500;
  const total = subtotal + deliveryFee;

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
        <Button
          onClick={() => router.back()}
          startIcon={<ArrowBackIcon />}
          sx={{ color: '#94A3B8', textTransform: 'none', minWidth: 0, p: 0.5 }}
        />
        <Box sx={{ p: 1, borderRadius: '10px', bgcolor: 'rgba(0,229,160,0.1)' }}>
          <PaymentIcon sx={{ color: '#00E5A0', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
            Complete Order
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', fontSize: '0.75rem' }}>
            Secure payment via Paystack
          </Typography>
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>

        <AnimatePresence mode="wait">

          {/* ── Summary & Pay ── */}
          {phase === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* Pharmacist Card */}
                <Card sx={{ bgcolor: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.2)' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, '&:last-child': { pb: 2 } }}>
                    <Avatar sx={{ bgcolor: 'rgba(0,229,160,0.15)', width: 48, height: 48 }}>
                      <LocalPharmacyIcon sx={{ color: '#00E5A0', fontSize: 24 }} />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 700, color: '#E0F2F1' }}>{pharmacist.name}</Typography>
                      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <LocationOnIcon sx={{ fontSize: 13, color: '#94A3B8' }} />
                          <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>{pharmacist.address}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTimeIcon sx={{ fontSize: 13, color: '#94A3B8' }} />
                          <Typography sx={{ fontSize: '0.75rem', color: '#94A3B8' }}>{pharmacist.responseTime} away</Typography>
                        </Box>
                      </Box>
                    </Box>
                    <Chip
                      label="Selected"
                      size="small"
                      sx={{ bgcolor: 'rgba(0,229,160,0.15)', color: '#00E5A0', fontWeight: 700, fontSize: '0.65rem' }}
                    />
                  </CardContent>
                </Card>

                {/* Medicines */}
                <Card sx={{ bgcolor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#94A3B8', mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                      Medicines ({medicines.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {medicines.map((med, i) => (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <MedicationIcon sx={{ fontSize: 16, color: '#C084FC' }} />
                          <Box sx={{ flex: 1 }}>
                            <Typography sx={{ fontSize: '0.875rem', color: '#E0F2F1', fontWeight: 600 }}>
                              {med.name}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: '#64748B' }}>
                              {[med.strength, med.form, med.quantity ? `×${med.quantity}` : null].filter(Boolean).join(' · ')}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>

                {/* Patient Info */}
                <Card sx={{ bgcolor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#94A3B8', mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                      Your Details
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>State</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: '#E0F2F1' }}>{userState}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>Mobile</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: '#E0F2F1' }}>{userPhone}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                {/* Price Summary */}
                <Card sx={{ bgcolor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#94A3B8', mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                      Order Summary
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.85rem', color: '#94A3B8' }}>Medicines subtotal</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1' }}>₦{subtotal.toLocaleString()}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.85rem', color: '#94A3B8' }}>Dispatch fee</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#E0F2F1' }}>₦{deliveryFee.toLocaleString()}</Typography>
                      </Box>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 0.5 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#E0F2F1' }}>Total</Typography>
                        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#00E5A0' }}>
                          ₦{total.toLocaleString()}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                {/* Pay Button */}
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handlePay}
                  sx={{
                    bgcolor: '#00E5A0',
                    color: '#0F172A',
                    fontWeight: 700,
                    py: 1.75,
                    fontSize: '1rem',
                    borderRadius: 2,
                    '&:hover': { bgcolor: '#00C987' },
                  }}
                >
                  Pay ₦{total.toLocaleString()} with Paystack
                </Button>

                <Typography sx={{ textAlign: 'center', fontSize: '0.7rem', color: '#475569' }}>
                  Secured by Paystack · 256-bit SSL encryption
                </Typography>
              </Box>
            </motion.div>
          )}

          {/* ── Processing ── */}
          {phase === 'processing' && (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 8 }}>
                <Box
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    border: '3px solid rgba(0,229,160,0.2)',
                    borderTopColor: '#00E5A0',
                    animation: 'spin 1s linear infinite',
                    '@keyframes spin': {
                      from: { transform: 'rotate(0deg)' },
                      to: { transform: 'rotate(360deg)' },
                    },
                  }}
                />
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#E0F2F1' }}>
                    Processing Payment
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', mt: 0.5 }}>
                    Connecting to Paystack...
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          )}

          {/* ── Success ── */}
          {phase === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, py: 6 }}>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', damping: 10 }}
                >
                  <Box
                    sx={{
                      width: 96,
                      height: 96,
                      borderRadius: '50%',
                      bgcolor: 'rgba(0,229,160,0.1)',
                      border: '2px solid rgba(0,229,160,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircleIcon sx={{ fontSize: 52, color: '#00E5A0' }} />
                  </Box>
                </motion.div>

                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#E0F2F1' }}>
                    Order Confirmed!
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', mt: 0.75, maxWidth: 300 }}>
                    Your medicines have been requested from {pharmacist.name}. They will contact you on {userPhone}.
                  </Typography>
                </Box>

                {/* Confirmation details */}
                <Card sx={{ bgcolor: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.15)', width: '100%', maxWidth: 360 }}>
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>Pharmacy</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: '#E0F2F1', textAlign: 'right', maxWidth: '60%' }}>{pharmacist.name}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>ETA</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: '#E0F2F1' }}>{pharmacist.responseTime}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>Amount paid</Typography>
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#00E5A0' }}>₦{total.toLocaleString()}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                <Button
                  variant="outlined"
                  onClick={handleNewSearch}
                  sx={{
                    borderColor: 'rgba(255,255,255,0.1)',
                    color: '#94A3B8',
                    textTransform: 'none',
                    '&:hover': { borderColor: '#C084FC', color: '#C084FC' },
                  }}
                >
                  Find More Medicines
                </Button>
              </Box>
            </motion.div>
          )}

        </AnimatePresence>
      </Box>
    </Box>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
