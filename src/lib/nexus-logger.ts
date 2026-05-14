// Nexus Logger — Event bus for the Dev Console
// Every AI action emits events here. The DevConsole component subscribes and renders them.

export type LogType = 'INTENT' | 'EXTRACT' | 'ROUTE' | 'INFERENCE' | 'CONNECT' | 'SYSTEM' | 'TOKEN' | 'ERROR';

export interface NexusLogEntry {
  id: string;
  timestamp: Date;
  type: LogType;
  message: string;
  data?: Record<string, unknown>;
  duration?: number; // ms
}

type LogListener = (entry: NexusLogEntry) => void;

class NexusLogger {
  private listeners: Set<LogListener> = new Set();
  private logs: NexusLogEntry[] = [];
  private idCounter = 0;

  emit(type: LogType, message: string, data?: Record<string, unknown>, duration?: number): NexusLogEntry {
    const entry: NexusLogEntry = {
      id: `log_${++this.idCounter}_${Date.now()}`,
      timestamp: new Date(),
      type,
      message,
      data,
      duration,
    };
    this.logs.push(entry);
    // Keep last 200 logs
    if (this.logs.length > 200) {
      this.logs = this.logs.slice(-200);
    }
    this.listeners.forEach((listener) => listener(entry));
    return entry;
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLogs(): NexusLogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
    this.idCounter = 0;
  }

  getStats() {
    const inferLogs = this.logs.filter((l) => l.type === 'INFERENCE');
    const totalTokens = this.logs
      .filter((l) => l.type === 'TOKEN')
      .reduce((sum, l) => sum + ((l.data?.count as number) || 0), 0);
    const avgLatency =
      inferLogs.length > 0
        ? inferLogs.reduce((sum, l) => sum + (l.duration || 0), 0) / inferLogs.length
        : 0;

    return {
      totalLogs: this.logs.length,
      totalTokens,
      avgLatency: Math.round(avgLatency),
      inferenceCount: inferLogs.length,
    };
  }
}

// Singleton
export const nexusLogger = new NexusLogger();
