# Plan — cwebp MVP 技术方案

> **HOW**。基于 [spec.md](spec.md) 的需求和 [constitution.md](constitution.md) 的约束。

## 1. 架构总览

```
┌─────────────────────────────────────────────────────┐
│                 浏览器（客户端）                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  React UI 层                                 │   │
│  │  • DropZone    • FileQueue                   │   │
│  │  • QualityCtrl • ResultCard                  │   │
│  └───────────────────┬─────────────────────────┘   │
│                      │ useReducer (queue state)     │
│  ┌───────────────────▼─────────────────────────┐   │
│  │  转换引擎（src/core/converter.ts）           │   │
│  │  File → ImageBitmap → Canvas                 │   │
│  │        → canvas.toBlob('image/webp', q)      │   │
│  │        → Blob (WebP)                         │   │
│  └─────────────────────────────────────────────┘   │
│                      │                               │
│  ┌───────────────────▼─────────────────────────┐   │
│  │  下载层                                       │   │
│  │  单个: URL.createObjectURL + <a download>    │   │
│  │  批量: jszip + FileSaver                     │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         ↑ 静态资源（HTML / JS / CSS）
     GitHub Pages / Vercel / 本地打开
```

**零后端**。零网络请求产生用户数据流出。

## 2. 技术栈定版

| 层 | 选型 | 版本要求 | 说明 |
|---|---|---|---|
| 构建工具 | Vite | ^6 | SPA 模板 |
| 前端框架 | React | ^18 | 并发特性适合大量文件状态更新 |
| 语言 | TypeScript | ^5 | `strict: true` |
| 样式 | Tailwind CSS | ^4 | 零 CSS 文件起步 |
| 图标 | lucide-react | 按需 | 体积友好 |
| ZIP 打包 | jszip | ^3 | 仅批量下载引入 |
| 文件保存 | file-saver | ^2 | 或直接 `a.click()` 规避 |
| 测试 | Vitest + Testing Library | 最新 | Phase 4 再引 |

**不装的东西**：Redux、Zustand、Tanstack Query（没有远端数据）、React Router（单页）、图标字体库、任何 polyfill。

## 3. 核心转换流程

### 3.1 单文件转换

```ts
async function convertToWebP(
  file: File,
  opts: { quality: number; lossless: boolean }
): Promise<Blob> {
  // 1. 解码为 ImageBitmap（硬件加速 & 流式解码）
  const bitmap = await createImageBitmap(file);

  // 2. 画到 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { alpha: true })!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close(); // 释放内存

  // 3. 编码为 WebP blob
  const quality = opts.lossless ? 1.0 : opts.quality / 100;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('编码失败'))),
      'image/webp',
      quality
    );
  });
}
```

**注意**：
- `createImageBitmap` 在所有目标浏览器都支持，且对大图比 `<img>.onload` 更省内存。
- `alpha: true` 保证透明 PNG 的透明通道在 Canvas 阶段不被丢失；WebP 编码器会自动保留 alpha。
- "无损模式" 在浏览器原生 Canvas API 下实际上是 `quality = 1.0`（**不是真正的 lossless WebP**）。如果测试发现透明边缘有瑕疵，**Phase 2** 再引入 `@jsquash/webp`（Squoosh WASM 版 libwebp）切到真无损模式。MVP 先用 quality=1 方案，文案上诚实标注。

### 3.2 队列状态机

每个文件有明确的状态转移：

```
pending → decoding → encoding → done
                 ↘           ↘
                  failed ← ← ←
```

`state: Record<id, FileItem>`：

```ts
type FileStatus = 'pending' | 'decoding' | 'encoding' | 'done' | 'failed';

interface FileItem {
  id: string;              // crypto.randomUUID()
  file: File;              // 原始 File
  status: FileStatus;
  originalSize: number;
  outputBlob?: Blob;
  outputSize?: number;
  error?: string;
  thumbnailUrl?: string;   // ObjectURL，卸载时 revoke
}
```

### 3.3 并发策略

- **MVP**：串行（`for ... of`），实现简单，10 张图内体验可接受。
- **Phase 2**：`navigator.hardwareConcurrency` 并发上限 - 2，或者 Web Worker 池。MVP 留好接口。

## 4. 组件拆分

```
src/
├── main.tsx
├── App.tsx
├── components/
│   ├── DropZone.tsx          空态拖放区
│   ├── FileQueue.tsx         队列表格
│   ├── FileRow.tsx           单行（缩略图、状态、操作）
│   ├── QualityControl.tsx    滑块 + 无损 toggle + 预设
│   └── BulkActions.tsx       "全部下载 ZIP" 按钮
├── core/
│   ├── converter.ts          纯函数：File → WebP Blob
│   ├── queue.ts              useReducer 状态机
│   └── zip.ts                jszip 封装
├── hooks/
│   ├── useLocalStorage.ts    质量/无损持久化
│   └── useDropTarget.ts      拖放事件封装
└── utils/
    ├── fileSize.ts           字节 → "1.2 MB"
    └── id.ts                 uuid
```

## 5. 状态管理

```ts
type Action =
  | { type: 'ADD_FILES'; files: File[] }
  | { type: 'START_CONVERT'; id: string }
  | { type: 'DONE'; id: string; blob: Blob }
  | { type: 'FAIL'; id: string; error: string }
  | { type: 'REMOVE'; id: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'RECODE_ALL' };   // 质量变更时

function reducer(state: QueueState, action: Action): QueueState { ... }
```

质量滑块用 `useDeferredValue` + 300ms debounce，避免每像素都重编码。

## 6. 目录结构（最终）

```
cwebp/
├── CLAUDE.md
├── specs/001-mvp/{constitution,spec,plan,tasks}.md
├── public/
│   └── favicon.svg
├── src/
│   ├── (上面拆分)
│   └── index.css           Tailwind 入口
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── .gitignore
```

## 7. 开放问题裁决（对应 spec.md §7）

| 问题 | 裁决 | 理由 |
|---|---|---|
| 质量默认值 | **80** | 实测 80/85 肉眼几乎无差，80 体积明显更小；用户可自调 |
| ZIP 是否 MVP 必需 | **是** | 10+ 张图场景频繁；jszip 40KB 代价可控 |
| File System Access API | **MVP 不用** | Safari/Firefox 不支持，分支逻辑劣化 MVP；Phase 2 再加作为 Chrome/Edge 增强 |

## 8. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解 |
|---|---|---|---|
| 大图 (4K+) 导致浏览器 OOM | 中 | 该图失败 | 用 `createImageBitmap` 而非 `<img>`；>10MB 文件串行；UI 显示明确错误 |
| Canvas WebP "无损" 不真正无损 | 中 | 透明 PNG 边缘轻微瑕疵 | 文案标注 "近无损"；Phase 2 引入 `@jsquash/webp` |
| Safari 旧版本 toBlob WebP 不支持 | 低 | 功能报错 | 启动时 feature-detect，不支持就提示升级浏览器 |
| 拖入目录浏览器不支持 | 低 | 无法一次多选 | 降级为多选 `<input>`；目录是加分项 |

## 9. 可演进路线（Phase 2+）

- Phase 2：引入 `@jsquash/webp` 支持真正的 lossless WebP + method 参数
- Phase 3：Web Worker 池并行编码，解锁批量性能
- Phase 4：打包成 Tauri 桌面应用，增加"输出到原目录 / 替换原图"能力
- Phase 5（可选）：支持 AVIF 输出

每个 Phase 独立 spec（`specs/002-xxx`），不破坏 MVP。
