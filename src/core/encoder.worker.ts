/// <reference lib="webworker" />
/**
 * Dedicated Web Worker that owns the image encoding pipeline.
 * Keeps Canvas/WASM work off the main thread so large images don't
 * freeze the UI. Video encoding stays outside (ffmpeg.wasm has its own
 * worker infrastructure).
 */
import {
  encodeCanvas,
} from './canvasEncoder';
import {
  encodeWasmLossless,
  loadWasm,
  subscribeWasmState,
  type WasmLoadState,
} from './wasmEncoder';

export type WorkerRequest =
  | {
      kind: 'encode';
      id: number;
      mode: 'canvas' | 'wasm';
      file: File;
      quality: number;
    }
  | { kind: 'preloadWasm' };

export type WorkerResponse =
  | { kind: 'done'; id: number; blob: Blob }
  | { kind: 'error'; id: number; message: string }
  | { kind: 'wasmState'; state: WasmLoadState };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Relay WASM state transitions to the main thread so QualityControl's
// "编码器就绪 / 加载中 / 失败" indicator stays in sync.
subscribeWasmState((state) => {
  const msg: WorkerResponse = { kind: 'wasmState', state };
  ctx.postMessage(msg);
});

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.kind === 'preloadWasm') {
    void loadWasm().catch(() => {
      // subscribeWasmState will surface 'failed'
    });
    return;
  }
  if (req.kind === 'encode') {
    void handleEncode(req);
  }
};

async function handleEncode(
  req: Extract<WorkerRequest, { kind: 'encode' }>,
): Promise<void> {
  try {
    const blob =
      req.mode === 'wasm'
        ? await encodeWasmLossless(req.file)
        : await encodeCanvas(req.file, { quality: req.quality });
    const res: WorkerResponse = { kind: 'done', id: req.id, blob };
    ctx.postMessage(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : '编码失败（未知错误）';
    const res: WorkerResponse = { kind: 'error', id: req.id, message };
    ctx.postMessage(res);
  }
}
