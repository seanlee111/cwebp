/**
 * WASM-based WebP encoder — the "true lossless" path.
 * Uses @jsquash/webp (libwebp compiled to WebAssembly, by Squoosh team).
 * Lazy-loaded via dynamic import so the WASM bytes stay out of the
 * critical rendering path (Constitution P2 + Phase 2 spec §4 budget).
 */
import { ConversionError } from './errors';

export type WasmLoadState = 'idle' | 'loading' | 'ready' | 'failed';

// Module-scoped singleton state. Living at module scope means multiple
// components can share one load and one subscription set.
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

/** React hook-friendly subscription. Returns an unsubscribe function. */
export function subscribeWasmState(fn: (state: WasmLoadState) => void): () => void {
  listeners.add(fn);
  fn(loadState); // emit current state immediately
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Kick off (or re-use) the WASM module load.
 * Safe to call multiple times — only one import happens.
 * Failed loads are cleared so subsequent calls retry from scratch.
 */
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

/**
 * True lossless WebP encode. Loads the WASM module on demand if not
 * already resident.
 */
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

/**
 * Decode an ImageBitmap to ImageData. Prefers OffscreenCanvas (less DOM overhead)
 * with graceful fallback to a regular <canvas> for older Safari.
 */
function extractImageData(bitmap: ImageBitmap): ImageData {
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = offscreen.getContext('2d', { alpha: true });
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    throw new ConversionError('Canvas 2D 上下文不可用');
  }
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
