# cwebp — 图片转 WebP 工具

> 本文件是项目总体方案入口，由 Claude Code 自动读取。任何改动应回到这里同步更新。

## 一句话

一个零安装、本地处理的 **PNG / JPEG / JPG 批量转 WebP** 工具，带可视化界面，MVP 以静态 Web 应用形态交付，后续可无缝升级为 Tauri 桌面版。

## 业内最佳实践调研结论

### 技术路线对比（2026 年视角）

| 方案 | 代表产品 | 优势 | 劣势 | 适合阶段 |
|---|---|---|---|---|
| **纯浏览器 Web 应用** | [Squoosh](https://squoosh.app)、[jam.dev WebP Converter](https://jam.dev/utilities/webp-converter)、PicShift | 零安装、隐私友好、部署只需静态托管、跨平台 | 超大图批处理受限于浏览器内存 | **MVP 首选** |
| **Tauri 桌面应用** | Tavif (Rust + Next.js) | 包体 ~25x 更小、启动 ~4x 更快、内存降 58–75%、可调用原生文件系统 | 需要 Rust 构建、分发要签名 | 产品化阶段 |
| **Electron 桌面应用** | 传统做法 | 生态成熟 | 包体大、内存高、2026 年已被 Tauri 全面赶超 | 不推荐 |

### 底层编码器

- **libwebp**（Google，Apache-2.0）是**唯一**真实在做 WebP 编码的库；cwebp CLI、Sharp、Squoosh WASM、浏览器内置 Canvas 编码器，最终都落到 libwebp。
- 浏览器 `HTMLCanvasElement.toBlob('image/webp', quality)` **所有现代浏览器均支持**（市场占有率 ≈ 97%，Safari 14+ / 2020-09 起），MVP 可直接使用，无需引入 WASM。
- 进阶场景（方法参数、无损透明、超大图、EXIF 保留）再考虑引入 Squoosh 的 WASM codec 或 libwebp.wasm。

### UX 公认要素

1. **拖放 + 多选**：整个目录拖入即可，每个文件有独立进度与缩略图。
2. **批量处理**：队列可视化，失败独立显示不阻塞其他文件。
3. **质量滑块**：0–100，默认 80–85（业内 sweet spot：视觉几乎无损、体积 -25%～-35%）。
4. **原始 vs 转换 对比预览**：缩略图 + 体积差（绝对值 + 百分比）。
5. **预设**：Web / 社交 / 归档（对应不同质量与无损开关）。
6. **无损模式开关**：PNG 透明场景必备。
7. **元数据保留**：EXIF / ICC 可选（MVP 可先不做，方案留接口）。
8. **本地处理承诺**：文案明确"文件不上传"，建立信任。

## MVP 技术选型

**结论：静态 Web 应用（Vite + React + TypeScript + Tailwind），核心转换走原生 Canvas API。**

| 维度 | 选择 | 理由 |
|---|---|---|
| 形态 | 静态单页应用 | 零安装、可用 GitHub Pages / Vercel / 本地打开 HTML 文件运行 |
| 构建工具 | Vite | 启动快、TS/JSX 开箱即用、生态成熟 |
| UI 框架 | React 18 + TypeScript | 团队常见、Hooks 模型适合这类数据流 |
| 样式 | Tailwind CSS | 原型速度最快、无需单独写 CSS 文件 |
| 转换核心 | `HTMLCanvasElement.toBlob` | 零依赖、浏览器原生、质量参数直通 libwebp |
| 文件存取 | File System Access API（Chrome/Edge）+ `<input type="file">` 降级 | 可直接写回磁盘，不支持的浏览器自动降级为逐个下载 |
| 多文件并行 | Web Worker + 队列（阶段 2） | MVP 先串行，跑通后再并发 |
| 状态管理 | useState + useReducer | MVP 体量用不上 Redux/Zustand |

### 不做什么（刻意收窄 MVP 范围）

- ❌ 不做服务端上传 / 云处理（隐私卖点）
- ❌ 不做 AVIF / HEIC（聚焦 WebP，避免多编码器复杂度）
- ❌ 不做图像裁剪 / 滤镜（功能蔓延）
- ❌ 不做账号 / 历史记录（零后端）
- ❌ 不做 i18n（先中文，后续再拆）

## 目录结构

```
cwebp/
├── CLAUDE.md                    ← 你在这里（总体方案）
├── specs/
│   └── 001-mvp/
│       ├── constitution.md      项目原则 & 不可变约束
│       ├── spec.md              产品规格（WHAT & WHY，无实现细节）
│       ├── plan.md              技术方案（HOW，架构 & 选型）
│       └── tasks.md             任务分解（可执行 checklist）
└── (src/、package.json 等在 Phase 1 开始后生成)
```

## Spec-Driven 推进流程

参考 [GitHub Spec Kit](https://github.com/github/spec-kit) 的分阶段做法：

| Iteration | 产出 | 状态 |
|---|---|---|
| **001-mvp** | [constitution](specs/001-mvp/constitution.md) · [spec](specs/001-mvp/spec.md) · [plan](specs/001-mvp/plan.md) · [tasks](specs/001-mvp/tasks.md) | ✅ 交付 + 浏览器验收通过 |
| **002-lossless-wasm** | [spec](specs/002-lossless-wasm/spec.md) · [plan](specs/002-lossless-wasm/plan.md) · [tasks](specs/002-lossless-wasm/tasks.md) | ✅ 实现完成（首屏 hard gate 通过） |
| **003-animated-video** | [spec](specs/003-animated-video/spec.md) · [plan](specs/003-animated-video/plan.md) · [tasks](specs/003-animated-video/tasks.md) | ✅ 实现完成（首屏 90.87 KB gzip，ffmpeg core 独立 chunk） |
| **004-bigger-and-worker** | [spec](specs/004-bigger-and-worker/spec.md) · [plan](specs/004-bigger-and-worker/plan.md) · [tasks](specs/004-bigger-and-worker/tasks.md) | ✅ 实现完成（图 200 MB / 视频 500 MB / 时长 30s；静态图 Worker 化；首屏 92 KB gzip） |
| **005-image-sequence** | [spec](specs/005-image-sequence/spec.md) · [plan](specs/005-image-sequence/plan.md) · [tasks](specs/005-image-sequence/tasks.md) | ✅ 实现完成（序列 PNG/JPEG → 透明 animated WebP；首屏 93 KB gzip） |
| **006-chroma-key** | [spec](specs/006-chroma-key/spec.md) · [plan](specs/006-chroma-key/plan.md) · [tasks](specs/006-chroma-key/tasks.md) | ✅ 实现完成（序列合成按左上角像素 chroma-key 抠色；首屏 93.30 KB gzip） |
| 007+ | 多文件并发 / 视频 trim / Tauri 桌面版 / AVIF | ⏳ 未规划 |

### MVP 实现 commit 轨迹（001）

| Commit | Phase | 内容 |
|---|---|---|
| `57a6ab1` | — | initial specs 基线 |
| `b1eb479` | 4.0 | 脚手架：Vite 6 + React 18 + TS strict + Tailwind 4 |
| `7d2deac` | 4.1 | 转换核心：converter / queue / utils |
| `911fe17` | 4.2 | US-1 最小 UI：DropZone / FileRow / FileQueue |
| `005d0e6` | 4.3 | US-2 + US-3：批量、质量滑块、ZIP 打包 |
| `9a06e5c` | 4.4 | US-5 收尾：启动 feature-detect |
| `8aec231` | 4.5 | 响应式微调 |
| `dc6c403` | 4.6 | README + build 验证 + docs 同步 |
| `050f17b` | — | Phase 2 spec + Pages deployment wiring |
| `d887164` | — | Phase 2 3 条决策：首屏 hard gate / 删 converter.ts / 默认 WASM + idle prefetch |

### Phase 2 实现 commit 轨迹（002）

| Commit | Phase | 内容 |
|---|---|---|
| `86e63d0` | 5.1–5.3 | encoder 策略分发：canvasEncoder / wasmEncoder / encoder 三文件；QualityControl 升级为 mode 二选一；App 支持 wasm 模式 + idle prefetch + 处理 gate；删 converter.ts |

**Phase 2 构建结果**：首屏 critical 88.65 KB gzip，< 100 KB 硬预算。WASM chunks（enc / enc_simd / dec）都拆成独立 chunk。

### Phase 3 实现 commit 轨迹（003）

| Commit | Phase | 内容 |
|---|---|---|
| `2e5dd61` | — | Phase 3 spec（方案 A：ffmpeg.wasm 单线程 + 用户拍板） |
| 本次 | 6.1–6.5 | queue.ts 加 kind/progress/videoMeta/SET_THUMBNAIL/PROGRESS；videoEncoder.ts 懒加载 @ffmpeg/ffmpeg + @ffmpeg/core + @ffmpeg/util；encoder.ts 加 encodeVideo/probeVideoMetadata/captureVideoThumbnail/subscribeVideoState/preloadVideoEncoder；DropZone accept 扩展；QualityControl 加视频参数区；FileRow 加进度条 + 时长 badge；App 加视频状态订阅 / thumbnail 生成 / processor 视频分支 / 顶部加载 banner |

**Phase 3 构建结果**：
- 首屏 critical **90.87 KB gzip**（主 JS 85.89 + CSS 4.60 + HTML 0.38），< 100 KB 硬预算，余量 9 KB
- ffmpeg-core.wasm 10.29 MB gzip 独立 chunk，仅在 `loadFfmpeg()` 触发时才 fetch
- videoEncoder.ts 1.49 KB gzip 独立 chunk

### Phase 4 实现 commit 轨迹（004）

| Commit | Phase | 内容 |
|---|---|---|
| `98e08c2` | — | Phase 4 spec（放宽上限 + Web Worker 静态图） |
| 本次 | 7.0–7.4 | queue.ts 拆分 MAX_IMAGE_SIZE_BYTES(200MB) / MAX_VIDEO_SIZE_BYTES(500MB) + sizeCapFor 查表；App MAX_VIDEO_DURATION_SEC 10→30；DropZone 文案；canvasEncoder/wasmEncoder 重写为 OffscreenCanvas worker-safe；encoder.worker.ts + encoderClient.ts 新增（ES module worker + feature-detect fallback）；encoder.ts 切换到 encoderClient；utils/estimate.ts 软阈值 + 耗时估算；FileRow 大文件 ⚠ tooltip；App 顶部"有大文件"淡黄色 banner；vite.config.ts worker.format='es' |

**Phase 4 构建结果**：
- 首屏 critical **92.03 KB gzip**（主 JS 86.94 + CSS 4.70 + HTML 0.39），< 100 KB 硬预算，余量 8 KB
- `encoder.worker-*.js` 独立 chunk，静态图编码脱离主线程
- 其它 chunk 拆分和 Phase 3 一致

### Phase 5 实现 commit 轨迹（005）

| Commit | Phase | 内容 |
|---|---|---|
| `094f5f7` | — | Phase 5 spec（序列 PNG/JPEG → 透明 animated WebP） |
| 本次 | 8.0–8.3 | utils/naturalSort.ts；queue.ts 加 kind='sequence' + sequenceFrames + sequenceFrameCount + ADD_SEQUENCE action（自然排序）；RECODE_ALL 跳过 sequence；videoEncoder.ts 加 encodeSequenceToWebP（预处理 OffscreenCanvas 统一 PNG 写 MEMFS + ffmpeg -pix_fmt yuva420p 保留透明，进度两段 0–0.5 / 0.5–1）；encoder.ts 加 encodeSequence 包装；SequenceActions 底部按钮（图 ≥ 2 出现，300 MB 上限 disable）；FileRow 支持 sequence kind（Film 图标 overlay、"合成动图（N 帧）" 名、sequence 下载文件名 `sequence-N-frames-YYYYMMDD.webp`）；App.tsx processor sequence 分支、needsFfmpeg（video 或 sequence）替代 hasVideoTask 触发 ffmpeg 预热 |

**Phase 5 构建结果**：
- 首屏 critical **93.02 KB gzip**（主 JS 87.81 + CSS 4.83 + HTML 0.38），< 100 KB 硬预算，余量 7 KB
- videoEncoder chunk 从 1.49 KB → 2.19 KB gzip（加了预处理 + encodeSequenceToWebP 函数）
- 零新依赖：复用 Phase 3 的 ffmpeg.wasm

### Phase 6 实现 commit 轨迹（006）

| Commit | Phase | 内容 |
|---|---|---|
| `e28e579` | — | Phase 6 spec（序列合成 chroma-key 抠色） |
| 本次 | 9.0–9.3 | queue.ts 加 FileItem.sequenceChromaKey + ADD_SEQUENCE payload 必传 chromaKey；videoEncoder.ts 加 applyChromaKey（Chebyshev ±10 容差）+ extractKeyColor（读第一帧 (0,0)）+ preprocessFrameToPng 接收 chromaKey 参数；encoder.ts 的 encodeSequence 签名扩；SequenceActions 嵌入 checkbox "扣掉左上角背景色"（localStorage 持久化），onCompose 签名扩；App.tsx handleComposeSequence 接 opts，processor sequence 分支读 item.sequenceChromaKey 传给 encodeSequence |

**Phase 6 构建结果**：
- 首屏 critical **93.30 KB gzip**（主 JS 88.09 + CSS 4.83 + HTML 0.38），< 100 KB 硬预算，余量 6.7 KB
- videoEncoder chunk 2.19 KB → 2.56 KB gzip（加入 chroma-key 算法）
- 零新依赖

**工作节奏**：每个 Phase 独立 commit；build 产物（`dist/`）在 `.gitignore` 里。

## MVP 成功判定（验收标准）

同时满足：

1. 用户拖入 10 张 PNG/JPEG（混合，共 ≤ 50 MB），**全部转换成功**生成 WebP 并可下载。
2. 质量滑块调整后，**预览缩略图 & 体积估算实时刷新**。
3. 同一张 1920×1080 的 JPEG（~500 KB），在质量 80 下输出体积应 **小于原图 85%**。
4. 透明 PNG 输出 WebP 后透明通道完整保留（肉眼抽检）。
5. 全程 **没有任何网络请求**离开浏览器（DevTools Network 面板可验证）。
6. 主流浏览器（Chrome / Edge / Safari / Firefox 最新版）均能正常工作。

## 当前状态

**MVP（001）+ Phase 2 / 3 / 4 / 5 / 6 实现完成**。全程守住 **首屏 ≤ 100 KB gzip** 硬门（当前 **93.30 KB gzip**）。六大功能线：

- 静态图 Canvas 编码 · 静态图 WASM lossless（jsquash，懒加载）
- 视频 → animated WebP（ffmpeg.wasm 单线程，懒加载 ~10 MB core）
- 静态图编码整体搬到 Web Worker（Phase 4，大图不卡 UI；不支持时自动降级主线程）
- 上限放宽：图 200 MB / 视频 500 MB / 视频时长 30 s；大文件有 tooltip 预估和顶部 banner
- 序列图 → 动图（Phase 5，复用 Phase 3 的 ffmpeg；默认 `-pix_fmt yuva420p` 保留透明；队列 ≥ 2 张图时底部出现"合成为动图"按钮；总 ≤ 300 MB；自然排序）
- **序列合成抠色**（Phase 6，合成按钮旁 checkbox "扣掉左上角背景色"；以第一帧 (0,0) 像素 RGB 作为 key color；Chebyshev ±10 容差；PNG 精确 / JPEG 宽容）

待用户浏览器验收 Phase 6 的 4 条 US（US-6.1 开关 / US-6.2 统一 key / US-6.3 干净透明 / US-6.4 一次性属性）。

**Phase 3 License 注意**：`@ffmpeg/core@0.12.10` 是 **GPL-2.0-or-later**，相比其它依赖（MIT / Apache-2.0）属于强 copyleft。这是**运行时动态加载**的库（非静态链接），通常按聚合而非派生作品处理。如果本项目未来决定采用非兼容 license（如商用闭源），需重新评估或走 LGPL build。

## 部署

| 维度 | 配置 |
|---|---|
| 仓库 | [github.com/seanlee111/cwebp](https://github.com/seanlee111/cwebp)（公有） |
| 托管 | GitHub Pages |
| 流程 | 每次 push main → `.github/workflows/deploy.yml` → `npm run build:pages` → Pages |
| URL | https://seanlee111.github.io/cwebp/ |
| Vite base | 生产 `mode=pages` 时 `/cwebp/`；其它 `./`（保持 `file://` 直开能力） |

每次改动主分支会自动重新构建发布。如需立即触发：Actions 面板 → Deploy to GitHub Pages → Run workflow。

## 下一步

- **Phase 2 实现**：待用户审 [specs/002-lossless-wasm/](specs/002-lossless-wasm/) 三份文档（spec / plan / tasks）后按 T-35 起开工
- **进入 Phase 3/4/5**：各自独立 spec，参见 [001/plan.md §9 Roadmap](specs/001-mvp/plan.md)

---

_最后更新：2026-04-16（MVP 完成 + Phase 2 spec 就位 + Pages 部署配置完成）_
