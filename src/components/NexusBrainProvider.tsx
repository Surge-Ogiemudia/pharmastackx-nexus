'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { nexusBrain } from '@/lib/nexus-brain';
import { nexusLogger, type NexusLogEntry } from '@/lib/nexus-logger';
import { nexusEdge, type EdgeStatus } from '@/lib/nexus-edge';

interface NexusBrainContextValue {
  brain: typeof nexusBrain;
  logger: typeof nexusLogger;
  logs: NexusLogEntry[];
  stats: ReturnType<typeof nexusLogger.getStats>;
  edgeStatus: EdgeStatus;
  edgeProgress: number;
  edgeDownloadedMB: number;
  edgeTotalMB: number;
  demoMode: boolean;
  setDemoMode: (value: boolean) => void;
  forceEdge: boolean;
  setForceEdge: (value: boolean) => void;
  isOnline: boolean;
  inferenceMode: 'cloud' | 'edge';
  clearLogs: () => void;
}

const NexusBrainContext = createContext<NexusBrainContextValue | null>(null);

export function NexusBrainProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<NexusLogEntry[]>([]);
  const [stats, setStats] = useState(nexusLogger.getStats());
  const [edgeStatus, setEdgeStatus] = useState<EdgeStatus>('uninitialized');
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [edgeDownloadedMB, setEdgeDownloadedMB] = useState(0);
  const [edgeTotalMB, setEdgeTotalMB] = useState(0);
  const [demoMode, setDemoModeState] = useState(true); // Default ON for hackathon
  const [forceEdge, setForceEdgeState] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Subscribe to logger
  useEffect(() => {
    const unsubscribe = nexusLogger.subscribe((entry) => {
      setLogs((prev) => [...prev.slice(-199), entry]);
      setStats(nexusLogger.getStats());
    });
    return unsubscribe;
  }, []);

  // Subscribe to edge status
  useEffect(() => {
    const unsubscribe = nexusEdge.onStatusChange((status, progress, downloadedMB, totalMB) => {
      setEdgeStatus(status);
      setEdgeProgress(progress);
      setEdgeDownloadedMB(downloadedMB);
      setEdgeTotalMB(totalMB);
    });
    return unsubscribe;
  }, []);

  // Network status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
      nexusLogger.emit('SYSTEM', '🌐 Network restored — Cloud inference available');
    };
    const handleOffline = () => {
      setIsOnline(false);
      nexusLogger.emit('SYSTEM', '✈️ Network lost — Switching to Edge inference');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Boot sequence
  useEffect(() => {
    nexusLogger.emit('SYSTEM', '🧠 Nexus Brain v1.0 initialized — Gemma 4 ready');
    nexusLogger.emit('SYSTEM', `🌐 Network: ${navigator.onLine ? 'Online (Cloud mode)' : 'Offline (Edge mode)'}`);
    
    // Initialize Edge engine in background
    nexusEdge.initialize().catch(err => {
      console.error('Edge init error:', err);
    });
  }, []);

  const setDemoMode = useCallback((value: boolean) => {
    setDemoModeState(value);
    nexusBrain.demoMode = value;
  }, []);

  const setForceEdge = useCallback((value: boolean) => {
    setForceEdgeState(value);
    nexusBrain.forceEdge = value;
  }, []);

  const clearLogs = useCallback(() => {
    nexusLogger.clear();
    setLogs([]);
    setStats(nexusLogger.getStats());
  }, []);

  const inferenceMode = forceEdge || !isOnline ? 'edge' : 'cloud';

  return (
    <NexusBrainContext.Provider
      value={{
        brain: nexusBrain,
        logger: nexusLogger,
        logs,
        stats,
        edgeStatus,
        edgeProgress,
        edgeDownloadedMB,
        edgeTotalMB,
        demoMode,
        setDemoMode,
        forceEdge,
        setForceEdge,
        isOnline,
        inferenceMode,
        clearLogs,
      }}
    >
      {children}
    </NexusBrainContext.Provider>
  );
}

export function useNexusBrain(): NexusBrainContextValue {
  const context = useContext(NexusBrainContext);
  if (!context) {
    throw new Error('useNexusBrain must be used within a NexusBrainProvider');
  }
  return context;
}
