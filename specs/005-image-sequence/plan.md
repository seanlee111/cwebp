# Plan — Phase 5: Image Sequence → Animated WebP 技术方案

> HOW。基于 [spec.md](spec.md)。

## 1. 总体流水线

```
用户拖入 PNG/JPEG × N  ──► 队列（kind='image' × N）
                              │
         [🎞 合成为动图 (N)] ──► 点击
                              │
                              ▼
            ADD_SEQUENCE action 入队一条 kind='sequence' item
                              │
                              ▼
  processor (sequence 分支)
    ├─ 预处理 stage 0..0.5
    │   └─ 逐帧 createImageBitmap → OffscreenCanvas scale 到第一帧尺寸
    │       → convertToBlob('image/png') → 写 MEMFS img_%04d.png
    ├─ ffmpeg stage 0.5..1
    │   └─ ffmpeg -framerate F -i img_%04d.png -loop L -pix_fmt yuva420p
    │             -quality Q out.webp
    └─ readFile out.webp → Blob → DONE
```

零新依赖，全程复用 Phase 3 的 ffmpeg.wasm。

## 2. 依赖

无新增 npm 包。`@ffmpeg/ffmpeg` + `@ffmpeg/core`（Phase 3 已锁定）原生支持 libwebp 和 image2 demuxer。

## 3. 输入帧预处理

**为什么要预处理，不直接把原字节扔给 ffmpeg？**

- ffmpeg 的 `-i img_%04d.png` 按扩展名选 decoder — 不能混合 PNG 和 JPEG
- 尺寸不一致时 ffmpeg 默认行为是报错，得额外加 scale filter 但 filter chain 复杂
- 自然排序是浏览器做的，MEMFS 里文件名要重编号

因此在浏览器里做**一次性预处理**：

```ts
// pseudo
const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name));
let firstW = 0, firstH = 0;
for (let i = 0; i < sorted.length; i++) {
  const bitmap = await createImageBitmap(sorted[i]);
  if (i === 0) { firstW = bitmap.width; firstH = bitmap.height; }
  const canvas = new OffscreenCanvas(firstW, firstH);
  const ctx = canvas.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, firstW, firstH);               // ensure transparency
  ctx.drawImage(bitmap, 0, 0, firstW, firstH);        // scale to first frame
  bitmap.close();
  const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
  const bytes = new Uint8Array(await pngBlob.arrayBuffer());
  await ff.writeFile(`img_${String(i + 1).padStart(4, '0')}.png`, bytes);
  onProgress((i + 1) / sorted.length * 0.5);          // first half of total progress
}
```

关键点：
- `alpha: true` + `clearRect` 确保透明底
- 所有帧最终都是 PNG，ffmpeg 按 `-i img_%04d.png` 稳定读取
- `convertToBlob('image/png')` 保留 alpha

**内存注意**：convertToBlob 同时存在 bitmap + canvas + blob 三份，300 MB 输入 × 2–3 = ~900 MB 峰值。足够 tab 扛。

## 4. Queue 数据模型

扩展 `FileItem.kind`:

```ts
export type FileKind = 'image' | 'video' | 'sequence';

export interface FileItem {
  readonly id: string;
  readonly file: File;                    // 代表文件：sequence 用 first frame
  readonly kind: FileKind;
  readonly status: FileStatus;
  readonly originalSize: number;          // sequence: sum of all frame sizes
  readonly outputBlob?: Blob;
  readonly outputSize?: number;
  readonly error?: string;
  readonly thumbnailUrl?: string;         // sequence: first frame ObjectURL
  readonly progress?: number;
  readonly videoMeta?: VideoMeta;
  /** Phase 5: present iff kind==='sequence'. */
  readonly sequenceFrames?: readonly File[];
  /** Phase 5: human count for UI. */
  readonly sequenceFrameCount?: number;
}
```

新 action：

```ts
| { type: 'ADD_SEQUENCE'; files: readonly File[] }
```

