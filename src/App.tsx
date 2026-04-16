import { useCallback, useEffect, useRef } from 'react';
import { DropZone } from './components/DropZone';
import { FileQueue } from './components/FileQueue';
import { ConversionError, convertToWebP } from './core/converter';
import { useQueue } from './core/queue';

export function App() {
  const [state, dispatch] = useQueue();

  // Track ids already picked up by a processor, so React 18 StrictMode's
  // double-invoked effect doesn't start two conversions for the same file.
  const inFlight = useRef<Set<string>>(new Set());

  const handleFiles = useCallback(
    (files: File[]) => {
      dispatch({ type: 'ADD_FILES', files });
    },
    [dispatch],
  );

  // Serial processor: at most one conversion at a time.
  // When DONE/FAIL mutates state, this effect re-runs and picks the next pending.
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
        const blob = await convertToWebP(item.file, {
          quality: 80,
          lossless: false,
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
  }, [state.items, state.order, dispatch]);

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

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        <DropZone onFiles={handleFiles} />
        <FileQueue state={state} dispatch={dispatch} />
      </main>
    </div>
  );
}
