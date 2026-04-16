/**
 * Canvas-based WebP encoder — the "high speed" path.
 *
 * Runs in BOTH environments:
 *  - Main thread: uses HTMLCanvasElement.toBlob (widest browser coverage,
 *    Safari 14+ / Chrome 32+ / Firefox 65+ all OK).
 *  - Worker:      uses OffscreenCanvas.convertToBlob (required — Worker
 *    has no DOM).
 *
 * Picking the right path at runtime (`typeof document`) lets the same
 * module serve encoderClient's main-thread fallback AND encoder.worker.ts
 * without touching DOM APIs from a Worker.
 *
 * Phase 4 note: an earlier rewrite made this module OffscreenCanvas-only
 * and moved `supportsWebPEncoding` to the same path. That broke startup
 * on browsers where OffscreenCanvas.convertToBlob('image/webp') returns
 * the wrong MIME (or isn't implemented) even though the classic canvas
 * toBlob path works fine — so users saw the "浏览器不支持 WebP 编码"
 * fallback page. This version reverts the feature probe to the DOM path
 * and restores the main-thread DOM encoder alongside the Worker path.
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

const isMainThread = typeof document !== 'undefined';

export async function encodeCanvas(
  file: File,
  opts: CanvasEncodeOptions,
): Promise<Blob> {
  if (!isSupportedInput(file)) {
    throw new ConversionError(`不支持的格式: ${file.type || '未知'}`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new ConversionError('图片解码失败（文件可能已损坏）', cause);
  }

  const q = clamp(opts.quality, 0, 100) / 100;

  return isMainThread ? encodeDOM(bitmap, q) : encodeOffscreen(bitmap, q);
}

async function encodeDOM(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) {
    bitmap.close();
    throw new ConversionError('Canvas 2D 上下文不可用');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') resolve(blob);
        else reject(new ConversionError('WebP 编码失败（浏览器未返回 image/webp）'));
      },
      'image/webp',
      quality,
    );
  });
}

async function encodeOffscreen(bitmap: ImageBitmap, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined') {
    bitmap.close();
    throw new ConversionError('当前环境缺少 OffscreenCanvas');
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
      quality,
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
 * Startup feature probe. Uses HTMLCanvasElement.toBlob regardless of whether
 * the encoding path will eventually go through a Worker — this function
 * is only called from the main thread and answers the question "can the
 * browser encode WebP at all?", not "can it do it off the main thread?".
 */
export async function supportsWebPEncoding(): Promise<boolean> {
  if (!isMainThread) return false; // should never be called here, but be safe
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return await new Promise<boolean>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob?.type === 'image/webp'),
        'image/webp',
      );
    });
  } catch {
    return false;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
