# Tasks — Phase 2: True Lossless WASM

> 编号延续 001-mvp（T-01..T-34）。Phase 2 从 **T-35** 起。

## Phase 5.0 调研（去风险）

- [ ] **T-35** `npm view @jsquash/webp` 确认最新版本 + 最后发布时间；如果 > 18 个月无更新，走 plan §1 的 fallback（wasm-webp 或自编译）
- [ ] **T-36** 在一个临时 HTML page 用 UNPKG CDN 单独跑 `@jsquash/webp` 一次，确认 `encode(imageData, { lossless: 1 })` 可正常得到 WebP bytes

**验收**：确定 T-37 开始装的包版本号；有信心能跑通。

## Phase 5.1 策略分发 + Canvas 迁移

- [ ] **T-37** `npm install @jsquash/webp` 锁版本；查看 chunk 产物体积估算
- [ ] **T-38** 新建 `src/core/canvasEncoder.ts`，把 `converter.ts` 中现有 Canvas 路径整体迁入，导出 `encodeCanvas(file, { quality })`
- [ ] **T-39** 新建 `src/core/encoder.ts`：统一入口 `encode(file, { mode: 'canvas' | 'wasm', quality })`，先只实现 canvas 分支（wasm 分支占位抛错）
- [ ] **T-40** `App.tsx`、`QualityControl.tsx` 改用 `encoder.encode`；`ConvertOptions` 替换为新类型；行为与 Phase 4.3 完全一致
- [ ] **T-41** `converter.ts` 标记 `@deprecated` 或整个删除（视是否还有外部引用）；`main.tsx` 的 dev-only window 绑定迁到 `encode`

**验收**：所有现有功能在 canvas 模式下跑通；`npm run build` 体积与 Phase 4.6 相同（82 KB gzip，误差 ±2 KB）。

## Phase 5.2 WASM 编码器

- [ ] **T-42** 新建 `src/core/wasmEncoder.ts`：
  - `loadWasm()` — 动态 import，Promise 共享
  - `encodeLossless(bitmap)` — 走 OffscreenCanvas + `@jsquash/webp.encode({lossless:1})`
  - OffscreenCanvas feature-detect，降级到普通 canvas
- [ ] **T-43** `encoder.ts` 的 wasm 分支接通 `wasmEncoder`
- [ ] **T-44** 确认 `npm run build` 输出里有独立 `.wasm` / `.js` chunk（不在主 bundle 里）

**验收**：手工打开 dev，DevTools Network → 勾选 WASM 无损 → 独立 chunk 触发；转换透明 PNG 后 Blob 可下载。

## Phase 5.3 UI 升级

- [ ] **T-45** `QualityControl.tsx` 重做布局：
  - 第一行：单选"高速（Canvas）" / "真无损（WASM）"
  - 第二行：质量滑块（wasm 模式下禁用）
  - `wasmState` 显示：loading spinner / ready / failed + 降级按钮
- [ ] **T-46** `useLocalStorage` 持久化 `mode`（key `cwebp.mode`）
- [ ] **T-47** 失败降级：wasm 加载失败时 UI 显示红色 + 按钮"继续使用 Canvas"，点击后 mode 切回 canvas

**验收**：所有 spec US-2.1/2.2/2.3 验收点通过浏览器手工测试。

## Phase 5.4 质量保证

- [ ] **T-48** 准备 5 张测试图：
  - 2 张透明 PNG（细线 + 软边 logo）
  - 2 张 JPEG（风景 + 人像）
  - 1 张纯色（验证 lossless 极小输出）
- [ ] **T-49** 手工跑一遍 canvas 和 wasm 两个模式对比：像素级 diff（magick compare）
- [ ] **T-50** 截屏 before/after，放入 spec.md §5 成功判定章节作为证据

**验收**：
- wasm 模式透明 PNG `magick compare -metric AE` = 0
- canvas 模式相同图 AE > 0（用以证明差异真实存在）

## Phase 5.5 收尾

- [ ] **T-51** 更新 CLAUDE.md：Phase 2 commit 轨迹、最新状态
- [ ] **T-52** 更新 README.md："功能"和"Roadmap"相应条目
- [ ] **T-53** 本 phase 做一次 `npm run build:pages`，确认 Pages 部署的 base 正确
- [ ] **T-54** 推送到 GitHub，等 Pages 自动部署

---

## 待决策

开工前确认：

1. 是否允许 Phase 2 首屏超 100 KB（如果 wasm chunk splitting 不如预期）？
2. 是否要在 Phase 2 就把 `converter.ts` 整个删掉，还是保留兼容 re-export 一个版本？
3. 无损模式默认选中 or 默认高速？（倾向默认高速，因为 80% 用户的场景是 lossy）
