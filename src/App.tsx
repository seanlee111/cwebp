import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { BulkActions } from './components/BulkActions';
import { DropZone } from './components/DropZone';
import { FileQueue } from './components/FileQueue';
import {
  QualityControl,
  type VideoFps,
  type VideoLoopCount,
} from './components/QualityControl';
import {
  ConversionError,
  captureVideoThumbnail,
  encode,
  encodeVideo,
  getWasmState,
  loadWasm,
  preloadVideoEncoder,
  probeVideoMetadata,
  subscribeVideoState,
  subscribeWasmState,
  supportsWebPEncoding,
  type EncoderMode,
  type FfmpegLoadState,
  type WasmLoadState,
} from './core/encoder';
import { useQueue, type FileItem } from './core/queue';
import { useLocalStorage } from './hooks/useLocalStorage';

const RECODE_DEBOUNCE_MS = 300;
const MAX_VIDEO_DURATION_SEC = 10;

export function App() {
  // Startup feature-detect
  const [supportsWebP, setSupportsWebP] = useState<boolean | null>(null);
  useEffect(() => {
    void supportsWebPEncoding().then(setSupportsWebP);
  }, []);

  const [state, dispatch] = useQueue();

  // Persisted user settings
  const [quality, setQuality] = useLocalStorage<number>('cwebp.quality', 80);
  const [mode, setMode] = useLocalStorage<EncoderMode>('cwebp.mode', 'wasm');
  const [fps, setFps] = useLocalStorage<VideoFps>('cwebp.video.fps', 15);
  const [loopCount, setLoopCount] = useLocalStorage<VideoLoopCount>(
    'cwebp.video.loop',
    0,
  );

  // Live WASM state
  const [wasmState, setWasmState] = useState<WasmLoadState>(getWasmState());
  useEffect(() => subscribeWasmState(setWasmState), []);

  // Live ffmpeg state — only subscribed once there's a video task
  const [videoState, setVideoState] = useState<FfmpegLoadState>('idle');

  // Derived: does the current queue contain any video item?
  const hasVideoTask = useMemo(
    () => state.order.some((id) => state.items[id]?.kind === 'video'),
    [state.items, state.order],
  );

  // Subscribe to ffmpeg state when a video enters the queue
  useEffect(() => {
    if (!hasVideoTask) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    void subscribeVideoState(setVideoState).then((u) => {
      if (cancelled) u();
      else cleanup = u;
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [hasVideoTask]);

  // Pre-warm ffmpeg the moment a video is queued, so probe + encode don't wait
  useEffect(() => {
    if (!hasVideoTask) return;
    void preloadVideoEncoder().catch(() => {
      // UI will reflect 'failed' state via the subscription above
    });
  }, [hasVideoTask]);

  // Idle prefetch of WASM encoder for the image side
  useEffect(() => {
    if (mode !== 'wasm') return;
    if (getWasmState() === 'ready' || getWasmState() === 'loading') return;
    const prefetch = () => {
      void loadWasm().catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 0);
    return () => window.clearTimeout(id);
  }, [mode]);

  // Async video thumbnail generation
  const thumbnailingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const id of state.order) {
      const item = state.items[id];
      if (!item) continue;
      if (
        item.kind === 'video' &&
        !item.thumbnailUrl &&
        !thumbnailingRef.current.has(id) &&
        item.status !== 'failed'
      ) {
        thumbnailingRef.current.add(id);
        void captureVideoThumbnail(item.file)
          .then((dataUrl) => {
            dispatch({ type: 'SET_THUMBNAIL', id, thumbnailUrl: dataUrl });
          })
          .catch(() => {
            // Silent — FileRow will show the film-icon placeholder
          })
          .finally(() => {
            thumbnailingRef.current.delete(id);
          });
      }
    }
  }, [state.items, state.order, dispatch]);

  // Opts ref — processor reads the latest without being a dep
  const optsRef = useRef({ quality, mode, fps, loopCount });
  optsRef.current = { quality, mode, fps, loopCount };

  // Debounced RECODE_ALL on any parameter change
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      dispatch({ type: 'RECODE_ALL' });
    }, RECODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [quality, mode, fps, loopCount, dispatch]);

  const inFlight = useRef<Set<string>>(new Set());

  const handleFiles = useCallback(
    (files: File[]) => {
      dispatch({ type: 'ADD_FILES', files });
    },
    [dispatch],
  );

  // Unified serial processor: routes to the image or video pipeline by kind.
  useEffect(() => {
    const hasConverting = state.order.some(
      (id) => state.items[id]?.status === 'converting',
    );
    if (hasConverting) return;

    const nextId = state.order.find(
      (id) =>
        state.items[id]?.status === 'pending' && !inFlight.current.has(id),
    );
    if (!nextId) return;

    const item = state.items[nextId];
    if (!item) return;

    if (item.kind === 'image') {
      if (optsRef.current.mode === 'wasm' && wasmState !== 'ready') {
        if (wasmState === 'idle') {
          void loadWasm().catch(() => {});
        }
        return;
      }

      inFlight.current.add(nextId);
      dispatch({ type: 'START_CONVERT', id: nextId });

      void (async () => {
        try {
          const blob = await encode(item.file, {
            mode: optsRef.current.mode,
            quality: optsRef.current.quality,
          });
          dispatch({ type: 'DONE', id: nextId, blob });
        } catch (e) {
          const msg =
            e instanceof ConversionError ? e.message : '转换失败（未知错误）';
          dispatch({ type: 'FAIL', id: nextId, error: msg });
        } finally {
          inFlight.current.delete(nextId);
        }
      })();
      return;
    }

    // Video pipeline
    inFlight.current.add(nextId);
    dispatch({ type: 'START_CONVERT', id: nextId });

    void (async () => {
      try {
        const meta = await probeVideoMetadata(item.file);
        dispatch({ type: 'SET_VIDEO_META', id: nextId, meta });

        if (meta.duration > MAX_VIDEO_DURATION_SEC) {
          throw new ConversionError(
            `视频时长 ${meta.duration.toFixed(1)}s 超过 ${MAX_VIDEO_DURATION_SEC} 秒上限`,
          );
        }

        const blob = await encodeVideo(
          item.file,
          {
            fps: optsRef.current.fps,
            quality: optsRef.current.quality,
            loopCount: optsRef.current.loopCount,
          },
          (p) => dispatch({ type: 'PROGRESS', id: nextId, progress: p }),
        );
        dispatch({ type: 'DONE', id: nextId, blob });
      } catch (e) {
        const msg =
          e instanceof ConversionError ? e.message : '视频转换失败（未知错误）';
        dispatch({ type: 'FAIL', id: nextId, error: msg });
      } finally {
        inFlight.current.delete(nextId);
      }
    })();
  }, [state.items, state.order, dispatch, wasmState]);

  const items = useMemo<FileItem[]>(() => {
    const out: FileItem[] = [];
    for (const id of state.order) {
      const it = state.items[id];
      if (it) out.push(it);
    }
    return out;
  }, [state.items, state.order]);

  const onRetryWasm = useCallback(() => {
    void loadWasm().catch(() => {});
  }, []);

  const onRetryFfmpeg = useCallback(() => {
    void preloadVideoEncoder().catch(() => {});
  }, []);

  if (supportsWebP === null) return null;
  if (supportsWebP === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">
            浏览器不支持 WebP 编码
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            请升级到最新版 Chrome / Edge / Safari / Firefox 后再试。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">
            cwebp · 本地图片/视频转 WebP
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            本地处理，文件不上传 · PNG / JPEG · 10s 内视频 → animated WebP
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        {hasVideoTask && videoState === 'loading' && (
          <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" aria-hidden="true" />
            <span>
              正在加载视频编码器（约 10 MB，第一次较慢，加载后浏览器会缓存）…
            </span>
          </div>
        )}
        {hasVideoTask && videoState === 'failed' && (
          <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="flex-1">视频编码器加载失败。</span>
            <button
              type="button"
              onClick={onRetryFfmpeg}
              className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              重试
            </button>
          </div>
        )}

        <DropZone onFiles={handleFiles} />
        <QualityControl
          quality={quality}
          mode={mode}
          wasmState={wasmState}
          onQualityChange={setQuality}
          onModeChange={setMode}
          onRetryWasm={onRetryWasm}
          hasVideo={hasVideoTask}
          fps={fps}
          loopCount={loopCount}
          onFpsChange={setFps}
          onLoopCountChange={setLoopCount}
        />
        <FileQueue state={state} dispatch={dispatch} />
        <BulkActions items={items} />
      </main>
    </div>
  );
}
