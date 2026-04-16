# Plan — Phase 3: Video → Animated WebP 技术方案

> HOW。基于 [spec.md](spec.md)。

## 1. 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│ 浏览器（单页）                                                │
│                                                             │
│  DropZone accept="image/*,video/*"                          │
│        │                                                    │
│  reducer.ADD_FILES                                          │
│  ├── image/* → 既有 pipeline（encoder.ts 策略分发）          │
│  └── video/* → videoEncoder.ts                              │
│                                                             │
│  videoEncoder.ts                                            │
│     │  首次调用 → loadFfmpeg()（dynamic import + core fetch）│
│     │                                                       │
│     ▼                                                       │
│  @ffmpeg/ffmpeg  ──────► @ffmpeg/core  (ffmpeg-core.wasm)   │
│     │                                                       │
│     │  ffmpeg.exec(['-i', 'in.mp4',                         │
│     │               '-loop', '0|1',                         │
│     │               '-vf', 'fps=N,scale=W:-2',              │
│     │               '-quality', String(Q),                  │
│     │               'out.webp'])                            │
│     │                                                       │
│     ▼                                                       │
│  animated WebP Blob → Queue DONE                            │
└─────────────────────────────────────────────────────────────┘
```

零第三方服务。ffmpeg core 从本站静态资源加载。

## 2. 依赖与包体

| 依赖 | 版本 | 角色 | 体积（估） |
|---|---|---|---|
| `@ffmpeg/ffmpeg` | ^0.12.15 | 主进程 worker wrapper | ~10 KB gzip |
| `@ffmpeg/core` | ^0.12.10 | 单线程 LGPL ffmpeg WASM | **~9–12 MB gzip** |
| `@ffmpeg/util` | ^0.12.2 | `toBlobURL` / `fetchFile` helpers | ~2 KB gzip |

选 **单线程版** `@ffmpeg/core`（非 `@ffmpeg/core-mt`），理由：
1. GitHub Pages 不支持设置 COOP/COEP HTTP headers，多线程版无法启动。
2. 目标视频 ≤ 10 秒，单线程编码时延可接受（≤ 60s 中端笔记本）。
3. Phase 3.1 迁多线程另起一份 spec。

## 3. core 文件托管

`@ffmpeg/core@0.12.10` 的 `dist/umd/` 下包含：
- `ffmpeg-core.js`（glue，~10 KB）
- `ffmpeg-core.wasm`（~30 MB raw，~10 MB gzip）

**决定：Vite 静态资源 + 同源托管**（不用第三方 CDN）。

```ts
// 使 Vite 把 core 打进 dist/assets 并返回可 fetch 的 URL
import coreURL from '@ffmpeg/core/dist/umd/ffmpeg-core.js?url';
import wasmURL from '@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url';

const ffmpeg = new FFmpeg();
await ffmpeg.load({
  coreURL: await toBlobURL(coreURL, 'text/javascript'),
  wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
});
```

这样 Vite 为 core 生成一个带 hash 的独立 chunk，与应用主 bundle 完全分离。首屏加载主 bundle 时不会 prefetch core。

## 4. 模块划分

### 新增

```
src/core/
└── videoEncoder.ts     ffmpeg.wasm 封装 + 懒加载 + 进度回调
```

### 修改

- `src/core/encoder.ts`
  - 新增 `encodeVideo(file, opts, onProgress)`
  - `encode(file, opts)` 在遇到 `video/*` MIME 时委托给 `encodeVideo`
- `src/core/queue.ts`
  - `FileItem` 增加 `kind: 'image' | 'video'`（通过 MIME 自动识别）
  - `FileItem.progress?: number`（0–1，视频编码进度）
  - 新 action：`PROGRESS { id, progress }`
  - ADD_FILES 时：`video/*` 且时长超限 → `buildFailedItem('视频时长超过 10 秒上限')`；但时长要等 metadata 加载（异步）
- `src/App.tsx`
  - processor 根据 `item.kind` 分发
  - 视频任务走串行（不并发，避免内存爆）
  - 订阅 videoEncoder 的进度回调，dispatch `PROGRESS`
- `src/components/DropZone.tsx`
  - `accept="image/png,image/jpeg,video/mp4,video/webm,video/quicktime"`
  - 文案增加"也支持 10 秒内短视频"
- `src/components/FileRow.tsx`
  - `kind === 'video'`：缩略图用首帧（来自 `<video>.currentTime=0 + drawImage` 或转换后 WebP 的第一帧）
  - 进度状态显示百分比进度条
- `src/components/QualityControl.tsx`
  - 新增"视频参数"区域：FPS 四档 + 循环次数
  - 只在 queue 有视频任务时显示

## 5. videoEncoder.ts 伪代码

```ts
// Module-scoped singleton
let ffmpegPromise: Promise<FFmpeg> | null = null;
let ffmpegState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
let loadProgress = 0;  // 0..1 during loading

export interface VideoEncodeOptions {
  fps: 10 | 15 | 20 | 30;
  quality: number;      // 0..100
  loopCount: 0 | 1;     // 0 = infinite
}

export async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegState = 'loading';
  emit();
  ffmpegPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const coreURL = await import('@ffmpeg/core/dist/umd/ffmpeg-core.js?url').then(m => m.default);
    const wasmURL = await import('@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url').then(m => m.default);
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { /* optional debug */ });
    await ff.load({
      coreURL: await toBlobURL(coreURL, 'text/javascript'),
      wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
    });
    ffmpegState = 'ready';
    emit();
    return ff;
  })().catch(e => {
    ffmpegState = 'failed';
    ffmpegPromise = null;
    emit();
    throw e;
  });
  return ffmpegPromise;
}

