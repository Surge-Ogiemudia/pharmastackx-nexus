// Nexus Edge — On-device Gemma 4 E2B via MediaPipe WebGPU
// First run: downloads model and caches it in OPFS (Origin Private File System).
// Subsequent runs: loads instantly from device cache — no re-download.

import { nexusLogger } from './nexus-logger';

export type EdgeStatus = 'uninitialized' | 'loading' | 'ready' | 'unavailable' | 'error';

const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.task';
const MODEL_SIZE_BYTES = 1_930_000_000;
const OPFS_DIR = 'gemma4-cache';
const OPFS_FILE = 'gemma-4-E2B-it-web.task';

interface EdgeEngine {
  generateResponse(prompt: string, callback: (partial: string, done: boolean) => void): Promise<string>;
}

type StatusListener = (
  status: EdgeStatus,
  progress: number,
  downloadedMB: number,
  totalMB: number
) => void;

class NexusEdge {
  private engine: EdgeEngine | null = null;
  private _status: EdgeStatus = 'uninitialized';
  private _progress = 0;
  private _downloadedMB = 0;
  private _totalMB = 0;
  private statusListeners: Set<StatusListener> = new Set();

  get status(): EdgeStatus { return this._status; }
  get progress(): number { return this._progress; }
  get downloadedMB(): number { return this._downloadedMB; }
  get totalMB(): number { return this._totalMB; }

