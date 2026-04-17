import { useEffect, useMemo, useState } from 'react';
import { Film } from 'lucide-react';
import type { FileItem } from '../core/queue';
import { probeKeyColor } from '../core/encoder';
import { useLocalStorage } from '../hooks/useLocalStorage';

const MAX_SEQUENCE_TOTAL_BYTES = 300 * 1024 * 1024;

export interface SequenceComposeOptions {
  readonly chromaKey: boolean;
  readonly chromaTolerance: number;
}

interface SequenceActionsProps {
  readonly items: readonly FileItem[];
  readonly onCompose: (files: File[], opts: SequenceComposeOptions) => void;
}

export function SequenceActions({ items, onCompose }: SequenceActionsProps) {
  const [chromaKey, setChromaKey] = useLocalStorage<boolean>(
    'cwebp.sequence.chromaKey',
    false,
  );
  const [tolerance, setTolerance] = useLocalStorage<number>(
    'cwebp.sequence.chromaTolerance',
    10,
  );

  const imageFrames = useMemo(
    () => items.filter((i) => i.kind === 'image').map((i) => i.file),
    [items],
  );

  const firstImageFile = useMemo(
    () => items.find((i) => i.kind === 'image')?.file ?? null,
    [items],
  );

  // Phase 7: async probe of the key color for the preview swatch
  const [keyColorHex, setKeyColorHex] = useState<string | null>(null);
  useEffect(() => {
    if (!chromaKey || !firstImageFile) {
      setKeyColorHex(null);
      return;
    }
    let cancelled = false;
    void probeKeyColor(firstImageFile)
      .then(({ r, g, b }) => {
        if (cancelled) return;
        const hex =
          '#' +
          [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
        setKeyColorHex(hex);
      })
      .catch(() => {
        if (!cancelled) setKeyColorHex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [chromaKey, firstImageFile]);

  if (imageFrames.length < 2) return null;

  const totalBytes = imageFrames.reduce((s, f) => s + f.size, 0);
  const totalMb = Math.round(totalBytes / 1024 / 1024);
  const overLimit = totalBytes > MAX_SEQUENCE_TOTAL_BYTES;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1.5">
        <label
          className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700"
          title="将第一帧左上角 (0,0) 像素颜色作为背景色，输出时把所有匹配像素变透明"
        >
          <input
            type="checkbox"
            checked={chromaKey}
            onChange={(e) => setChromaKey(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          <span>扣掉左上角背景色</span>
          {chromaKey && keyColorHex && (
            <span
              className="inline-block h-4 w-4 rounded border border-slate-300"
              style={{ backgroundColor: keyColorHex }}
              title={`Key color: ${keyColorHex}`}
            />
          )}
        </label>

        {chromaKey && (
          <label className="flex items-center gap-2 pl-6 text-xs text-slate-500">
            <span className="w-8">容差</span>
            <input
              type="range"
              min={0}
              max={50}
              value={tolerance}
              onChange={(e) => setTolerance(Number(e.target.value))}
              className="w-28 accent-indigo-600"
              aria-label="抠色容差"
            />
            <span className="w-6 text-right tabular-nums">{tolerance}</span>
          </label>
        )}
      </div>

      <button
        type="button"
        disabled={overLimit}
        onClick={() =>
          onCompose(imageFrames, { chromaKey, chromaTolerance: tolerance })
        }
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
