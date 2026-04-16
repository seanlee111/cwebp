# Plan — Phase 4: Bigger Files + Off-Main-Thread Image Encoding 技术方案

> HOW。基于 [spec.md](spec.md)。

## 1. 总体架构变化

```
┌─────────────────────────────────────────────────────────────┐
│ 主线程（UI + 调度）                                           │
│                                                             │
│  Queue reducer     ── image/video kinds                     │
│                                                             │
│  App.tsx processor                                          │
│    ├── image kind   ──► encoderClient.encode(...)  ──┐      │
│    │                                                 │      │
│    └── video kind   ──► encodeVideo(...)  (ffmpeg    │      │
│                          自带 worker，原样)            │      │
│                                                      ▼      │
│                                              postMessage     │
└─────────────────────────────────────────────────────┬───────┘
                                                      │
                                                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Image Encoder Worker (encoder.worker.ts)                    │
│                                                             │
│  onmessage {mode, file, quality, id}                        │
│    ├── mode 'canvas' → OffscreenCanvas + convertToBlob      │
│    └── mode 'wasm'   → @jsquash/webp encode (lossless)      │
│  postMessage {done|error|wasmState, ...}                    │
└─────────────────────────────────────────────────────────────┘
```

视频继续走 ffmpeg.wasm 自带的 worker 基建（Phase 3 已经实现）。

## 2. 上限拆分

代码 + 常量：

```ts
// src/core/queue.ts
const MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024;

function sizeCapFor(kind: FileKind): number {
  return kind === 'video' ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
}

// ADD_FILES:
const cap = sizeCapFor(detectKind(file));
if (file.size > cap) {
  items[next.id] = buildFailedItem(
    file,
    kind === 'video'
      ? `视频超过 ${MAX_VIDEO_SIZE_BYTES / 1024 / 1024} MB 上限`
      : `图片超过 ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024} MB 上限`,
  );
}
```

```ts
// src/App.tsx
const MAX_VIDEO_DURATION_SEC = 30;  // was 10
```

RECODE_ALL 里判断 "size-capped failed" 的条件同步按 kind 分流：

```ts
if (old.status === 'failed' && old.originalSize > sizeCapFor(old.kind)) {
  items[id] = old;
  continue;
}
```

## 3. Worker 实现

### 3.1 Worker 文件

```
src/core/
├── encoder.worker.ts         Worker 本体
├── encoderClient.ts          Promise-based wrapper, owner in main thread
├── encoder.ts                (refactor) 顶层 encode() 现在委托给 encoderClient
```

### 3.2 Worker 消息协议

```ts
// shared types (both sides import)
export type WorkerRequest =
  | { kind: 'encode'; id: number; mode: 'canvas' | 'wasm'; file: File; quality: number }
  | { kind: 'preloadWasm'; id: number };

export type WorkerResponse =
  | { kind: 'done'; id: number; blob: Blob }
  | { kind: 'error'; id: number; message: string }
  | { kind: 'wasmState'; state: 'idle' | 'loading' | 'ready' | 'failed' };
```

主线程发 `encode`，Worker 回 `done` 或 `error`，两边靠 `id` 对齐请求/响应。

### 3.3 Vite worker 引入

```ts
// encoderClient.ts
import EncoderWorker from './encoder.worker?worker';
const worker = new EncoderWorker();
```

`?worker` 是 Vite 标准语法，打出独立 chunk 并返回构造器。

### 3.4 单例 worker 还是多 worker

**MVP：单 worker，串行处理**。这是当前主线程 processor 行为的搬迁，不引入并发。

好处：
- encoderClient 实现极简，一条 Promise 队列
- WASM 加载只一次
- 主线程串行调度逻辑几乎不变

多 worker pool 留到 Phase 5（多文件并发）。

## 4. 共享/拆分 encoder 代码

Canvas / WASM 编码目前分别在 `canvasEncoder.ts` / `wasmEncoder.ts`。它们依赖：
- `document.createElement('canvas')` — Worker 里没有
- `HTMLCanvasElement.toBlob(...)` — 无
- `OffscreenCanvas` — Worker 里**有**

策略：**重写两个模块的内部，让它们同时在 Worker 和 main thread 下跑**。

```ts
// canvasEncoder.ts (worker-safe)
export async function encodeCanvas(file: File, opts: { quality: number }): Promise<Blob> {
  if (!isSupportedInput(file)) throw new ConversionError(...);
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { bitmap.close(); throw new ConversionError('no 2d ctx'); }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({
    type: 'image/webp',
    quality: clamp(opts.quality, 0, 100) / 100,
  });
}
```

- `createImageBitmap(File)` — 主线程和 worker 都有
- `OffscreenCanvas` — 主线程（Chrome 69+）和 worker 都有
- `canvas.convertToBlob` — OffscreenCanvas 的原生方法，返回 Promise<Blob>

这样两个模块**完全不需要 DOM**，既能在 worker 跑，主线程也能跑（在 OffscreenCanvas 可用的浏览器）。

