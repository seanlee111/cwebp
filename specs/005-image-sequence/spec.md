# Spec — Phase 5: Image Sequence → Animated WebP

> WHAT & WHY。HOW 见 [plan.md](plan.md)，tasks 见 [tasks.md](tasks.md)。Constitution 延用 `../001-mvp/constitution.md`。

## 1. 问题陈述

Phase 3 解决了"一段视频 → 一张动图"。但设计师/开发者的另一种常见素材是"一组序列 PNG"（帧动画、UI 过渡、loading 动效）。目前工具只能把它们**一张一张**转成静图，不能合成动图。

同时，合成动图的一个**核心诉求**是**保留透明通道**——logo、图标、UI 动效几乎总有 alpha。目前静态图 → WebP 透明已 OK，但"序列合成"这条路径需要显式保证透明不被 ffmpeg 默认 pipeline 吃掉。

本 Phase = 让用户把队列里的若干 PNG / JPEG 合成为一张带透明背景的 animated WebP。

## 2. 用户故事

### US-5.1 队列有 ≥ 2 张静态图 → 底部出现"合成动图"按钮

> 作为用户，拖入 4 张 `frame_001.png` ... `frame_004.png` 后，队列下方出现一个"🎞 合成为动图（4 张）"按钮。

**验收**：
- 仅当 `queue.kind='image'` 的 item 数量 ≥ 2 时，按钮出现
- 按钮和现有"全部下载 ZIP"按钮同一行，UI 不抢位
- 按钮显示当前帧数（随队列变化实时更新）

### US-5.2 点击合成 → 产出 animated WebP

> 作为用户，我点击"合成为动图"，队列顶部出现一个合成任务行，显示预处理 + 编码进度。完成后像普通 item 一样可下载。

**验收**：
- 点击后一个新的 `kind='sequence'` 任务入队（不影响原来 4 张图，它们仍可独立转换/删除/重编码）
- 任务行显示："合成动图（4 张）" + 首帧缩略图 + 进度条
- 编码完成：原始大小（= 输入帧字节之和）、输出大小、节省百分比、下载按钮
- 使用当前 **FPS**（视频参数区）、**质量**、**循环次数** 参数；改这些参数不自动重编合成任务（RECODE_ALL 只作用于图/视频任务，合成任务完成后为终态）

### US-5.3 透明通道保留

> 作为设计师，把 4 张带 alpha 的 logo.png 合成动图后，下载的 `.webp` 在透明背景上正确显示，不被黑/白底污染。

**验收**：
- 输入至少一张 PNG 含 alpha 时，输出 WebP 的 alpha 通道保留（在 Chrome 的透明背景预览里验证）
- 输入全是 JPEG 时，输出为不透明动图（JPEG 本来就没 alpha，不强求伪透明）

### US-5.4 尺寸不一致自动对齐到第一帧

> 作为用户，混合了 800×600 和 1200×900 的帧也能合成成功，不报错。

**验收**：
- 以**自然排序后的第一帧**的尺寸为输出尺寸
- 其它帧用 `drawImage` 等比 scale 绘到同尺寸（长宽比不一致时可能拉伸，这是权衡，UI 用一行 tooltip 提醒）
- 同尺寸时无 scale 开销

### US-5.5 总字节上限硬门

> 作为用户，我选了 40 张大图（总 > 300 MB），按钮显示但点击后立即失败，不触发漫长的预处理 + ffmpeg 解析后再 OOM。

**验收**：
- 若队列中所有 `kind='image'` 的 item `originalSize` 之和 > **300 MB**，合成按钮仍显示但 `disabled` + tooltip "序列总体积超过 300 MB 上限"
- 按钮可点击时，点击后才正式创建 sequence 任务

## 3. 范围外

- **帧顺序手工拖拽**：MVP 只做**自然排序**（`localeCompare({numeric:true})`），不做 UI 拖拽排序
- **每帧不同 duration**：全局 FPS，不支持每帧单独
- **从动态 GIF 解帧**：只接受静态 PNG / JPEG
- **crop / 旋转 / trim**：不做
- **透明背景颜色自定义**：默认保留 alpha，不支持"背景填充 #fff"之类的选项
- **合成任务的 RECODE_ALL 重编码**：合成是一次性操作，完成后不跟随参数变动重编

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 首屏体积 | **仍 ≤ 100 KB gzip 硬门**（Phase 5 不引新依赖，复用 Phase 3 的 ffmpeg） |
| 序列任务内存峰值 | ≤ 1 GB（300 MB 输入 + 预处理翻倍 + MEMFS 复制，单线程 ffmpeg 能扛） |
| 合成编码时延（10 张 1080p PNG） | ≤ 60 秒（中端笔记本） |
| 自然排序 | Safari 10+ 支持的 `String.localeCompare` `{numeric: true}` |
| Constitution | P1 / P2 不变 |

## 5. 成功判定

同时满足：

1. 下载一组 [APNG 拆帧的样例](https://en.wikipedia.org/wiki/APNG)（5 张透明 PNG），拖入 cwebp → 合成 → 得到的 `.webp` 在 Chrome 中能看到透明背景循环动画。
2. 同一组图，FPS=10 vs FPS=30 对比，输出体积和播放速度不同（肉眼验证）。
3. 故意混入一张 JPEG 和一张 PNG（尺寸还不一样），合成不报错，透明部分保留（PNG 帧的 alpha 可见，JPEG 帧整个不透明）。
4. 拖入 50 张总计 320 MB 的图，按钮显示 "合成为动图（50 张）" 但 disabled，tooltip 显示上限解释。
5. 删掉队列中任意一张后，按钮帧数实时减少。
6. 合成任务本身可以通过 ✕ 按钮删除，不影响原输入帧。
7. 首屏 JS+CSS gzip 仍 ≤ 100 KB。

## 6. 开放问题（plan.md 裁决）

| 问题 | 候选 | 备注 |
|---|---|---|
| 输入帧预处理格式 | 统一转 PNG 写入 MEMFS / 直接写原字节 | plan §3 |
| 合成任务的 item.file 占位 | 用第一帧 File / 合成 Blob 占位 / null | plan §4 |
| ffmpeg 调用参数 | `-pix_fmt yuva420p` 固定 / 按 PNG vs JPEG 分别选 | plan §5 |
| 预处理 + 编码进度如何合并 | 两段线性映射 / 只 ffmpeg 段 | plan §5 |
| 序列任务排位 | 队列顶部 / 底部 / 跟在最后一帧后 | plan §4 |
