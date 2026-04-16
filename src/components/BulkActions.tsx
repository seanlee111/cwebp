import { useState } from 'react';
import { Package } from 'lucide-react';
import type { FileItem } from '../core/queue';
import { packToZip } from '../core/zip';

interface BulkActionsProps {
  readonly items: readonly FileItem[];
}

export function BulkActions({ items }: BulkActionsProps) {
  const done = items.filter((i) => i.status === 'done' && i.outputBlob);
  const [busy, setBusy] = useState(false);

  if (done.length < 2) return null;

  const handleZip = async () => {
    setBusy(true);
    try {
      const blob = await packToZip(done);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cwebp-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => void handleZip()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Package className="h-4 w-4" aria-hidden="true" />
        {busy ? '打包中…' : `全部下载 ZIP（${done.length} 个文件）`}
      </button>
    </div>
  );
}
