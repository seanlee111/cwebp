/**
 * Unified encoder entry point — public API.
 *
 * Phase 4: Image path (canvas + wasm lossless) now goes through a Web Worker
 * by default via `encoderClient`. When the browser lacks Worker or
 * OffscreenCanvas (very old Safari), `canUseWorker` is false and we fall
 * back to calling the main-thread encoders directly. API shape is unchanged.
 *
 * Video path is still its own lazy-loaded module (ffmpeg.wasm + own worker).
 */
import {
  encodeCanvas,
  supportsWebPEncoding as canvasFeatureDetect,
} from './canvasEncoder';
import {
  encodeWasmLossless,
  getWasmState as getWasmStateMain,
  loadWasm as loadWasmMain,
  subscribeWasmState as subscribeWasmStateMain,
  type WasmLoadState,
} from './wasmEncoder';
import {
  canUseWorker,
  subscribeWorkerWasmState,
  workerEncode,
  workerPreloadWasm,
  workerWasmState,
} from './encoderClient';

export type EncoderMode = 'canvas' | 'wasm';

export interface EncodeOptions {
  mode: EncoderMode;
  /** Only consulted when mode === 'canvas'. */
  quality: number;
}

export async function encode(file: File, opts: EncodeOptions): Promise<Blob> {
  if (canUseWorker) {
    return workerEncode(opts.mode, file, opts.quality);
  }
  // Fallback: main-thread direct call
  if (opts.mode === 'wasm') {
    return encodeWasmLossless(file);
  }
  return encodeCanvas(file, { quality: opts.quality });
}

/** Synchronous WASM state getter (switches source based on runtime) */
export function getWasmState(): WasmLoadState {
  return canUseWorker ? workerWasmState() : getWasmStateMain();
}

/** Subscribe to WASM load state transitions. */
export function subscribeWasmState(fn: (s: WasmLoadState) => void): () => void {
  return canUseWorker ? subscribeWorkerWasmState(fn) : subscribeWasmStateMain(fn);
}

/**
 * Ask the active encoder (worker or main) to preload the WASM module.
 * In worker mode this fires a message and returns immediately; the
 * actual load completion is observable via `subscribeWasmState`.
 */
export async function loadWasm(): Promise<void> {
  if (canUseWorker) {
    workerPreloadWasm();
    return;
  }
  return loadWasmMain();
}

// Synchronous re-exports
export { isSupportedInput } from './canvasEncoder';
export { ConversionError } from './errors';

/** 1×1 probe to verify the browser can emit WebP at all. */
export async function supportsWebPEncoding(): Promise<boolean> {
  return canvasFeatureDetect();
}

// ── Video side — lazy, unchanged ───────────────────────────────────────────

import type {
  FfmpegLoadState,
  VideoEncodeOptions,
  VideoMetadata,
} from './videoEncoder';

let videoModulePromise: Promise<typeof import('./videoEncoder')> | null = null;

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

export async function preloadVideoEncoder(): Promise<void> {
  const mod = await loadVideoModule();
  await mod.loadFfmpeg();
}

export async function subscribeVideoState(
  fn: (state: FfmpegLoadState) => void,
): Promise<() => void> {
  const mod = await loadVideoModule();
  return mod.subscribeFfmpegState(fn);
}

export type { FfmpegLoadState, VideoEncodeOptions, VideoMetadata };
export type { WasmLoadState } from './wasmEncoder';
