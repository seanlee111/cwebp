/**
 * Main-thread client for the encoding Web Worker.
 *
 * Owns a single Worker instance, serialises requests by numeric id, and
 * bridges the Worker's WASM load-state events back to local listeners so
 * the public `subscribeWasmState` API from encoder.ts stays unchanged.
 *
 * Feature-detects Worker + OffscreenCanvas. If either is missing (very
 * old Safari), `canUseWorker` is false and encoder.ts falls back to calling
 * the main-thread encoders directly — the UX still works, just without the
 * off-main-thread benefit.
 */
import EncoderWorker from './encoder.worker?worker';
import type { WorkerRequest, WorkerResponse } from './encoder.worker';
import type { WasmLoadState } from './wasmEncoder';
import { ConversionError } from './errors';

export const canUseWorker =
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof OffscreenCanvas.prototype.convertToBlob === 'function';

let worker: Worker | null = null;
let nextRequestId = 1;
interface PendingEntry {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
}
const pending = new Map<number, PendingEntry>();

const wasmListeners = new Set<(state: WasmLoadState) => void>();
let currentWasmState: WasmLoadState = 'idle';

function getWorker(): Worker {
  if (worker) return worker;
  worker = new EncoderWorker({ name: 'cwebp-encoder' });

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    if (msg.kind === 'wasmState') {
      currentWasmState = msg.state;
      for (const fn of wasmListeners) fn(msg.state);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.kind === 'done') {
      p.resolve(msg.blob);
    } else {
      p.reject(new ConversionError(msg.message));
    }
  };

  worker.onerror = (e) => {
    // Fatal worker error — fail every outstanding request
    const errMsg = e.message || 'worker 内部错误';
    for (const [id, p] of pending) {
      p.reject(new ConversionError(errMsg));
      pending.delete(id);
    }
  };

  return worker;
}

/** Promise-based encode via the Worker. */
export async function workerEncode(
  mode: 'canvas' | 'wasm',
  file: File,
  quality: number,
): Promise<Blob> {
  const w = getWorker();
  const id = nextRequestId++;
  return new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const req: WorkerRequest = { kind: 'encode', id, mode, file, quality };
    w.postMessage(req);
  });
}

/** Kick off WASM load inside the worker ahead of demand. */
export function workerPreloadWasm(): void {
  const w = getWorker();
  const req: WorkerRequest = { kind: 'preloadWasm' };
  w.postMessage(req);
}

/** Latest known WASM state received from the worker. */
export function workerWasmState(): WasmLoadState {
  return currentWasmState;
}

/** Subscribe to WASM state events. Starts the worker so we can receive them. */
export function subscribeWorkerWasmState(
  fn: (s: WasmLoadState) => void,
): () => void {
  wasmListeners.add(fn);
  fn(currentWasmState);
  // Spawn the worker so its initial subscribeWasmState fires and we see 'idle'
  getWorker();
  return () => {
    wasmListeners.delete(fn);
  };
}
