import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BulkActions } from './components/BulkActions';
import { DropZone } from './components/DropZone';
import { FileQueue } from './components/FileQueue';
import { QualityControl } from './components/QualityControl';
import { ConversionError, convertToWebP } from './core/converter';
import { useQueue, type FileItem } from './core/queue';
import { useLocalStorage } from './hooks/useLocalStorage';

const RECODE_DEBOUNCE_MS = 300;

export function App() {
  const [state, dispatch] = useQueue();

  // Persisted user settings
  const [quality, setQuality] = useLocalStorage<number>('cwebp.quality', 80);
  const [lossless, setLossless] = useLocalStorage<boolean>(
    'cwebp.lossless',
    false,
  );

  // The processor effect reads latest opts from a ref so quality changes
  // don't reshape its dependency array (avoids extra effect invocations).
  const optsRef = useRef({ quality, lossless });
  optsRef.current = { quality, lossless };

  // Debounced RECODE_ALL — waits until the user pauses dragging the slider.
  const firstSettingsRender = useRef(true);
  useEffect(() => {
    if (firstSettingsRender.current) {
      firstSettingsRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      dispatch({ type: 'RECODE_ALL' });
    }, RECODE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [quality, lossless, dispatch]);

  // Guard against React 18 StrictMode double-invoke
  const inFlight = useRef<Set<string>>(new Set());

  const handleFiles = useCallback(
    (files: File[]) => {
      dispatch({ type: 'ADD_FILES', files });
    },
    [dispatch],
  );

  // Serial processor: one conversion at a time
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

    inFlight.current.add(nextId);
    dispatch({ type: 'START_CONVERT', id: nextId });

    void (async () => {
      try {
        const blob = await convertToWebP(item.file, { ...optsRef.current });
        dispatch({ type: 'DONE', id: nextId, blob });
      } catch (e) {
        const msg =
          e instanceof ConversionError ? e.message : '转换失败（未知错误）';
        dispatch({ type: 'FAIL', id: nextId, error: msg });
      } finally {
        inFlight.current.delete(nextId);
      }
    })();
  }, [state.items, state.order, dispatch]);

  // Flatten items for bulk actions (keep order)
  const items = useMemo<FileItem[]>(() => {
    const out: FileItem[] = [];
    for (const id of state.order) {
      const it = state.items[id];
      if (it) out.push(it);
    }
    return out;
  }, [state.items, state.order]);

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
          lossless={lossless}
          onQualityChange={setQuality}
          onLosslessChange={setLossless}
        />
        <FileQueue state={state} dispatch={dispatch} />
        <BulkActions items={items} />
      </main>
    </div>
  );
}
