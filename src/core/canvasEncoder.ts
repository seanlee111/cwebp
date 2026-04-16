/**
 * Canvas-based WebP encoder — the "high speed" path.
 *
 * Phase 4: rewritten to be worker-safe. Uses OffscreenCanvas +
 * `convertToBlob` everywhere, which works in both main thread and Worker.
 * No DOM API references remain, so this module can be imported from
 * `encoder.worker.ts`.
 *
 * Fallback for browsers without OffscreenCanvas (very old Safari) is
 * handled one level up in encoderClient — if the feature-detect says
 * the worker path isn't available, the main thread calls these same
 * functions directly, and the OffscreenCanvas requirement still holds.
 * OffscreenCanvas is now widely supported (Chrome 69+, Firefox 105+,
 * Safari 16.4+).
 */
import { ConversionError } from './errors';

export interface CanvasEncodeOptions {
  /** Quality 0..100. */
  quality: number;
}

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg']);

export function isSupportedInput(file: File): boolean {
  return SUPPORTED_MIME.has(file.type);
}

/** True when both the runtime and toBlob-over-Canvas support WebP. */
export function supportsOffscreenWebP(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof OffscreenCanvas.prototype.convertToBlob === 'function'
  );
}

export async function encodeCanvas(
  file: File,
  opts: CanvasEncodeOptions,
): Promise<Blob> {
  if (!isSupportedInput(file)) {
    throw new ConversionError(`不支持的格式: ${file.type || '未知'}`);
  }
  if (!supportsOffscreenWebP()) {
    throw new ConversionError('当前环境不支持 OffscreenCanvas');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new ConversionError('图片解码失败（文件可能已损坏）', cause);
  }

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    bitmap.close();
    throw new ConversionError('OffscreenCanvas 2D 上下文不可用');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  try {
    const blob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: clamp(opts.quality, 0, 100) / 100,
    });
    if (blob.type !== 'image/webp') {
      throw new ConversionError('WebP 编码失败（浏览器未返回 image/webp）');
    }
    return blob;
  } catch (cause) {
    if (cause instanceof ConversionError) throw cause;
    throw new ConversionError('WebP 编码失败', cause);
  }
}

/**
 * Feature-detect WebP encoding support. Runs a 1×1 probe through the same
 * OffscreenCanvas path the actual encode uses.
 */
export async function supportsWebPEncoding(): Promise<boolean> {
  if (!supportsOffscreenWebP()) return false;
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const blob = await canvas.convertToBlob({ type: 'image/webp' });
    return blob.type === 'image/webp';
  } catch {
    return false;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
