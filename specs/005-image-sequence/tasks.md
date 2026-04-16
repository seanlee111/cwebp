# Tasks — Phase 5: Image Sequence → Animated WebP

> 编号延续 004（T-79..T-95）。Phase 5 从 **T-96** 起。

## Phase 8.0 数据模型

- [ ] **T-96** `src/core/queue.ts`：
  - `FileKind` 扩展为 `'image' | 'video' | 'sequence'`
  - `FileItem` 增加 `sequenceFrames?: readonly File[]`、`sequenceFrameCount?: number`
  - 新 action `ADD_SEQUENCE`：按自然排序入队，`file = sorted[0]`、`originalSize = sum(sizes)`、`thumbnailUrl = createObjectURL(sorted[0])`、`kind='sequence'`
  - `RECODE_ALL` 跳过 sequence（完成即终态）
- [ ] **T-97** `src/utils/naturalSort.ts`（或 inline helper）：`naturalCompare(a, b)` 用 `localeCompare({numeric: true, sensitivity: 'base'})`

**验收**：dispatch `ADD_SEQUENCE` 后队列出现一条 kind='sequence' 的 item，thumbnail 正确。

## Phase 8.1 encoder

- [ ] **T-98** `src/core/videoEncoder.ts` 加 `encodeSequenceToWebP(files, opts, onProgress)`：
  - 预处理：按自然序逐帧 `createImageBitmap` → OffscreenCanvas scale 到第一帧 W×H → `convertToBlob('image/png')` → `writeFile('img_%04d.png', bytes)`。进度 0..0.5
  - ffmpeg exec: `['-framerate', fps, '-i', 'img_%04d.png', '-loop', loop, '-pix_fmt', 'yuva420p', '-quality', q, 'out.webp']`。ffmpeg progress 映射 0.5..1
  - finally: deleteFile 所有 input + output
- [ ] **T-99** `src/core/encoder.ts` 加 `encodeSequence(files, opts, onProgress)` → dynamic import videoEncoder 委托
- [ ] **T-100** 视频 opts 类型复用：`VideoEncodeOptions { fps, quality, loopCount }` 合并用于 sequence

**验收**：DevTools Console 里手动 `await __encode_seq(files, opts, progressFn)` 能得到一个透明 animated WebP。

## Phase 8.2 UI

- [ ] **T-101** `src/components/SequenceActions.tsx`（新）：
  - 接收 `items: FileItem[]`、`onCompose(files: File[])`
  - 筛选 `kind==='image'` 的 items
  - 若 < 2 返回 null
  - 若 2+ 显示按钮："🎞 合成为动图（N 张）"
  - 若总 size > 300 MB 时按钮 disable + tooltip
- [ ] **T-102** `src/components/FileRow.tsx` 支持 `kind==='sequence'`：
  - 名字行显示 "合成动图（N 张）" + Film 图标
  - 原始体积展示 sum；成功后输出 + 节省
  - 其他行为同 video（进度条、下载按钮）
- [ ] **T-103** `src/App.tsx`：
  - `items` 计算后传给 SequenceActions
  - `onCompose(files)` 里 dispatch `{type:'ADD_SEQUENCE', files}`
  - processor 加 sequence 分支：调 `encodeSequence(frames, {fps, quality, loopCount}, onProgress)`
  - 下载文件名改为基于 kind：sequence 任务用 `sequence-N-frames-YYYYMMDD.webp`

**验收**：拖入 3 张 frame_01.png..frame_03.png，点击合成，队列出现 sequence item，编码成功下载动图可看到循环。

## Phase 8.3 收尾

- [ ] **T-104** `npm run build` 硬门：
  - 首屏 JS+CSS gzip ≤ 100 KB
  - 不产生新的 vendor chunk（复用 Phase 3 的 ffmpeg）
- [ ] **T-105** 更新 CLAUDE.md（iteration 行 005 + commit 轨迹 + 当前状态）+ README（功能清单 + Roadmap 打勾）
- [ ] **T-106** commit + push → Pages 自动部署

**验收**：线上 https://seanlee111.github.io/cwebp/ 能完整跑通 "4 张透明 PNG 合成动图"。

---

## 已决策（见 plan.md §10）

- 预处理统一 PNG 写 MEMFS
- sequence.file = 第一帧
- ffmpeg `-pix_fmt yuva420p` 固定
- 进度 0–0.5 预处理 / 0.5–1 ffmpeg
- 任务排位队列底部
