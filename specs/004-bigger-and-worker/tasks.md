# Tasks — Phase 4: Bigger Files + Off-Main-Thread Image Encoding

> 编号延续 003（T-55..T-78）。Phase 4 从 **T-79** 起。

## Phase 7.0 放宽上限（低风险先做）

- [ ] **T-79** `src/core/queue.ts`：
  - `MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024`
  - `MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024`
  - `sizeCapFor(kind)` helper
  - ADD_FILES 按 kind 查表
  - RECODE_ALL 的 "size-capped failed" 判断同步改
- [ ] **T-80** `src/App.tsx`：`MAX_VIDEO_DURATION_SEC = 30`
- [ ] **T-81** `src/components/DropZone.tsx`：文案改"支持 30 秒内短视频"，隐含 500 MB
- [ ] **T-82** Constitution / README / 老 spec 里 "50 MB" 字样全量搜索替换（或标注旧值作为历史）

**验收**：拖 120 MB 视频能入队；拖 250 MB 图片能入队；拖 35 s 视频仍失败；typecheck 过。

## Phase 7.1 Worker-safe 化 encoder

- [ ] **T-83** `src/core/canvasEncoder.ts`：重写为 OffscreenCanvas + `canvas.convertToBlob` 版；移除 `document.createElement`
- [ ] **T-84** `src/core/wasmEncoder.ts`：移除主线程 canvas fallback，统一 OffscreenCanvas（Phase 2 已经 OffscreenCanvas，清理兜底代码即可）
- [ ] **T-85** 暂时在主线程直接调用这两个新版本，typecheck + 浏览器自测基本功能仍可用

**验收**：静态图转换在主线程跑通（和 Phase 2 行为一致），typecheck 过。

## Phase 7.2 Worker + Client

- [ ] **T-86** `src/core/encoder.worker.ts`：
  - import 上面两个 worker-safe 模块
  - onmessage 路由 encode/preloadWasm
  - subscribe wasmState → postMessage
- [ ] **T-87** `src/core/encoderClient.ts`：
  - feature-detect canUseWorker
  - 按 canUseWorker 决定 worker 路径 or 主线程直调
  - Promise map by id
  - 对外暴露 `encode(file, opts)`、`subscribeWasmState(fn)`、`preloadWasm()`
- [ ] **T-88** `src/core/encoder.ts`：`encode` / `subscribeWasmState` / `loadWasm` / `getWasmState` 改为走 encoderClient；接口表面不变
- [ ] **T-89** 确认 main.tsx dev exposure、App.tsx 里现有 subscribeWasmState 使用仍然工作

**验收**：静态图 WASM lossless 对 50 MB PNG：DevTools Performance 抓 3s，主线程 Long Task 不存在；UI 拖滑块不卡。

## Phase 7.3 UX 增强

- [ ] **T-90** `src/utils/fileSize.ts`（或新建 `estimate.ts`）：
  - `estimateEncodeSeconds(item): number`
  - 按 kind + mode + size 给出粗略估值
- [ ] **T-91** `src/components/FileRow.tsx`：
  - 大文件标记（size > 软阈值 或 duration > 20s） 时文件名旁加 `AlertTriangle`
  - tooltip: "文件较大（X MB），预计 Y 秒"
- [ ] **T-92** `src/App.tsx`：顶部增加"有大文件"淡黄色 banner，与 ffmpeg loading banner 共存

**验收**：拖 120 MB 视频 → 顶部 banner 出现 + FileRow 有 ⚠ tooltip。

## Phase 7.4 收尾

- [ ] **T-93** `npm run build` 硬门：
  - 首屏 JS+CSS gzip ≤ 100 KB
  - 产出 `encoder.worker-*.js` 独立 chunk（gzip 应 < 20 KB）
  - jsquash 三件套 chunk 仍然独立存在
- [ ] **T-94** 更新 CLAUDE.md（iteration 行 004 + commit 轨迹）+ README（功能清单 / 技术栈变动 / Roadmap 打勾）
- [ ] **T-95** commit + push → Pages 自动部署 → 抽测线上是否 Worker 能正常工作

**验收**：线上 https://seanlee111.github.io/cwebp/ 能跑完整 Phase 4 流程，首屏预算未破。

---

## 已决策（见 plan.md §9）

- 上限按 kind 拆分
- canvasEncoder/wasmEncoder 重写为 worker-safe，两边共用
- WASM 在 worker 里独立加载
- OffscreenCanvas 不支持时主线程直调降级
- 软阈值：图 50 MB / 视频 100 MB / 时长 20 s
