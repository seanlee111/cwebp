interface QualityControlProps {
  readonly quality: number;
  readonly lossless: boolean;
  readonly onQualityChange: (q: number) => void;
  readonly onLosslessChange: (v: boolean) => void;
}

export function QualityControl({
  quality,
  lossless,
  onQualityChange,
  onLosslessChange,
}: QualityControlProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex flex-1 min-w-[260px] items-center gap-3">
          <span className="w-12 text-sm text-slate-700">质量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={quality}
            disabled={lossless}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            className="flex-1 accent-slate-900 disabled:opacity-40"
            aria-label="WebP 质量"
          />
          <span className="w-10 text-right text-sm tabular-nums text-slate-700">
            {lossless ? '—' : quality}
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={lossless}
            onChange={(e) => onLosslessChange(e.target.checked)}
            className="h-4 w-4 accent-slate-900"
          />
          <span className="text-sm text-slate-700">近无损</span>
        </label>
      </div>
      {lossless && (
        <p className="mt-2 text-xs text-slate-500">
          近无损模式（quality=1.0）。透明边缘可能有轻微瑕疵，真正的
          lossless WebP 将在 Phase 2 引入 WASM 编码器后支持。
        </p>
      )}
    </div>
  );
}
