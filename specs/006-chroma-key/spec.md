# Spec — Phase 6: Chroma-Key Background Removal for Sequence Composition

> WHAT & WHY。HOW 见 [plan.md](plan.md)，tasks 见 [tasks.md](tasks.md)。Constitution 延用 `../001-mvp/constitution.md`。

## 1. 问题陈述

Phase 5 能把序列 PNG/JPEG 合成为 animated WebP，并用 `-pix_fmt yuva420p` 保留输入帧**已有**的透明通道。但常见的素材来源是：

- 游戏/UI 资源：导出成白底或纯色底的 PNG/JPEG（不带 alpha），需要把背景色扣掉
- 屏幕录制 / 序列截图：背景本身不透明，用户希望动图在网页/文档里是**透明叠加**效果

这些场景下即使合成成功，输出也是带背景色的动图，不符合"透明底"诉求。需要增加**抠色**（chroma-key）能力。

用户定义的 key 颜色：**每次合成的第一帧的左上角像素 `(0, 0)` 的 RGB**。这既直观（用户把背景色放在 (0,0) 即可），又不需要额外的 color picker UI。

## 2. 用户故事

### US-6.1 抠图开关

> 作为用户，合成按钮旁有一个"扣掉左上角背景色"勾选框。勾上后按合成按钮，输出的动图背景变透明；取消勾选，输出保持原样（现 Phase 5 行为）。

**验收**：
- `SequenceActions` 组件内（或紧邻）新增 checkbox："扣掉左上角背景色"
- 默认**未勾选**（不破坏现有行为）
- 状态持久化到 `localStorage.cwebp.sequence.chromaKey`；刷新页面保留
- 勾选后点"合成为动图"→ 创建的 sequence 任务带抠色标记

### US-6.2 统一 key color

> 作为用户，动画多帧背景都是同一色但因 JPEG 压缩略有抖动，我勾选抠图仍能干净去掉背景。

**验收**：
- Key color = **自然排序后第一帧**的 `getImageData(0, 0, 1, 1)` 返回的 RGB
- 所有帧统一用这同一个 key color 进行抠除（不是每帧各取各的 (0,0)）
- 容差：每通道 ±10（`max(|Δr|, |Δg|, |Δb|) ≤ 10`）。对 PNG 无损输入相当于精确匹配，对 JPEG 容忍少量压缩 artifact

### US-6.3 抠除后干净的透明输出

> 作为用户，下载扣过背景的 WebP，在任何透明背景的预览（macOS Finder 快速预览 / Chrome devtools 网格背景）上看不到原背景色残留，动画前景完整。

**验收**：
- 输出 `.webp` 的背景区域 alpha=0（完全透明）
- 前景像素的 alpha 保持 255（不被 chroma-key 误伤）
- 在 Chrome 透明网格页上查看，动图无白/绿/任意原底色残影

### US-6.4 抠色为一次性属性

> 作为用户，我已经创建过一个抠色合成任务，之后改 checkbox 不影响它；如果想重新合成，删掉任务重选即可。

**验收**：
- sequence item 上标记的 `chromaKey` 不随 checkbox 后续变动而变
- checkbox 只决定**下一次**点击合成按钮时的行为
- RECODE_ALL 不触发 sequence 重编（延续 Phase 5 规则）

## 3. 范围外

- **自定义 key 颜色**（用户选色 / 点击图片取色）：MVP 不做
- **调整容差**：写死 10，不做滑块
- **边缘羽化 / anti-alias smoothing**：不做；硬边界
- **多 key 颜色**（扣除多个不同颜色）：不做
- **non-sequence 任务的抠色**（单张图 / 视频）：不做
- **Preview** 抠色效果（用户需先合成才能看到）：不做

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 首屏体积 | 仍 ≤ 100 KB gzip 硬门 |
| 抠色算法耗时 | 1080p 单帧 ≤ 100 ms（JS 遍历像素） |
| 内存 | 复用现有 ImageData 缓冲区，不显著增加峰值 |
| Constitution | P1 / P2 不变 |

## 5. 成功判定

同时满足：

1. 拖 3 张白底 PNG（含前景细节），勾选 checkbox → 合成 → 下载 → 在 Chrome 透明背景预览下，白底被完全抠除，前景细节保留。
2. 同一组图不勾选 checkbox → 合成 → 白底原样保留。两次输出体积应不同（抠掉背景通常体积会减小）。
3. 故意混一张 JPEG（白底会有微小抖动 ~250/251/255），抠色仍能干净扣除。
4. 前景色和背景色差异 > 10/通道时，前景不被误伤。
5. checkbox 状态在刷新后保留。
6. 首屏 JS+CSS gzip 仍 ≤ 100 KB。

## 6. 开放问题（plan.md 裁决）

| 问题 | 候选 | 备注 |
|---|---|---|
| key 提取位置 | 读第一帧前 / 在循环内第 0 帧时 | plan §3 |
| 每帧预处理里做抠色 vs 单独 pass | 内联 / 独立 | plan §4 |
| 容差距离函数 | Chebyshev max 差 / 欧氏距离 | plan §5 |
| 容差数值 | 10（固定）/ 暴露 UI | plan §5 |
