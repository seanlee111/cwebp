import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  X,
} from 'lucide-react';
import type { FileItem } from '../core/queue';
import { formatFileSize, formatSavings } from '../utils/fileSize';

interface FileRowProps {
  readonly item: FileItem;
  readonly onRemove: () => void;
}

export function FileRow({ item, onRemove }: FileRowProps) {
  const { file, status, originalSize, outputSize, error, thumbnailUrl, outputBlob } =
    item;

  const handleDownload = () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = replaceExt(file.name, '.webp');
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke after a tick so the download finishes initiating
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-slate-100">
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">
          {file.name}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {formatFileSize(originalSize)}
          {status === 'done' && outputSize !== undefined && (
            <>
              {' → '}
              <span className="text-slate-700">{formatFileSize(outputSize)}</span>
              <span
                className={`ml-2 font-medium ${
                  outputSize < originalSize ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {formatSavings(originalSize, outputSize)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {status === 'pending' && (
          <span className="text-xs text-slate-400">待处理</span>
        )}
        {status === 'converting' && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            转换中
          </span>
        )}
        {status === 'done' && (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="转换成功" />
            <button
              type="button"
              onClick={handleDownload}
              aria-label="下载 WebP"
              className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-3"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">下载</span>
            </button>
          </>
        )}
        {status === 'failed' && (
          <span
            className="flex max-w-[140px] items-center gap-1 truncate text-xs text-red-600 sm:max-w-none"
            title={error}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{error ?? '失败'}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="移除"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function replaceExt(name: string, newExt: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + newExt;
  return name.slice(0, dot) + newExt;
}
