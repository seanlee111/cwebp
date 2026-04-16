import type { FileItem } from '../core/queue';
import type { EncoderMode } from '../core/encoder';

// Soft thresholds (Phase 4 spec §7.1). Above these we warn but still encode.
const SOFT_WARN_IMAGE_BYTES = 50 * 1024 * 1024;
const SOFT_WARN_VIDEO_BYTES = 100 * 1024 * 1024;
const SOFT_WARN_DURATION_SEC = 20;

/** Any reason to flag this item as "this might take a while"? */
export function isLargeItem(item: FileItem): boolean {
  if (item.kind === 'video') {
    if (item.originalSize > SOFT_WARN_VIDEO_BYTES) return true;
    if (item.videoMeta && item.videoMeta.duration > SOFT_WARN_DURATION_SEC) return true;
    return false;
  }
  return item.originalSize > SOFT_WARN_IMAGE_BYTES;
}

/**
 * Rough time estimate in seconds. Based on Phase 3 empirical numbers
 * (10 s 720p MP4 ≈ 30 s single-thread ffmpeg) and WASM lossless image
 * bench (~300 ms per MB on a mid-tier laptop). Always a loose upper bound.
 */
export function estimateEncodeSeconds(
  item: FileItem,
  imageMode: EncoderMode,
): number {
  const sizeMb = item.originalSize / 1024 / 1024;
  if (item.kind === 'video') {
    return Math.max(5, Math.ceil(sizeMb * 3));
  }
  // image
  const perMb = imageMode === 'wasm' ? 0.3 : 0.1;
  return Math.max(1, Math.ceil(sizeMb * perMb));
}

/** Format a seconds value into a loose "X 秒 / X 分钟" string for UI. */
export function formatEstimate(seconds: number): string {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const m = Math.round(seconds / 60);
  return `约 ${m} 分钟`;
}