  private setStatus(
    status: EdgeStatus,
    progress = this._progress,
    downloadedMB = this._downloadedMB,
    totalMB = this._totalMB
  ) {
    this._status = status;
    this._progress = progress;
    this._downloadedMB = downloadedMB;
    this._totalMB = totalMB;
    this.statusListeners.forEach((l) => l(status, progress, downloadedMB, totalMB));
  }

  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async checkWebGPU(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  // ── OPFS helpers ────────────────────────────────────────────────────────────

  private async loadFromOPFS(): Promise<Uint8Array | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_DIR);
      const fileHandle = await dir.getFileHandle(OPFS_FILE);
      const file = await fileHandle.getFile();
      const sizeMB = Math.round(file.size / 1024 / 1024);
      nexusLogger.emit('SYSTEM', `📦 Found cached model (${sizeMB} MB) — loading from device storage...`);
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return null; // Not cached yet
    }
  }

  private async saveToOPFS(data: Uint8Array): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
      const fileHandle = await dir.getFileHandle(OPFS_FILE, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data.buffer);
      await writable.close();
      nexusLogger.emit('SYSTEM', '💾 Model saved to device storage — future loads will skip the download');
    } catch (err) {
      // Non-fatal — model still works from memory this session
      nexusLogger.emit('ERROR', `⚠️ Could not save model to device: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this._status === 'ready' || this._status === 'loading') return;

    const hasWebGPU = await this.checkWebGPU();
    if (!hasWebGPU) {
      nexusLogger.emit('SYSTEM', '⚠️ WebGPU not available — Edge mode unavailable');
      this.setStatus('unavailable');
      return;
    }

    this.setStatus('loading', 0, 0, 0);
    nexusLogger.emit('SYSTEM', '📥 Initializing Gemma 4 E2B via MediaPipe WebGPU...');

    try {
      const { FilesetResolver, LlmInference } = await import('@mediapipe/tasks-genai');

      nexusLogger.emit('SYSTEM', '📦 Loading MediaPipe WASM runtime...');
      this.setStatus('loading', 2);

      const genai = await FilesetResolver.forGenAiTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm'
      );
      this.setStatus('loading', 5);

      // ── Try OPFS cache first ───────────────────────────────────────────────
      let modelBuffer = await this.loadFromOPFS();

      if (modelBuffer) {
        // Loaded from cache — fast path
        const sizeMB = Math.round(modelBuffer.byteLength / 1024 / 1024);
        this.setStatus('loading', 90, sizeMB, sizeMB);
      } else {
        // ── Download with real progress ──────────────────────────────────────
        nexusLogger.emit('SYSTEM', '⬇️ Downloading Gemma 4 E2B model (~1.93 GB) — will cache after...');

        const response = await fetch(MODEL_URL);
        if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
        if (!response.body) throw new Error('Streaming not supported in this browser');

        const contentLength = response.headers.get('Content-Length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : MODEL_SIZE_BYTES;
        const totalMB = Math.round(totalBytes / 1024 / 1024);
        this.setStatus('loading', 5, 0, totalMB);

        modelBuffer = new Uint8Array(totalBytes);
        const reader = response.body.getReader();
        let receivedBytes = 0;
        let lastLogTime = performance.now();
        let lastLoggedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          modelBuffer.set(value, receivedBytes);
          receivedBytes += value.length;

          const downloadedMB = Math.round(receivedBytes / 1024 / 1024);
          const progress = Math.round(5 + (receivedBytes / totalBytes) * 83);
          this.setStatus('loading', Math.min(progress, 88), downloadedMB, totalMB);

          const now = performance.now();
          if (now - lastLogTime >= 8000) {
            const elapsed = (now - lastLogTime) / 1000;
            const speedMBps = ((receivedBytes - lastLoggedBytes) / 1024 / 1024 / elapsed).toFixed(1);
            nexusLogger.emit(
              'SYSTEM',
              `⬇️ ${downloadedMB} MB / ${totalMB} MB @ ${speedMBps} MB/s`
            );
            lastLogTime = now;
            lastLoggedBytes = receivedBytes;
          }
        }

        const downloadedMB = Math.round(receivedBytes / 1024 / 1024);
        nexusLogger.emit('SYSTEM', `✅ Download complete — ${downloadedMB} MB`);
        this.setStatus('loading', 90, downloadedMB, totalMB);

        // Save to OPFS so next visit skips download
        nexusLogger.emit('SYSTEM', '💾 Saving model to device storage...');
        await this.saveToOPFS(modelBuffer);
      }

      // ── Load into MediaPipe ───────────────────────────────────────────────
      nexusLogger.emit('SYSTEM', '🔧 Loading model into WebGPU engine...');
      this.setStatus('loading', 93);

      const llm = await LlmInference.createFromOptions(genai, {
        baseOptions: { modelAssetBuffer: modelBuffer },
        maxTokens: 2048, // 512 was too small for system prompt + answer; E2B supports up to 8k
        topK: 40,
        temperature: 0.7,
        randomSeed: 42,
      });

      this.engine = {
        generateResponse: (prompt, callback) =>
          new Promise<string>((resolve) => {
            let full = '';
            llm.generateResponse(prompt, (partial: string, done: boolean) => {
              full += partial;
              callback(partial, done);
              if (done) resolve(full);
            });
          }),
      };

      this.setStatus('ready', 100, this._downloadedMB, this._totalMB);
      nexusLogger.emit('SYSTEM', '✅ Gemma 4 E2B Edge engine ready — on-device inference enabled');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      nexusLogger.emit('ERROR', `❌ Edge initialization failed: ${message}`);
      this.setStatus('error');
    }
  }

  // ── Inference ────────────────────────────────────────────────────────────────

  async infer(prompt: string): Promise<string> {
    if (!this.engine || this._status !== 'ready') {
      const statusMsg: Record<string, string> = {
        loading: `Gemma 4 E2B is still loading (${this._downloadedMB} MB / ${this._totalMB} MB). Please wait before going offline.`,
        unavailable: 'On-device inference requires WebGPU. Please use a Chromium-based browser.',
        error: 'The Gemma 4 E2B engine failed to load. Please reload the page on a stable connection.',
        uninitialized: 'Gemma 4 E2B has not started loading. Connect to the internet to download the model (~1.93 GB) first.',
      };
      const msg = statusMsg[this._status] ?? 'Gemma 4 E2B is not ready.';
      nexusLogger.emit('ERROR', `❌ Edge not ready (${this._status})`);
      throw new Error(msg);
    }

    const start = performance.now();
    nexusLogger.emit('INFERENCE', '📱 Running on-device inference (Gemma 4 E2B)...');

    let tokenCount = 0;
    let result: string;
    try {
      result = await this.engine.generateResponse(prompt, (partial, done) => {
        tokenCount++;
        if (!done && tokenCount % 5 === 0) {
          nexusLogger.emit('TOKEN', `Edge streaming: ${tokenCount} tokens...`, { count: tokenCount });
        }
      });
    } catch (err) {
      // Engine stuck (overflow or interrupted) — reset so next call can recover
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Previous invocation') || msg.includes('INVALID_ARGUMENT') || msg.includes('Input is too long')) {
        nexusLogger.emit('SYSTEM', '🔄 Edge engine stuck — resetting for next use...');
        this.engine = null;
        this._status = 'uninitialized';
        // Reload from OPFS cache in background so next call works
        this.initialize().catch(() => {});
      }
      throw err;
    }

    const duration = Math.round(performance.now() - start);
    nexusLogger.emit('INFERENCE', `📱 Edge complete: ${tokenCount} tokens in ${duration}ms`, { count: tokenCount }, duration);

    // Trim any fake continuation the model generates (e.g. "\nUser: ...\nPharmacist:")
    const stopIdx = result.search(/\n(User|Pharmacist|Q|Question):/);
    return (stopIdx !== -1 ? result.slice(0, stopIdx) : result).trim();
  }
}

export const nexusEdge = new NexusEdge();