`wasmEncoder.ts` 已经用了 OffscreenCanvas（Phase 2 就做了 OffscreenCanvas + fallback），只需要：
- 移除"不支持 OffscreenCanvas 时回退到 document.createElement 的 canvas"—— 这条 fallback 对 worker 无效
- 新加一层"浏览器不支持 OffscreenCanvas"的 feature-detect，由 encoderClient 决定走 worker 还是主线程直调

### 4.1 Feature detect

```ts
// encoderClient.ts
const canUseWorker =
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined';
```

`canUseWorker === false`（旧 Safari < 16.4 大概率） → 直接在主线程调 `encodeCanvas` / `encodeWasmLossless`。API 表现一致，只是没有 off-main-thread 好处。

## 5. WASM 状态桥接

主线程依赖 `subscribeWasmState(fn)` 给 QualityControl 显示状态。Worker 化后，WASM 在 worker 里加载。

方案：
- encoder.worker.ts 在初始化时 subscribe `wasmEncoder.subscribeWasmState`
- 每次状态变 → postMessage `{ kind: 'wasmState', state }`
- encoderClient.ts 收到后转发给一个本地 listener set
- `encoder.ts` 的 `subscribeWasmState` 现在转发给 encoderClient 的 listener

接口不变，内部实现切换。

## 6. Fallback 路径

```
┌───────────────────────────────────────┐
│ encoderClient.encode(file, opts)      │
│   if (canUseWorker)                   │
│     → postMessage + await response    │
│   else                                │
│     → await encodeCanvas/WASM in main │
└───────────────────────────────────────┘
```

canUseWorker 一次 detect，应用生命周期内缓存。

## 7. UX 增强（US-4.3）

### 7.1 软阈值

```ts
const SOFT_WARN_IMAGE = 50 * 1024 * 1024;   // > 50 MB 图警告
const SOFT_WARN_VIDEO = 100 * 1024 * 1024;  // > 100 MB 视频警告
const SOFT_WARN_DURATION = 20;              // > 20 s 视频警告
```

### 7.2 FileRow tooltip

对满足软阈值的条目，文件名旁加 ⚠（`AlertTriangle` 图标），hover 显示估值：

```
这个视频较大（120 MB），预计编码时间约 6 分钟
```

估值公式（粗略）：
- 视频：`Math.ceil(fileSizeMB * 3)` 秒（基于 Phase 3 实测 10 s 720p ≈ 30 s）
- 图 WASM：`Math.ceil(fileSizeMB * 0.3)` 秒
- 图 Canvas：`Math.ceil(fileSizeMB * 0.1)` 秒

### 7.3 顶部 banner

如果 queue 里有任一"大文件"（通过软阈值），顶部加一条 neutral-yellow banner 提示：

```
⚠ 有文件较大（150 MB），编码可能需要几分钟；请保持页面打开。
```

与 ffmpeg loading banner 共存，不互相覆盖。

## 8. 风险

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| OffscreenCanvas.convertToBlob 在某些版本 Firefox 渲染的 WebP 和 HTMLCanvasElement.toBlob 不同 | 低 | 输出体积差异 | 实测对比；差异小可接受 |
| worker 里 dynamic import @jsquash/webp 的 WASM chunk 路径和主线程解析不一致 | 中 | worker WASM 加载失败 | Vite worker 构建自动处理 public path；失败时 encoderClient 降级回主线程 |
| 200 MB 图片 createImageBitmap OOM | 中 | 该图失败 | UI 显示精确错误（浏览器抛的 message）；用户再次尝试改 canvas 模式 |
| structured clone file 传给 worker 成本高 | 低 | 入队时卡 | File 是 blob 基于 ArcBuffer，structured clone 是零拷贝 transferable（实测 postMessage File 很快） |
| 视频进度条在大文件下不够精细 | 低 | 用户焦虑 | ffmpeg progress 已经是 0..1，实际上 OK |

## 9. 开放问题裁决

| 问题 | 裁决 |
|---|---|
| 上限拆分 | **两个常量，按 kind 查表** |
| encoder 代码共享 | **canvasEncoder/wasmEncoder 重写为 worker-safe，同时被 main 和 worker 导入** |
| WASM 加载位置 | **worker 里独立加载**（主线程不拿 WASM 了）；状态通过 postMessage 桥接 |
| OffscreenCanvas 降级 | **主线程直调**（保留旧模块的主线程直跑能力） |
| 软阈值 | 图 > 50 MB / 视频 > 100 MB / 视频时长 > 20 s |

## 10. 目录变化

```
src/core/
├── encoder.ts              (unchanged exterior, rewired to encoderClient)
├── canvasEncoder.ts        (worker-safe: OffscreenCanvas + convertToBlob)
├── wasmEncoder.ts          (worker-safe: remove DOM fallback, explicit)
├── videoEncoder.ts         (unchanged)
├── encoderClient.ts        NEW   — worker owner, fallback to main
├── encoder.worker.ts       NEW   — worker body
├── errors.ts
├── queue.ts                (MAX_SIZE by kind)
└── zip.ts
```

## 11. Phase 5+ 预留

- 多 worker pool → 并发多文件编码（把 encoderClient 升级成 pool）
- 视频 trim (`-ss` + `-t`) UI
- Tauri 桌面版 → 彻底解除浏览器内存 tab 限制
