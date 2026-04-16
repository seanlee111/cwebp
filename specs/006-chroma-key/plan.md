# Plan — Phase 6: Chroma-Key 技术方案

> HOW。基于 [spec.md](spec.md)。

## 1. 架构变化

零新依赖。扩展现有：

```
src/core/videoEncoder.ts
  └─ encodeSequenceToWebP(files, opts, onProgress)
        opts 新增 chromaKey: boolean
        │
        ├─ 读第一帧 → extractKeyColor() → {r, g, b}
        └─ 每帧预处理时：drawImage → getImageData
             → if chromaKey: applyChromaKey(imageData, keyColor, tolerance)
             → putImageData → convertToBlob('image/png') → MEMFS

src/core/queue.ts
  └─ FileItem.sequenceChromaKey?: boolean
  └─ ADD_SEQUENCE action payload 增加 chromaKey

src/components/SequenceActions.tsx
  └─ 内嵌 checkbox "扣掉左上角背景色"
  └─ 通过 useLocalStorage 持久化；onCompose(files, opts) 签名扩
```

## 2. 算法

```ts
interface RGB { r: number; g: number; b: number; }

const CHROMA_TOLERANCE = 10;   // per-channel ±10 on 0..255 scale

function applyChromaKey(data: Uint8ClampedArray, key: RGB, tol: number): void {
  const { r, g, b } = key;
  for (let i = 0; i < data.length; i += 4) {
    const dr = Math.abs(data[i] - r);
    const dg = Math.abs(data[i + 1] - g);
    const db = Math.abs(data[i + 2] - b);
    if (dr <= tol && dg <= tol && db <= tol) {
      data[i + 3] = 0;   // set alpha to 0
    }
  }
}
```

Chebyshev 距离（`max(|dr|,|dg|,|db|) ≤ tol`）等价于 `dr<=tol && dg<=tol && db<=tol`；比欧氏距离快（没开方），对我们场景足够。

### 2.1 Key color 提取

第一帧（按自然排序）：

```ts
async function extractKeyColor(file: File): Promise<RGB> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new ConversionError('OffscreenCanvas 2D 不可用');
    ctx.drawImage(bitmap, 0, 0);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    return { r: pixel[0]!, g: pixel[1]!, b: pixel[2]! };
  } finally {
    bitmap.close();
  }
}
```

只读 `(0,0,1,1)` 一个像素，内存开销可忽略。

OffscreenCanvas 不可用时 fallback 到 DOM canvas，复用 videoEncoder 已有的双路径。

## 3. 集成到 encodeSequenceToWebP

```ts
export async function encodeSequenceToWebP(
  files: readonly File[],
  opts: VideoEncodeOptions & { chromaKey?: boolean },
  onProgress: (p: number) => void,
): Promise<Blob> {
  // ... existing code reading first frame dimensions ...

  // NEW: extract key color before preprocess loop
  let keyColor: RGB | null = null;
  if (opts.chromaKey && files[0]) {
    try {
      keyColor = await extractKeyColor(files[0]);
    } catch (cause) {
      throw new ConversionError('无法读取第一帧用于抠色', cause);
    }
  }

  // ... ffmpeg load ...

  for (let i = 0; i < files.length; i++) {
    // Existing: createImageBitmap → canvas → drawImage scaled
    // NEW (before convertToBlob): if keyColor → getImageData → apply → putImageData
    const pngBytes = await preprocessFrameToPng(file, width, height, keyColor);
    // ...
  }
  // ... ffmpeg exec unchanged ...
}
```

`preprocessFrameToPng` 多一个可选参数，内部分叉：

```ts
async function preprocessFrameToPng(
  file: File,
  width: number,
  height: number,
  chromaKey: RGB | null,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  // ... create canvas + ctx (OffscreenCanvas 主路径 + DOM fallback) ...
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (chromaKey) {
    const imgData = ctx.getImageData(0, 0, width, height);
    applyChromaKey(imgData.data, chromaKey, CHROMA_TOLERANCE);
    ctx.putImageData(imgData, 0, 0);
  }

  // convertToBlob PNG unchanged
}
```

ffmpeg 命令**不变**——因为预处理后的 PNG 已经带 alpha=0，`-pix_fmt yuva420p` 照常保留。

## 4. Queue 数据模型

FileItem 增加：

```ts
readonly sequenceChromaKey?: boolean;
```

ADD_SEQUENCE action 扩：

```ts
| { type: 'ADD_SEQUENCE'; files: readonly File[]; chromaKey: boolean }
```

reducer 写入 `item.sequenceChromaKey = action.chromaKey`。RECODE_ALL 跳过 sequence 的现有规则不变。

## 5. UI — SequenceActions

```tsx
// 紧邻合成按钮的一个小 checkbox
const [chromaKey, setChromaKey] = useLocalStorage<boolean>(
  'cwebp.sequence.chromaKey',
  false,
);

// onCompose 签名改为接收 opts
onCompose(imageFrames, { chromaKey });
```

App.tsx `handleComposeSequence` 调整：

```ts
const handleComposeSequence = (files, opts) => {
  dispatch({ type: 'ADD_SEQUENCE', files, chromaKey: opts.chromaKey });
};
```

Processor sequence 分支读 `item.sequenceChromaKey` 传给 `encodeSequence`。

## 6. 性能

1080p × 4 通道 × 2.07M 像素 ≈ 8M `Uint8ClampedArray` 访问 + 3 减法 + 3 比较 / 像素。V8 实测 ~50–80ms。对 10 帧总共增加 < 1 秒，可忽略。

内存：`getImageData` 分配 ~8 MB per 1080p 帧。已存在（之前也 getImageData），不是新开销。

## 7. 风险

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 容差 10 对白底 JPEG 不够宽 | 中 | 边缘残留一圈 | 记录为后续开放项；MVP 文案标注"精确抠色，JPEG 有轻微抖动时可能边缘残留" |
| 前景含和背景色近似的像素 | 中 | 前景被挖洞 | 容差 10 足够窄 (≈4%)；用户责任（选色不要和前景冲突） |
| (0,0) 像素不是背景色 | 中 | 抠错色 | 在 checkbox 旁 tooltip 说明"把背景色放在左上角" |
| 不同帧第一个像素差异超过容差 | 低 | 后续帧不被抠 | 用**第一帧 (0,0)** 统一，所有帧共用此 key |

## 8. 开放问题裁决

| 问题 | 裁决 |
|---|---|
| key 提取位置 | **在预处理循环前独立 extractKeyColor(first)** |
| 每帧预处理 | **内联** `applyChromaKey`（复用同一 canvas） |
| 距离函数 | **Chebyshev max**（3 次 abs + 3 次比较，最快） |
| 容差数值 | **固定 10**；留作后续 Phase 暴露 |

## 9. 后向兼容

- 默认 chromaKey = false；checkbox 未勾不触发任何新代码路径
- 旧的 `{ type: 'ADD_SEQUENCE', files }` 不再 typecheck 通过——所有 dispatch 点都需要显式传 chromaKey（只有 App.tsx 一处）
- `FileItem.sequenceChromaKey` 是 optional，老的 sequence item（不存在）默认 undefined，processor 按 `item.sequenceChromaKey === true` 判断
