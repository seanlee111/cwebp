import { Film } from 'lucide-react';
import type { FileItem } from '../core/queue';

const MAX_SEQUENCE_TOTAL_BYTES = 300 * 1024 * 1024;

interface SequenceActionsProps {
  readonly items: readonly FileItem[];
  readonly onCompose: (files: File[]) => void;
}

/**
 * Button that composes the current image items in the queue into a single
 * animated WebP. Appears only when the queue has ≥2 image items (MVP
 * threshold — a 1-frame "animation" isn't useful). Disabled above the
 * 300 MB total-bytes cap to avoid OOM during MEMFS preprocessing.
 */
export function SequenceActions({ items, onCompose }: SequenceActionsProps) {
  const imageFrames = items
    .filter((i) => i.kind === 'image')
    .map((i) => i.file);

  if (imageFrames.length < 2) return null;

  const totalBytes = imageFrames.reduce((s, f) => s + f.size, 0);
  const totalMb = Math.round(totalBytes / 1024 / 1024);
  const overLimit = totalBytes > MAX_SEQUENCE_TOTAL_BYTES;

  return (
    <button
      type="button"
      disabled={overLimit}
      onClick={() => onCompose(imageFrames)}
      title={
        overLimit
          ? `序列总体积 ${totalMb} MB 超过 300 MB 上限`
          : '把队列里所有静态图按文件名自然排序合成为一张 animated WebP（默认保留透明）'
      }
      className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80"
    >
      <Film className="h-4 w-4" aria-hidden="true" />
      {overLimit
        ? `合成动图受限（${totalMb} MB / 300 MB）`
        : `合成为动图（${imageFrames.length} 张）`}
    </button>
  );
}
