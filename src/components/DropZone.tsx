import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { ImageIcon } from 'lucide-react';

interface DropZoneProps {
  readonly onFiles: (files: File[]) => void;
}

function isAccepted(file: File): boolean {
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.type.startsWith('video/')
  );
}

export function DropZone({ onFiles }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [hover, setHover] = useState(false);

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const files = Array.from(list).filter(isAccepted);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setHover(false);
    handleFiles(e.dataTransfer.files);
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Allow re-selecting the same file later
    e.target.value = '';
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={onKeyDown}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-10 sm:py-16 ${
        hover
          ? 'border-blue-400 bg-blue-50/60'
          : 'border-slate-300 bg-white hover:border-slate-400'
      }`}
    >
      <ImageIcon className="h-12 w-12 text-slate-400" aria-hidden="true" />
      <p className="mt-4 text-base text-slate-700">
        拖放图片或视频到这里，或点击选择文件
      </p>
      <p className="mt-1 text-xs text-slate-400">
        PNG / JPEG（≤ 200 MB） · 30 秒内短视频 MP4 / WebM / MOV（≤ 500 MB） · 本地处理，不上传
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,video/mp4,video/webm,video/quicktime"
        multiple
        hidden
        onChange={onChange}
      />
    </div>
  );
}
