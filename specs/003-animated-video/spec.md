# Spec — Phase 3: Video → Animated WebP

> WHAT & WHY。HOW 见 [plan.md](plan.md)，tasks 见 [tasks.md](tasks.md)。Constitution 延用 `../001-mvp/constitution.md`。

## 1. 问题陈述

MVP 和 Phase 2 只处理静态图片。用户经常有短视频（截屏录制、样机演示、产品动图）想转成 **animated WebP** 用于网页/文档嵌入——相比 GIF，animated WebP 体积更小（典型 -60%）、支持 alpha、24-bit 色深。

当前工具链痛点和 001 相同：在线站要上传、CLI 有门槛；且主流在线站（ezgif 等）均为 **服务端 ffmpeg**，不符合本项目"本地处理"定位。

**现在做**：把同一入口 UI 扩展成也能接视频，保留零后端的隐私承诺，输出 animated WebP。

## 2. 用户故事

### US-3.1 视频拖入直出动图

> 作为用户，我把 10 秒以内的 MP4 / WebM 拖进来，得到一张 animated WebP 可以直接下载。

**验收**：
- 拖入视频文件后自动识别为"视频任务"，不混进静态图流水线。
- 转换中显示编码进度（0–100%），不是转圈占位。
- 完成后 FileRow 展示首帧缩略图 + 原/新体积 + 下载按钮，得到的 `.webp` 在 Chrome / Safari 预览能看到动图循环。

### US-3.2 必要参数可控

> 作为用户，我能选择输出 FPS（平滑度 vs 体积）、质量（清晰度 vs 体积）和循环次数（无限 / 一次）。

**验收**：
- UI 出现"视频参数"区：FPS 四档（10 / 15 / 20 / 30，默认 15）；质量滑块 0–100（默认 75，复用现有滑块）；循环次数单选（无限 / 一次，默认无限）。
- 拖入视频前这个区可以 **隐藏或置灰**，避免干扰纯图场景。
- 参数变化触发所有视频任务 RECODE_ALL（与 Phase 2 同机制）。

### US-3.3 超出边界的明确反馈

> 作为用户，拖入一个 30 秒视频或 4K 视频或损坏文件时，我立刻看到具体原因，而不是卡住。

**验收**：
- 拖入视频 > 10 秒：立即标红失败 "视频时长超过 10 秒上限"。
- 拖入视频 > 1080p：自动降采样到 1080p 并在日志/tooltip 注明（**不是**报错）。
- 拖入 > 50 MB：复用既有逻辑，立即失败。
- 损坏 / 浏览器解不开的视频：失败且错误文案指向"文件可能已损坏或格式不支持"。

### US-3.4 首次加载成本的明确提示

> 作为第一次进视频场景的用户，我知道加载 ffmpeg 需要下载 ~10 MB，看得到进度条，不是盲等。

**验收**：
- 第一次选择视频（或 App 检测到视频任务入队）才开始下载 ffmpeg；静态图场景不触发下载。
- 加载过程显示 "正在加载视频编码器（~10 MB）…" 字样 + 百分比进度。
- 加载完成后浏览器缓存（HTTP cache）复用；刷新后不重复下载。
- 加载失败：红色错误 + "重试"按钮，不影响现有静态图队列。

## 3. 范围外（明确排除）

- **Trim（起止时间选择）**：Phase 3.1 再做。
- **Crop / aspect ratio / 去黑边**：不做。
- **旋转 / 镜像**：不做。
- **音频**：输出 WebP 不含音频（WebP 本不支持）。视频里的音轨直接丢弃。
- **帧级编辑 / 滤镜**：不做。
- **多线程 ffmpeg 加速**：不做——`@ffmpeg/core-mt` 要求 COOP/COEP headers，GitHub Pages 不支持自定义 header；留到 Phase 3.1/Phase 4（换托管或加 Service Worker hack）。
- **支持 4K / > 10s 视频**：硬上限。
- **替代 ffmpeg 的"轻量方案"**：已在调研中放弃（webpxmux 路线见 Phase 3.1 可选升级）。

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 首屏体积 | **仍 ≤ 100 KB gzip 硬门**（ffmpeg core 独立 chunk，不算首屏） |
| ffmpeg chunk 体积 | ≤ 12 MB gzip（单线程 LGPL build） |
| 编码时延（10s / 720p / 15fps） | 中端笔记本 ≤ 60 秒（用户等候需有进度条反馈） |
| 内存占用 | 编码期间 ≤ 1 GB 峰值；超限浏览器会崩，用"10s / 1080p"硬门兜底 |
| 兼容 | MVP 所有浏览器继续工作；视频功能要求浏览器 `<video>` 能播放该格式 + 支持 WASM |
| Constitution | P1（隐私）不动摇：ffmpeg core 必须托管在自己域名（`dist/assets/`），不走第三方 CDN |

## 5. 成功判定

同时满足：

1. 拖入一段 ≤ 10s 的 MP4（示例：720p / 30fps / 5s）→ 得到 animated WebP 可下载，体积通常比原 MP4 小（取决于内容）。
2. FPS=15 vs FPS=30 对同一视频：FPS=15 的输出体积明显更小（期望 -30%+）。
3. 拖入 15 秒视频 → 立即显示"超过 10 秒上限"红色 FAIL，不触发 ffmpeg 加载。
4. DevTools Network：第一次进纯图任务无 ffmpeg core 请求；拖入视频瞬间出现 `ffmpeg-core.js` + `.wasm` chunk 请求。
5. ffmpeg 加载失败（模拟 404 或 offline）→ UI 显示明确错误 + 重试按钮，不 crash。
6. 刷新后第二次拖视频，HTTP 304 / cache hit，不重复下载 10 MB。
7. 首屏 critical JS+CSS gzip 仍 ≤ 100 KB（与 Phase 2 一致）。

## 6. 开放问题（plan.md 裁决）

| 问题 | 候选 | 备注 |
|---|---|---|
| core 托管方式 | 本地 `public/ffmpeg/` vs `import('@ffmpeg/core?url')` 让 Vite 自动拆 | 见 plan §3 |
| 缩略图生成 | 直接取 WebP 第一帧 vs 单独生成 | 一次编码内出首帧更省代价 |
| 视频入队后 UI 如何与静态图共存 | 单列表 / 分组 | 单列表更简单，靠 badge 区分 |
| `queue.ts` 是否需要加 `kind: 'image' \| 'video'` 字段 | 加 / 不加 | 不加则 processor 按 MIME 判断 |
