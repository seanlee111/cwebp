import type { EncoderMode, WasmLoadState } from '../core/encoder';

export type VideoFps = 10 | 15 | 20 | 30;
export type VideoLoopCount = 0 | 1;

interface QualityControlProps {
  readonly quality: number;
  readonly mode: EncoderMode;
  readonly wasmState: WasmLoadState;
  readonly onQualityChange: (q: number) => void;
  readonly onModeChange: (m: EncoderMode) => void;
  readonly onRetryWasm: () => void;
  /** Whether the queue contains any video tasks — toggles the video section. */
  readonly hasVideo: boolean;
  readonly fps: VideoFps;
  readonly loopCount: VideoLoopCount;
  readonly onFpsChange: (fps: VideoFps) => void;
  readonly onLoopCountChange: (count: VideoLoopCount) => void;
}

const FPS_CHOICES: readonly VideoFps[] = [10, 15, 20, 30];

export function QualityControl({
  quality,
  mode,
  wasmState,
  onQualityChange,
  onModeChange,
  onRetryWasm,
  hasVideo,
  fps,
  loopCount,
  onFpsChange,
  onLoopCountChange,
}: QualityControlProps) {
  const qualityDisabled = mode === 'wasm';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <legend className="sr-only">编码模式</legend>
        <span className="w-20 text-sm text-slate-700">编码模式</span>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="wasm"
            checked={mode === 'wasm'}
            onChange={() => onModeChange('wasm')}
            className="accent-slate-900"
          />
          <span className="text-sm text-slate-700">真无损（WASM）</span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="mode"
            value="canvas"
            checked={mode === 'canvas'}
            onChange={() => onModeChange('canvas')}
            className="accent-slate-900"
          />
          <span className="text-sm text-slate-700">高速（Canvas）</span>
        </label>

        {mode === 'wasm' && (
          <WasmStateIndicator
            state={wasmState}
            onRetry={onRetryWasm}
            onFallback={() => onModeChange('canvas')}
          />
        )}
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="w-20 text-sm text-slate-700">质量</span>
          <input
            type="range"
            min={0}
            max={100}
            value={quality}
            disabled={qualityDisabled}
            onChange={(e) => onQualityChange(Number(e.target.value))}
            className="flex-1 accent-slate-900 disabled:opacity-40"
            aria-label="WebP 质量"
          />
          <span className="w-10 text-right text-sm tabular-nums text-slate-700">
            {qualityDisabled ? '—' : quality}
          </span>
        </label>
      </div>

      {mode === 'wasm' && (
        <p className="mt-2 text-xs text-slate-500">
          真无损模式使用 WASM libwebp，像素级保真（含透明通道）；质量参数不适用。编码较 Canvas 慢 2–3 倍。
        </p>
      )}

      {hasVideo && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <fieldset className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <legend className="sr-only">视频帧率</legend>
            <span className="w-20 text-sm text-slate-700">帧率</span>
            {FPS_CHOICES.map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="fps"
                  checked={fps === v}
                  onChange={() => onFpsChange(v)}
                  className="accent-slate-900"
                />
                <span className="text-sm text-slate-700">{v} fps</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            <legend className="sr-only">循环</legend>
            <span className="w-20 text-sm text-slate-700">循环</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="loop"
                checked={loopCount === 0}
                onChange={() => onLoopCountChange(0)}
                className="accent-slate-900"
              />
              <span className="text-sm text-slate-700">无限循环</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="loop"
                checked={loopCount === 1}
                onChange={() => onLoopCountChange(1)}
                className="accent-slate-900"
              />
              <span className="text-sm text-slate-700">只播一次</span>
            </label>
          </fieldset>

          <p className="mt-2 text-xs text-slate-500">
            视频转 animated WebP：降帧率是缩小体积最有效的杠杆。质量滑块对视频同样适用。
          </p>
        </div>
      )}
    </div>
  );
}

function WasmStateIndicator({
  state,
  onRetry,
  onFallback,
}: {
  readonly state: WasmLoadState;
  readonly onRetry: () => void;
  readonly onFallback: () => void;
}) {
  if (state === 'idle') {
    return <span className="text-xs text-slate-400">编码器未加载</span>;
  }
  if (state === 'loading') {
    return <span className="text-xs text-slate-500">加载编码器中…</span>;
  }
  if (state === 'ready') {
    return <span className="text-xs text-emerald-600">编码器就绪</span>;
  }
  // failed
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-red-600">加载失败</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
      >
        重试
      </button>
      <button
        type="button"
        onClick={onFallback}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
      >
        改用 Canvas
      </button>
    </div>
  );
}
