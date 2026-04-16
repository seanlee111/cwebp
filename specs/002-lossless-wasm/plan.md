# Plan — Phase 2: True Lossless WASM 技术方案

> HOW。基于 [spec.md](spec.md) 需求和 `../001-mvp/constitution.md` 约束。

## 1. 库选型

三个候选：

| 库 | 来源 | 优点 | 缺点 |
|---|---|---|---|
| **@jsquash/webp** | GoogleChromeLabs / Squoosh 团队 | 维护活跃（2020–2025+）、API 简洁、Squoosh 生产环境验证 | ~500 KB WASM |
| wasm-webp | 第三方社区包 | 小（~300 KB） | 维护度不确定，文档较少 |
| libwebp-wasm | 手工编译 libwebp | 完全控制 | 需要自己维护 emscripten 构建管线 |

**决定：@jsquash/webp**。

理由：它被 Squoosh (Google) 在线生产使用，几乎等于事实标准；API 一行调用 `encode(imageData, { lossless: 1 })`；包结构已经拆成 `@jsquash/webp` + 独立 `.wasm` 文件，天然适配 Vite 的动态 import。

版本锁定等安装时敲定，倾向 `^1` 的最新 stable。

## 2. 架构

```
┌─────────────────────────────────────────────────────┐
│  App 状态：quality, encoderMode ∈ {canvas, wasm}     │
│                                                     │
│  用户开启 WASM 无损                                  │
│        │                                            │
│        ▼                                            │
│  wasmLoader.load()  ◄─── 首次触发 dynamic import    │
│        │                                            │
│        ▼                                            │
│  ┌──────────────────────────────────────────────┐  │
│  │  core/encoder.ts (策略派发)                   │  │
│  │                                              │  │
│  │  encode(file, { mode, quality }) →           │  │
│  │    mode === 'wasm'                           │  │
│  │      ? wasmEncoder.encode(bitmap, lossless)  │  │
│  │      : canvasEncoder.encode(bitmap, quality) │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  processor effect （App.tsx）不变；输入签名升级      │
└─────────────────────────────────────────────────────┘
```

## 3. 模块调整

### 新增

```
src/core/
├── encoder.ts              策略分发
├── canvasEncoder.ts        把现有 converter.ts 的 Canvas 编码逻辑搬过来
└── wasmEncoder.ts          @jsquash/webp 封装 + 懒加载
```

### 修改

- `converter.ts`：保留作为向后兼容的 re-export（或直接废弃，视改动量）
- `App.tsx`：`ConvertOptions` 类型新增 `mode: 'canvas' | 'wasm'`
- `QualityControl.tsx`：
  - 新加"真无损（WASM）"选项（替换原 checkbox 或并排）
  - 加载中态 / 失败态 UI

### 不变

- `DropZone.tsx`、`FileRow.tsx`、`FileQueue.tsx`、`BulkActions.tsx`、`queue.ts`、`zip.ts`、utils/hooks 全部不动。

## 4. 动态 import 策略

```ts
// src/core/wasmEncoder.ts

let modulePromise: Promise<typeof import('@jsquash/webp')> | null = null;

export async function loadWasm(): Promise<void> {
  if (!modulePromise) {
    modulePromise = import('@jsquash/webp');
  }
  await modulePromise;
}

export async function encodeLossless(bitmap: ImageBitmap): Promise<Blob> {
  if (!modulePromise) throw new Error('WASM module not loaded');
  const { encode } = await modulePromise;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('OffscreenCanvas 2D unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const buffer = await encode(imageData, { lossless: 1, quality: 100 });
  return new Blob([buffer], { type: 'image/webp' });
}
```

Vite 会自动把 `@jsquash/webp` 拆成独立 chunk，首屏不包含。

## 5. UI 设计（QualityControl 升级）

从现有的 "quality 滑块 + lossless 勾选" 演进为：

```
┌────────────────────────────────────────────────────────┐
│ 编码模式  (•) 高速（Canvas）    ( ) 真无损（WASM，~500KB）│
│                                                        │
│ 质量      ──────●────  80                               │
│                                                        │
│ [加载中文案在切换到 WASM 首次触发时出现]                  │
└────────────────────────────────────────────────────────┘
```

状态：
- `mode: 'canvas' | 'wasm'`
- `wasmState: 'idle' | 'loading' | 'ready' | 'failed'`

切到 wasm → 若 wasmState=idle 则调用 `loadWasm()` 并转 `loading`；成功 `ready` 后才真正触发 RECODE_ALL；失败回滚到 canvas 并显示红色提示。

## 6. 队列处理层

processor 逻辑基本不变，只是调用从 `convertToWebP(file, opts)` 改为 `encode(file, { mode, quality })`。

还要追加一个 invariant：如果 `mode === 'wasm'` 但 wasmState !== 'ready'，不应启动任何转换（UI 层保证不让用户选）。

## 7. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| @jsquash/webp 在 2026 停止维护 | 低 | 安装成功但体积 / API 漂移 | 先 `npm view @jsquash/webp` 确认维护时间；锁版本 |
| WASM 下载慢 / CORS 问题 | 低 | 用户抱怨 | Vite 会同源托管 WASM，不依赖外部 CDN |
| 主线程阻塞（大图 WASM 无损） | 中 | UI 冻结数秒 | 文案提示 + spinner；Phase 3 迁 Worker |
| 包体激增 | 中 | 首屏慢 | 严格 dynamic import；CI 校验 gzip ≤ 100KB |
| `OffscreenCanvas` 兼容 | 低 | Safari <16.4 | 降级用普通 canvas + getImageData |

## 8. 开放问题裁决

| 问题 | 裁决 |
|---|---|
| WASM 库 | **@jsquash/webp** |
| Web Worker | 本 Phase **不引入**（留给 Phase 3） |
| UI 位置 | **替换**原 lossless toggle，演进为 "编码模式" 二选一 |
| OffscreenCanvas 降级 | **做**（feature-detect + 普通 canvas） |

## 9. 成功判定（对齐 spec §5）

- [x] 设计规划：策略模式 + 懒加载清晰
- [ ] 运行时：Lena 透明 PNG lossless 像素级保真
- [ ] Network：首屏无 WASM；勾选时独立 chunk 触发
- [ ] 失败场景：断网时有 fallback 按钮
- [ ] 体积：首屏 ≤ 100 KB gzip（当前基线 82 KB，预算 18 KB 余量）
