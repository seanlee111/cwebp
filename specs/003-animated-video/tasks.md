# Tasks — Phase 3: Video → Animated WebP

> 编号延续 002（T-35..T-54）。Phase 3 从 **T-55** 起。

## Phase 6.0 去风险

- [ ] **T-55** `npm view @ffmpeg/ffmpeg @ffmpeg/core @ffmpeg/util` 拉最新版本号（已做：0.12.15 / 0.12.10 / 0.12.2，2025-04 发布）
- [ ] **T-56** 在 Vite 里验证 `import '@ffmpeg/core/dist/umd/ffmpeg-core.wasm?url'` 能成功解析为 chunk URL；如失败，回退 `public/ffmpeg/` 方案

**验收**：build 能产生 `ffmpeg-core-{hash}.wasm` 在 `dist/assets/`；主 bundle 不包含 core 字节。

## Phase 6.1 状态机扩展

- [ ] **T-57** `queue.ts` 加 `FileItem.kind: 'image' | 'video'`；ADD_FILES 按 MIME 判定并写入
- [ ] **T-58** `queue.ts` 加 `FileItem.progress?: number`（0..1）
- [ ] **T-59** 新 action `{ type: 'PROGRESS', id, progress }`；`START_CONVERT` 时 reset 为 0
- [ ] **T-60** `FileItem.videoMeta?: { duration: number; width: number; height: number }`（给 FileRow 显示时长用）

**验收**：typecheck 通过；现有图片流水线行为不变（回归测试）。

## Phase 6.2 videoEncoder.ts

- [ ] **T-61** `npm install @ffmpeg/ffmpeg @ffmpeg/core @ffmpeg/util` 并锁版本
- [ ] **T-62** 新建 `src/core/videoEncoder.ts`：
  - `loadFfmpeg()` 动态 import + `toBlobURL` + 订阅 subscribe 机制（参考 `wasmEncoder.ts`）
  - `FfmpegLoadState = 'idle' | 'loading' | 'ready' | 'failed'`
  - `subscribeFfmpegState` / `getFfmpegState`
- [ ] **T-63** `probeVideoMetadata(file)` 用 `<video>` 的 `loadedmetadata` 事件异步读 `duration / videoWidth / videoHeight`；超时 5 秒 reject
- [ ] **T-64** `encodeVideoToWebP(file, opts, onProgress)`：按 plan §5 实现；finally 清 MEMFS
- [ ] **T-65** `encoder.ts` 扩展：`encode(file, ...)` 对 `video/*` 走 `encodeVideoToWebP` 分支，其他保持
- [ ] **T-66** 视频 opts 类型定义：`VideoEncodeOptions { fps, quality, loopCount }`

**验收**：能在 DevTools Console 里 `await __encode(videoFile, { ... })`，返回一个 WebP Blob 可预览成动图。

## Phase 6.3 UI

- [ ] **T-67** `DropZone` accept 加视频 MIME；空态文案补一行"也支持 10 秒内短视频"
- [ ] **T-68** `FileRow`：
  - `kind === 'video'` 且 `videoMeta` 有：文件名右边加时长 badge `0:03`
  - `status === 'converting'` 且有 `progress`：水平进度条（替换 spinner）
  - 缩略图：视频用首帧（异步生成并附到 item.thumbnailUrl）
- [ ] **T-69** `QualityControl` 加"视频参数"区（仅在 queue 有视频时可见）：
  - FPS 四档 radio：10 / 15 / 20 / 30
  - 循环次数 radio：无限 / 一次
  - 质量滑块复用（视频和静图都看）
- [ ] **T-70** `App.tsx` 持久化 fps / loopCount 到 `localStorage`（key: `cwebp.video.fps`, `cwebp.video.loop`）
- [ ] **T-71** `App.tsx` 顶部加"编码器状态条"：当 ffmpegState = loading 时全宽提示"正在加载视频编码器（~10 MB）…"；failed 时红色 + 重试按钮

**验收**：拖入视频 → 看到进度条 → 得到 WebP 动图 → 下载后在系统预览器里能看到动图循环。

## Phase 6.4 硬限制与失败

- [ ] **T-72** processor 在视频任务 START_CONVERT 前调 `probeVideoMetadata`：
  - `duration > 10` → FAIL "视频时长超过 10 秒上限"
  - `videoWidth > 1920 || videoHeight > 1920` → 记录一个 note（用 item.error 字段改用途？或加 `item.warning`）；继续
  - 探测失败 → FAIL "无法读取视频（格式不支持或文件损坏）"
- [ ] **T-73** ffmpeg load 失败 → UI 顶部 banner 红色 + 重试；不阻塞纯图队列
- [ ] **T-74** FileRow 进度条在 0 → 100% 平滑更新；编码完成后切换到 done 的缩略图 + 体积

**验收**：拖入 15s 视频立即红色失败；拖入 4K/10s 视频成功转换（降到 1080p）；断网刷新后拖视频看到"加载失败 + 重试"。

## Phase 6.5 收尾

- [ ] **T-75** 更新 CLAUDE.md：iteration 表加 003、commit 轨迹、当前状态
- [ ] **T-76** 更新 README.md：功能清单加"视频转 animated WebP"；技术栈加 ffmpeg.wasm；Roadmap 标 Phase 3 完成
- [ ] **T-77** `npm run build:pages` 硬门验证：
  - 首屏 JS+CSS gzip ≤ **100 KB**（硬门未变）
  - `ffmpeg-core-*.wasm` 作为独立 chunk 存在；主 bundle 不含 ffmpeg 字节
- [ ] **T-78** `git push` → Pages 自动部署 → 线上抽测一次完整视频流程

**验收**：线上 https://seanlee111.github.io/cwebp/ 能走通拖视频 → 下载动图全流程；首屏体积未涨破预算。

---

## 待决策

Phase 3 决策已在 plan.md §9 裁决，本表未列遗留问题。若实现中遇到新决策点（如"MEMFS 首次 OOM 后是否自动重建 FFmpeg 实例"），在当下 commit message 里记录并引用本 tasks.md。
