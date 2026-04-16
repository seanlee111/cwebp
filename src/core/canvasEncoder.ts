/**
 * Canvas-based WebP encoder — the "high speed" path.
 * Uses the browser's native libwebp via HTMLCanvasElement.toBlob.
 * Lossy only; quality=1.0 is NOT true lossless.
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

  const q = clamp(opts.quality, 0, 100) / 100;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') resolve(blob);
        else reject(new ConversionError('WebP 编码失败（浏览器未返回 image/webp）'));
      },
      'image/webp',
      q,
    );
  });
}

/** Feature-detect that the browser can emit WebP via toBlob. */
export async function supportsWebPEncoding(): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return new Promise<boolean>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob?.type === 'image/webp'),
      'image/webp',
    );
  });
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
