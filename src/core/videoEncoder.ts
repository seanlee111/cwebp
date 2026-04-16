/**
 * Video → animated WebP encoder, powered by ffmpeg.wasm (single-thread build).
 *
 * The entire pipeline lives in its own module so Vite can code-split it out
 * of the critical bundle. `@ffmpeg/core` (the ~10 MB WASM blob) is fetched
 * on demand via dynamic `?url` imports — it lands as its own asset under
 * `dist/assets/` and is cached by the browser HTTP layer on subsequent
 * visits.
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { ConversionError } from './errors';

export type FfmpegLoadState = 'idle' | 'loading' | 'ready' | 'failed';

export interface VideoEncodeOptions {
  /** Output frame rate, e.g. 10/15/20/30. */
  fps: number;
  /** Quality 0..100 (WebP quality flag, higher = bigger file + better). */
  quality: number;
  /** WebP loop count: 0 = infinite, 1 = play once. */
  loopCount: number;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

let loadState: FfmpegLoadState = 'idle';
let lastError: unknown = null;
let ffmpegPromise: Promise<FFmpeg> | null = null;

const listeners = new Set<(state: FfmpegLoadState) => void>();

function setState(next: FfmpegLoadState, err?: unknown): void {
  loadState = next;
  lastError = err ?? null;
  for (const l of listeners) l(next);
}

export function getFfmpegState(): FfmpegLoadState {
  return loadState;
}

export function getFfmpegError(): unknown {
  return lastError;
}

export function subscribeFfmpegState(fn: (state: FfmpegLoadState) => void): () => void {
  listeners.add(fn);
  fn(loadState);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Dynamic-import and initialise ffmpeg. Safe to call concurrently — all
 * callers share the same Promise. On failure the promise is cleared so the
 * next call retries from scratch.
 */
export async function loadFfmpeg(): Promise<FFmpeg> {
  if (loadState === 'ready' && ffmpegPromise) return ffmpegPromise;
  if (loadState === 'loading' && ffmpegPromise) return ffmpegPromise;

  setState('loading');
  ffmpegPromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }, coreModule, wasmModule] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
      // package.json `exports` of @ffmpeg/core only publishes "." and "./wasm",
      // so we hit those entrypoints with the Vite `?url` suffix to get asset URLs
      // instead of importing the Emscripten glue as a module.
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ]);
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(coreModule.default, 'text/javascript'),
      wasmURL: await toBlobURL(wasmModule.default, 'application/wasm'),
    });
    setState('ready');
    return ff;
  })().catch((e: unknown) => {
    setState('failed', e);
    ffmpegPromise = null;
    throw e;
  });
  return ffmpegPromise;
}

/**
 * Probe a video File's duration/width/height via a short-lived <video>
 * element. Resolves within 5 s or rejects with a ConversionError.
 */
export async function probeVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise<VideoMetadata>((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    v.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new ConversionError('读取视频元数据超时'));
    }, 5_000);

    v.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const meta: VideoMetadata = {
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
      };
      cleanup();
      resolve(meta);
    };
    v.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new ConversionError('无法读取视频（格式不支持或文件损坏）'));
    };
  });
}

/**
 * Capture the first frame of a video File as a data URL for the thumbnail.
 * Uses a one-off <video> + <canvas>, doesn't require ffmpeg.
 */
export async function captureFirstFrame(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    const url = URL.createObjectURL(file);
    v.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('thumbnail timeout'));
    }, 5_000);

    v.onloadeddata = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no ctx');
        ctx.drawImage(v, 0, 0);
        const data = canvas.toDataURL('image/jpeg', 0.6);
        window.clearTimeout(timeout);
        cleanup();
        resolve(data);
      } catch (e) {
        window.clearTimeout(timeout);
        cleanup();
        reject(e);
      }
    };
    v.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('video load failed'));
    };
  });
}

/**
 * Encode a video File into animated WebP via ffmpeg.wasm.
 * Deletes its MEMFS inputs/outputs on completion to keep memory bounded
 * across successive calls.
 */
export async function encodeVideoToWebP(
  file: File,
  opts: VideoEncodeOptions,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const ff = await loadFfmpeg();
  const { fetchFile } = await import('@ffmpeg/util');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const inputName = `in.${ext}`;
  const outputName = 'out.webp';

  const onFfProgress = (data: { progress: number }) => {
    const p = Number(data.progress);
    if (Number.isFinite(p)) onProgress(Math.min(1, Math.max(0, p)));
  };
  ff.on('progress', onFfProgress);

  try {
    await ff.writeFile(inputName, await fetchFile(file));
    await ff.exec([
      '-i', inputName,
      '-loop', String(opts.loopCount),
      '-vf', `fps=${opts.fps},scale='min(1920,iw)':'-2':flags=lanczos`,
      '-quality', String(opts.quality),
      '-preset', 'default',
      '-an',
      outputName,
    ]);
    const data = await ff.readFile(outputName);
    if (typeof data === 'string') {
      throw new ConversionError('FFmpeg 返回了意外的文本数据');
    }
    // Copy into a plain-ArrayBuffer-backed Uint8Array so TS sees a non-shared buffer
    // (TS 5.7+ distinguishes ArrayBuffer from SharedArrayBuffer for Blob parts).
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(data);
    return new Blob([bytes], { type: 'image/webp' });
  } catch (cause) {
    if (cause instanceof ConversionError) throw cause;
    throw new ConversionError('视频编码失败', cause);
  } finally {
    ff.off('progress', onFfProgress);
    try {
      await ff.deleteFile(inputName);
    } catch {
      // ignore
    }
    try {
      await ff.deleteFile(outputName);
    } catch {
      // ignore
    }
  }
}