reducer 行为：
- 按自然排序文件（保持与编码时一致）
- 创建 `kind='sequence'`、`file = sorted[0]`（占位）、`sequenceFrames = sorted`、`originalSize = sum(sizes)`
- `thumbnailUrl = URL.createObjectURL(sorted[0])`
- 入队**到 order 数组末尾**（排位决策：队列底部，贴近用户触发动作）
- 不跳过大小预检：如果总和 > 300 MB，外层 UI 先 disable 按钮；reducer 不重复检查（保持简单）

**RECODE_ALL 的 sequence 处理**：和 size-capped failed 一样跳过——合成任务是一次性产物，参数变不触发重编。

## 5. ffmpeg 命令

```
ffmpeg -framerate F -i img_%04d.png \
  -loop L \
  -pix_fmt yuva420p \
  -quality Q \
  -preset default \
  out.webp
```

- `-framerate F`: 输入帧率（= 输出帧率，因为输入就是静态帧）
- `-pix_fmt yuva420p`: **关键**，保留 alpha
- 不加 `-vf scale`：预处理阶段已经统一尺寸，ffmpeg 不需要再 resize
- 不加 `-an`：输入是图片，没有音频

输出 `out.webp` readFile 得到 Uint8Array，包装成 `image/webp` Blob。

## 6. 进度映射

ffmpeg 的 `progress` 回调基于总帧数给 0..1。我们把整个 sequence 任务分成两段：

| 阶段 | progress 区间 |
|---|---|
| 预处理（帧到 MEMFS） | 0 → 0.5 |
| ffmpeg 编码 | 0.5 → 1.0 |

encodeSequenceToWebP 内部：
```ts
async function encodeSequenceToWebP(files, opts, onProgress) {
  // stage 1
  for (i in files) {
    ...
    onProgress((i + 1) / files.length * 0.5);
  }
  // stage 2
  ff.on('progress', ({progress}) => onProgress(0.5 + progress * 0.5));
  await ff.exec([...]);
  ff.off('progress', handler);
  ...
}
```

## 7. 错误处理

- 预处理中 `createImageBitmap` 失败（单帧损坏）→ 整个任务失败，错误文案指出具体第 K 帧
- ffmpeg exec 失败 → 整个任务 fail + 错误文案
- 总字节 > 300 MB: 外层按钮 disable，不走到 processor

## 8. 文件命名

输出文件名约定：
```
sequence-N-frames-YYYYMMDD.webp
```
N 替换为帧数。FileRow 下载按钮用此名。

## 9. 风险

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| JPEG 预处理后转 PNG 体积膨胀 → MEMFS OOM | 中 | 编码失败 | 300 MB 硬门；失败时显示 ffmpeg 错误 |
| 尺寸差异过大 scale 后畸变 | 中 | 画面变形 | 第一次合成前 tooltip 警告；用户自行选同尺寸帧 |
| 自然排序在边缘情况（不带数字的文件名混入）不如预期 | 低 | 顺序错位 | `localeCompare({numeric:true})` 的标准行为即可 |
| 用户连续合成多次，MEMFS 不 clean | 低 | 多次运行后内存堆积 | finally 里 deleteFile 所有 `img_*.png` 和 out.webp |

## 10. 开放问题裁决

| 问题 | 裁决 |
|---|---|
| 预处理格式 | **统一 PNG**（保 alpha + 简化 ffmpeg 命令） |
| sequence.file 占位 | **第一帧的 File**（用于 thumbnail 生成和 ObjectURL 释放） |
| yuva420p | **固定**，不区分 PNG/JPEG（JPEG 帧经预处理写 PNG，自动获得透明通道，编码层面统一） |
| 进度映射 | **两段线性**（0–0.5 / 0.5–1） |
| 排位 | **队列底部**（贴近触发位置） |

## 11. 目录变化

```
src/core/
├── videoEncoder.ts            + encodeSequenceToWebP
├── encoder.ts                 + encodeSequence, captureFirstFrame re-export
├── queue.ts                   + kind='sequence' + sequenceFrames + ADD_SEQUENCE
├── ...
src/components/
├── SequenceActions.tsx        NEW (底部"合成动图"按钮)
├── FileRow.tsx                + sequence kind render
├── BulkActions.tsx            (unchanged)
src/utils/
└── naturalSort.ts             NEW (或 inline 一行)
src/App.tsx
└── processor: sequence 分支
```
