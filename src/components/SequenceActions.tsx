import { Film } from 'lucide-react';
import type { FileItem } from '../core/queue';
import { useLocalStorage } from '../hooks/useLocalStorage';

const MAX_SEQUENCE_TOTAL_BYTES = 300 * 1024 * 1024;

export interface SequenceComposeOptions {
  readonly chromaKey: boolean;
}

interface SequenceActionsProps {
  readonly items: readonly FileItem[];
  readonly onCompose: (files: File[], opts: SequenceComposeOptions) => void;
}

/**
 * Button that composes the current image items in the queue into a single
 * animated WebP. Appears only when the queue has ≥2 image items (MVP
 * threshold — a 1-frame "animation" isn't useful). Disabled above the
 * 300 MB total-bytes cap to avoid OOM during MEMFS preprocessing.
 *
 * Phase 6: an adjacent checkbox toggles chroma-key background removal.
 * When enabled, the first frame's (0,0) pixel RGB becomes the key color
 * and all matching pixels across all frames get alpha=0 during preprocessing.
 * State is persisted to localStorage (`cwebp.sequence.chromaKey`).
 */
export function SequenceActions({ items, onCompose }: SequenceActionsProps) {
  const [chromaKey, setChromaKey] = useLocalStorage<boolean>(
    'cwebp.sequence.chromaKey',
    false,
  );

  const imageFrames = items
    .filter((i) => i.kind === 'image')
    .map((i) => i.file);

  if (imageFrames.length < 2) return null;

  const totalBytes = imageFrames.reduce((s, f) => s + f.size, 0);
  const totalMb = Math.round(totalBytes / 1024 / 1024);
  const overLimit = totalBytes > MAX_SEQUENCE_TOTAL_BYTES;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label
        className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"
        title="将序列的第一帧 (0,0) 像素颜色作为背景色，输出时把所有匹配像素变透明。请把背景色放在左上角。"
      >
        <input
          type="checkbox"
          checked={chromaKey}
          onChange={(e) => setChromaKey(e.target.checked)}
          className="h-4 w-4 accent-indigo-600"
        />
        <span>扣掉左上角背景色</span>
      </label>

      <button
        type="button"
        disabled={overLimit}
        onClick={() => onCompose(imageFrames, { chromaKey })}
        title={
          overLimit
            ? `序列总体积 ${totalMb} MB 超过 300 MB 上限`
            : '按文件名自然排序合成为一张 animated WebP'
        }
        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80"
      >
        <Film className="h-4 w-4" aria-hidden="true" />
        {overLimit
          ? `合成动图受限（${totalMb} MB / 300 MB）`
          : `合成为动图（${imageFrames.length} 张）`}
      </button>
    </div>
  );
}
