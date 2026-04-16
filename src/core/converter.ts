/**
 * WebP conversion core — runs entirely in-browser via Canvas API → libwebp.
 * No network calls, no server. Matches Constitution P1 (privacy-first).
 */

export interface ConvertOptions {
  /** Quality 0..100. Ignored when `lossless` is true. */
  quality: number;
  /**
   * Canvas toBlob does not expose true lossless WebP; setting this flag maps
   * to `quality=1.0`, which is "near-lossless" in practice. True lossless
   * (libwebp `-lossless`) is deferred to Phase 2 via @jsquash/webp.
   */
  lossless: boolean;
}

export class ConversionError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ConversionError';
    if (cause !== undefined) this.cause = cause;
  }
}

const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg']);

/** True if the browser can decode and re-encode this file. */
export function isSupportedInput(file: File): boolean {
  return SUPPORTED_MIME.has(file.type);
}

/**
 * Convert a PNG/JPEG File to a WebP Blob.
 * Throws {@link ConversionError} on any failure; caller should display the message.
 */
export async function convertToWebP(
  file: File,
  opts: ConvertOptions,
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

  const q = opts.lossless ? 1 : clamp(opts.quality, 0, 100) / 100;

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === 'image/webp') {
          resolve(blob);
        } else {
          reject(new ConversionError('WebP 编码失败（浏览器未返回 image/webp）'));
        }
      },
      'image/webp',
      q,
    );
  });
}

/** Feature-detect WebP encoding support in this browser. */
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
