/**
 * Unified encoder entry point — strategy dispatcher between the backends.
 *
 * Static paths (always in main bundle):
 * - Canvas encoder (lossy, fast)
 * - WASM encoder wrapper (jsquash, true lossless — WASM itself lazy)
 *
 * Lazy paths (only when needed):
 * - Video encoder (ffmpeg.wasm, huge ~10 MB WASM chunk) — loaded via
 *   dynamic import on first video task so image-only sessions never
 *   pay the cost.
 */
import { encodeCanvas } from './canvasEncoder';
import { encodeWasmLossless } from './wasmEncoder';

export type EncoderMode = 'canvas' | 'wasm';

export interface EncodeOptions {
  mode: EncoderMode;
  /** Only consulted when mode === 'canvas'. */
  quality: number;
}

export async function encode(file: File, opts: EncodeOptions): Promise<Blob> {
  if (opts.mode === 'wasm') {
    return encodeWasmLossless(file);
  }
  return encodeCanvas(file, { quality: opts.quality });
}

// Image-side re-exports (synchronous)
export {
  isSupportedInput,
  supportsWebPEncoding,
} from './canvasEncoder';
export {
  getWasmError,
  getWasmState,
  loadWasm,
  subscribeWasmState,
} from './wasmEncoder';
export type { WasmLoadState } from './wasmEncoder';
export { ConversionError } from './errors';

// ── Video side — lazy-loaded on demand ─────────────────────────────────────

import type {
  FfmpegLoadState,
  VideoEncodeOptions,
  VideoMetadata,
} from './videoEncoder';

let videoModulePromise: Promise<typeof import('./videoEncoder')> | null = null;

/** Kick off the dynamic import of videoEncoder (and transitively @ffmpeg/*). */
function loadVideoModule(): Promise<typeof import('./videoEncoder')> {
  if (!videoModulePromise) {
    videoModulePromise = import('./videoEncoder');
  }
  return videoModulePromise;
}

export async function encodeVideo(
  file: File,
  opts: VideoEncodeOptions,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const mod = await loadVideoModule();
  return mod.encodeVideoToWebP(file, opts, onProgress);
}

export async function probeVideoMetadata(file: File): Promise<VideoMetadata> {
  const mod = await loadVideoModule();
  return mod.probeVideoMetadata(file);
}

export async function captureVideoThumbnail(file: File): Promise<string> {
  const mod = await loadVideoModule();
  return mod.captureFirstFrame(file);
}

/**
 * Fire-and-forget pre-warm so the ~10 MB ffmpeg core fetch starts as soon
 * as the first video task hits the queue, not when the processor gets to it.
 */
export async function preloadVideoEncoder(): Promise<void> {
  const mod = await loadVideoModule();
  await mod.loadFfmpeg();
}

/**
 * Subscribe to ffmpeg load-state transitions. Returns an unsubscribe fn;
 * the Promise resolves once the videoEncoder module itself has been loaded.
 */
export async function subscribeVideoState(
  fn: (state: FfmpegLoadState) => void,
): Promise<() => void> {
  const mod = await loadVideoModule();
  return mod.subscribeFfmpegState(fn);
}

export type { FfmpegLoadState, VideoEncodeOptions, VideoMetadata };
