/**
 * Unified encoder entry point — strategy dispatcher between the two backends.
 *
 * - mode: 'canvas' → high-speed, main-bundle, lossy via HTMLCanvasElement.toBlob
 * - mode: 'wasm'   → true lossless via @jsquash/webp (lazy-loaded)
 *
 * Consumers (App.tsx, queue processor) should only depend on this module;
 * canvasEncoder / wasmEncoder are internal implementation details.
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

// Re-exports so App/components only import from './core/encoder'
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
