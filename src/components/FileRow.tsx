import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  X,
} from 'lucide-react';
import type { FileItem } from '../core/queue';
import type { EncoderMode } from '../core/encoder';
import {
  formatDuration,
  formatFileSize,
  formatSavings,
} from '../utils/fileSize';
import {
  estimateEncodeSeconds,
  formatEstimate,
  isLargeItem,
} from '../utils/estimate';

interface FileRowProps {
  readonly item: FileItem;
  readonly onRemove: () => void;
  readonly imageMode: EncoderMode;
}

export function FileRow({ item, onRemove, imageMode }: FileRowProps) {
  const {
    file,
    kind,
    status,
    originalSize,
    outputSize,
    error,
    thumbnailUrl,
    outputBlob,
    progress,
    videoMeta,
  } = item;

  const handleDownload = () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadNameFor(item);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-slate-100">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          (kind === 'video' || kind === 'sequence') && (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <Film className="h-6 w-6" aria-hidden="true" />
            </div>
          )
        )}
        {(kind === 'video' || kind === 'sequence') && thumbnailUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Film className="h-5 w-5 text-white drop-shadow" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900">
            {kind === 'sequence'
              ? `合成动图（${item.sequenceFrameCount ?? 0} 帧）`
              : file.name}
          </span>
          {kind === 'video' && videoMeta && (
            <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
              {formatDuration(videoMeta.duration)}
            </span>
          )}
          {isLargeItem(item) && status !== 'done' && status !== 'failed' && (
            <span
              className="flex-shrink-0 text-amber-500"
              title={`文件较大（${formatFileSize(item.originalSize)}），预计${formatEstimate(estimateEncodeSeconds(item, imageMode))}`}
              aria-label="大文件警告"
            >
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
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
          progress !== undefined ? (
            <div className="flex w-28 items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <span className="w-9 text-right text-xs tabular-nums text-slate-500">
                {Math.round(progress * 100)}%
              </span>
            </div>
          ) : (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              转换中
            </span>
          )
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

function downloadNameFor(item: FileItem): string {
  if (item.kind === 'sequence') {
    const n = item.sequenceFrameCount ?? 0;
    const d = new Date();
    const ymd =
      d.getFullYear().toString() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0');
    return `sequence-${n}-frames-${ymd}.webp`;
  }
  return replaceExt(item.file.name, '.webp');
}
