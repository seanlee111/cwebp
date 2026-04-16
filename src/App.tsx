import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { BulkActions } from './components/BulkActions';
import { DropZone } from './components/DropZone';
import { FileQueue } from './components/FileQueue';
import { QualityControl } from './components/QualityControl';
import {
  ConversionError,
  encode,
  getWasmState,
  loadWasm,
  subscribeWasmState,
  supportsWebPEncoding,
  type EncoderMode,
  type WasmLoadState,
} from './core/encoder';
import { useQueue, type FileItem } from './core/queue';
import { useLocalStorage } from './hooks/useLocalStorage';

const RECODE_DEBOUNCE_MS = 300;

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

  // Live WASM loading state for UI
  const [wasmState, setWasmState] = useState<WasmLoadState>(getWasmState());
  useEffect(() => subscribeWasmState(setWasmState), []);

  // Idle prefetch of WASM when the default mode (or user's saved choice) is wasm.
  // Runs once per mount-and-mode so selecting WASM later also triggers a load.
  useEffect(() => {
    if (mode !== 'wasm') return;
    if (getWasmState() === 'ready' || getWasmState() === 'loading') return;

    const prefetch = () => {
      void loadWasm().catch(() => {
        // Silent — UI (WasmStateIndicator) will surface 'failed' via the subscription.
      });
    };

    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(prefetch);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(prefetch, 0);
    return () => window.clearTimeout(id);
  }, [mode]);

  // Opts ref — processor reads latest values without being a dep
  const optsRef = useRef({ quality, mode });
  optsRef.current = { quality, mode };

  // Debounced RECODE_ALL on quality or mode change
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
  }, [quality, mode, dispatch]);

  const inFlight = useRef<Set<string>>(new Set());

  const handleFiles = useCallback(
    (files: File[]) => {
      dispatch({ type: 'ADD_FILES', files });
    },
    [dispatch],
  );

  // Serial processor. If mode === 'wasm' but the module isn't ready yet,
  // the effect returns early; the wasmState dep re-triggers it once ready.
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

    // WASM gate: don't start encoding in wasm mode until the module is ready
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
        const blob = await encode(item.file, { ...optsRef.current });
        dispatch({ type: 'DONE', id: nextId, blob });
      } catch (e) {
        const msg =
          e instanceof ConversionError ? e.message : '转换失败（未知错误）';
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

  // Early returns for unsupported browsers
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
            cwebp · 本地图片转 WebP
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            本地处理，文件不上传 · PNG / JPEG → WebP
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <DropZone onFiles={handleFiles} />
        <QualityControl
          quality={quality}
          mode={mode}
          wasmState={wasmState}
          onQualityChange={setQuality}
          onModeChange={setMode}
          onRetryWasm={onRetryWasm}
        />
        <FileQueue state={state} dispatch={dispatch} />
        <BulkActions items={items} />
      </main>
    </div>
  );
}
