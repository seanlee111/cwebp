import { ImageIcon } from 'lucide-react';

export function App() {
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

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* 占位骨架：Phase 4.2 之后会被真实 DropZone / Queue 替换 */}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-10 py-20 text-center">
          <ImageIcon className="h-12 w-12 text-slate-400" />
          <p className="mt-4 text-base text-slate-600">
            拖放图片到这里，或点击选择文件
          </p>
          <p className="mt-1 text-xs text-slate-400">
            支持 PNG / JPEG · 单个文件 ≤ 50 MB
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Phase 4.0 脚手架 · 组件待实现
        </p>
      </main>
    </div>
  );
}
