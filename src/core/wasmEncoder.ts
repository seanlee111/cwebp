/**
 * WASM-based WebP encoder — the "true lossless" path.
 *
 * Environment-aware: uses OffscreenCanvas when available (faster, no DOM
 * overhead — and it's the only option in a Worker), otherwise falls back
 * to an HTMLCanvasElement on the main thread. Either way we end up with
 * an ImageData that @jsquash/webp can consume.
 *
 * Module-level state (load promise, subscribers) is per-realm: when this
 * module is imported from encoder.worker.ts the Worker has its own copy
 * of the state and the main thread mirrors it via postMessage.
 */
import { ConversionError } from './errors';

export type WasmLoadState = 'idle' | 'loading' | 'ready' | 'failed';

let modulePromise: Promise<typeof import('@jsquash/webp')> | null = null;
let loadState: WasmLoadState = 'idle';
let lastError: unknown = null;

const listeners = new Set<(state: WasmLoadState) => void>();

function setState(next: WasmLoadState, err?: unknown): void {
  loadState = next;
  lastError = err ?? null;
  for (const l of listeners) l(next);
}

export function getWasmState(): WasmLoadState {
  return loadState;
}

export function getWasmError(): unknown {
  return lastError;
}

export function subscribeWasmState(fn: (state: WasmLoadState) => void): () => void {
  listeners.add(fn);
  fn(loadState);
  return () => {
    listeners.delete(fn);
  };
}

export async function loadWasm(): Promise<void> {
  if (loadState === 'ready' && modulePromise) {
    await modulePromise;
    return;
  }
  if (loadState === 'loading' && modulePromise) {
    await modulePromise;
    return;
  }
  setState('loading');
  modulePromise = import('@jsquash/webp')
    .then((m) => {
      setState('ready');
      return m;
    })
    .catch((e: unknown) => {
      setState('failed', e);
      modulePromise = null;
      throw e;
    });
  await modulePromise;
}

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg']);
const isMainThread = typeof document !== 'undefined';

export async function encodeWasmLossless(file: File): Promise<Blob> {
  if (!SUPPORTED_MIME.has(file.type)) {
    throw new ConversionError(`不支持的格式: ${file.type || '未知'}`);
  }

  if (loadState !== 'ready') {
    try {
      await loadWasm();
    } catch (cause) {
      throw new ConversionError('WASM 编码器加载失败', cause);
    }
  }
  if (!modulePromise) {
    throw new ConversionError('WASM 编码器未就绪');
  }
  const mod = await modulePromise;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new ConversionError('图片解码失败（文件可能已损坏）', cause);
  }

  const imageData = extractImageData(bitmap);
  bitmap.close();

  try {
    const buffer = await mod.encode(imageData, { lossless: 1, quality: 100 });
    return new Blob([buffer], { type: 'image/webp' });
  } catch (cause) {
    throw new ConversionError('WASM 编码失败', cause);
  }
}

function extractImageData(bitmap: ImageBitmap): ImageData {
  // Prefer OffscreenCanvas (works in both threads, less DOM overhead)
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = offscreen.getContext('2d', { alpha: true });
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    }
  }
  // Main-thread fallback for browsers without OffscreenCanvas
  if (isMainThread) {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new ConversionError('Canvas 2D 上下文不可用');
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  }
  throw new ConversionError('当前环境缺少 OffscreenCanvas');
}