export async function encodeVideoToWebP(
  file: File,
  opts: VideoEncodeOptions,
  onProgress: (p: number) => void,
): Promise<Blob> {
  const ff = await loadFfmpeg();
  const inputName = 'in.' + (file.name.split('.').pop() || 'mp4');
  const outputName = 'out.webp';

  const onFfProgress = ({ progress }: { progress: number }) => {
    onProgress(Math.min(1, Math.max(0, progress)));
  };
  ff.on('progress', onFfProgress);

  try {
    // Use fetchFile from @ffmpeg/util to write File into MEMFS
    const { fetchFile } = await import('@ffmpeg/util');
    await ff.writeFile(inputName, await fetchFile(file));

    await ff.exec([
      '-i', inputName,
      '-loop', String(opts.loopCount),
      '-vf', `fps=${opts.fps},scale='min(1920,iw)':'-2':flags=lanczos`,
      '-quality', String(opts.quality),
      '-preset', 'default',
      '-an',  // strip audio
      outputName,
    ]);

    const data = await ff.readFile(outputName);
    return new Blob([data], { type: 'image/webp' });
  } finally {
    ff.off('progress', onFfProgress);
    // Clean MEMFS to avoid leaking memory across encodings
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    try { await ff.deleteFile(outputName); } catch { /* ignore */ }
  }
}
```

## 6. 时长 / 分辨率检测

不能在 `ADD_FILES` reducer 里做异步 metadata 读取（reducer 必须同步）。方案：

1. `ADD_FILES` 直接入队为 `status: 'pending', kind: 'video'`。
2. processor 在 `START_CONVERT` 之前异步探测 metadata：
   ```ts
   const v = document.createElement('video');
   v.preload = 'metadata';
   v.src = URL.createObjectURL(file);
   await new Promise<void>((res, rej) => {
     v.onloadedmetadata = () => res();
     v.onerror = () => rej(new Error('无法读取视频元数据'));
   });
   // v.duration, v.videoWidth, v.videoHeight
   URL.revokeObjectURL(v.src);
   ```
3. 若超过 10s → dispatch `FAIL`；若超过 1080p → 继续，`-vf scale` 自动降采样。

## 7. 进度反馈

- 加载阶段（首次）：`ffmpegState === 'loading'` 在 UI 显示 "加载视频编码器…"
  - `@ffmpeg/ffmpeg` 本身不暴露下载百分比。可以 fetch wasmURL 时自己做 progress stream（`ReadableStream` + `Content-Length`）。MVP 先只显示"加载中"spinner，百分比作为 stretch。
- 编码阶段：`ff.on('progress', ...)` 给 0..1，queue PROGRESS action → FileRow 进度条。

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| Vite 无法直接 `?url` 引入 `@ffmpeg/core/dist/umd/*` | 中 | 打包失败 | fallback：`public/ffmpeg/` 目录 + `import.meta.env.BASE_URL` 拼 URL |
| `SharedArrayBuffer` 不可用导致单线程 core 启动失败 | 低 | 无法编码 | 单线程版不用 SAB，应该安全；failed 时明确错误 |
| 视频含 HEVC/H265 浏览器解不了 | 中 | ffmpeg 能解但用户 `<video>` 元数据探测阶段失败 | metadata 探测失败时直接提示"格式不支持"，不进入 ffmpeg 阶段 |
| 10MB chunk 在慢网下加载 >2min | 中 | 用户放弃 | UI 明确大小提示；HTTP cache 复用；Phase 3.1 考虑 Service Worker 预热 |
| MEMFS 占用不释放导致多视频连转后 OOM | 中 | 浏览器崩 | finally 里删除 input/output；每 N 次重建 FFmpeg 实例 |
| GitHub Pages CSP 阻塞 `toBlobURL` 产生的 blob: | 低 | load 失败 | Pages 默认无 CSP，应该安全；如遇问题加 `<meta http-equiv="Content-Security-Policy">` |

## 9. 开放问题裁决

| 问题 | 裁决 |
|---|---|
| core 托管 | **Vite `?url` 引入，同源 `dist/assets/`** |
| 缩略图 | 首帧用 `<video>` seek(0) + drawImage 生成（不等编码完成） |
| UI 列表 | 单列表；FileRow 内靠"进度条 vs 无进度"区分 |
| `FileItem.kind` | **加**，MIME 判定一次，后续基于 kind 分发 |

## 10. Phase 3.1 可预见的升级路径

- `@ffmpeg/core-mt` + COOP/COEP（换托管或 Service Worker 注入）→ 2–4× 加速
- Trim（起止时间）
- Crop 预设（16:9 / 1:1 / 9:16）
- 输出 AVIF animated（浏览器原生支持有限，可能要 WASM 编码器）
