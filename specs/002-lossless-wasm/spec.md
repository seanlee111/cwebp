# Spec — Phase 2: True Lossless WebP via WASM

> WHAT & WHY。HOW 见 [plan.md](plan.md)，tasks 见 [tasks.md](tasks.md)。Constitution 延用 `../001-mvp/constitution.md`。

## 1. 问题陈述

MVP 的"近无损"模式实现方式是 `canvas.toBlob('image/webp', quality=1.0)`。这**不是**真正的 lossless WebP 编码：浏览器的 libwebp 绑定在 `toBlob` 接口下只暴露 lossy 路径，quality=1 只是 lossy 的最高质量档位，并非 `libwebp -lossless` 标志。

**可观察的后果**：
- 透明 PNG 的 alpha 通道有精度损失（某些边缘像素从 α=254 变成 α=255 或 α=0）
- RGB 通道在极端色彩过渡区可能偏差 1–2 个量级
- 以"像素级保真"为目标的设计资源（logo、UI 切图）不满足要求

**为什么现在做**：MVP 已交付，设计师是明确的目标用户画像（见 `../001-mvp/spec.md §2`），这是他们的核心诉求。

## 2. 用户故事

### US-2.1 真正的无损编码

> 作为设计师，把带透明通道的 PNG logo 转成 WebP 后，用 `magick compare -metric AE orig.png out.webp` 得出 **0 个差异像素**。

**验收**：
- UI 提供独立的"真无损（WASM）"开关，和原"近无损（Canvas）"区分。
- 开启 WASM 无损后转换的 WebP，与原 PNG 逐像素对比（RGB + Alpha）MSE = 0 / AE = 0。
- 状态 UI 清楚标识当前正在使用 WASM 编码器（与 Canvas 路径不混淆）。

### US-2.2 懒加载体积守护

> 作为普通用户，我只想压缩几张 JPEG，打开应用首屏加载不应包含 WASM 编码器。只有勾选真无损时才拉取。

**验收**：
- 默认首屏 JS + CSS gzip 体积 **≤ 100 KB**（不含 WASM chunk）。
- 勾选 WASM 无损 → 触发动态 import，UI 显示"加载编码器中…"提示。
- WASM chunk 加载在良好网络下 **< 2s** 完成。
- 加载过一次后 Service Worker / HTTP 缓存复用，不重复拉取。

### US-2.3 加载失败的明确降级

> 作为离线 / 网络受限的用户，如果 WASM 加载失败，我看到红色错误而不是转换静默失败。

**验收**：
- 模拟网络断开后开启 WASM 无损 → 显示红色提示"真无损编码器加载失败"。
- 提供一个明确的按钮"继续使用近无损（Canvas）"，点击后切回 Canvas 路径。
- 错误不影响已转换好的文件（done 状态保留）。

## 3. 范围外（明确排除）

- **不暴露 libwebp 细粒度参数**（method `-m 0..6`、filter、sharp-yuv 等）。UI 越简单越好。
- **不对 JPEG/PNG 解码走 WASM**。解码仍用 `createImageBitmap`（浏览器原生，硬件加速）。WASM 只替换**编码**阶段。
- **不移除 Canvas 路径**。Canvas 快且轻量，lossy 场景保留它是对的。
- **不做 AVIF**。AVIF 放在 Phase 5（`specs/005-avif/`，如果届时还有价值的话）。
- **不支持旧浏览器**（< WebAssembly 或 < dynamic import）。目标浏览器都支持。

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 性能（编码） | WASM 无损 ≤ 3× 同图 Canvas 编码耗时 |
| 首屏体积 | 默认 JS+CSS ≤ 100 KB gzip（WASM 独立 chunk） |
| WASM chunk | 加载体积 ≤ 1 MB |
| 降级 | WASM 加载失败时 UI 有显式 fallback，不静默 |
| 兼容 | 与 MVP 的所有浏览器兼容无变化 |
| Constitution | P1（隐私）不动摇：WASM 仍在浏览器本地运行，不调用远端 |

## 5. 成功判定

同时满足：

1. 下载一张经典 [Lena 透明 PNG](https://en.wikipedia.org/wiki/Lenna)（或任何 alpha 非平凡的 PNG），用 WASM 无损转换后，`magick compare -metric AE` 输出 `0`。
2. Chrome DevTools Network 面板：**首次开 UI 不拉 WASM**；勾无损瞬间出现一个 `.wasm` 或 `-webp.js` chunk 请求。
3. 断网场景下开启 WASM 无损，出现明确降级按钮，点按钮能继续用 Canvas 转换。
4. lighthouse performance 分数不因 Phase 2 下跌（首屏体积未变）。

## 6. 开放问题（进入 plan.md 前裁决）

| 问题 | 候选 | 备注 |
|---|---|---|
| WASM 库选择 | @jsquash/webp / wasm-webp / libwebp-wasm | 见 plan.md §2 |
| 是否用 Web Worker | 放在 Phase 3 | 本 Phase 主线程跑 WASM；必要时 UI 显示 loader |
| UI 位置 | 在现有 QualityControl 里替换 / 新增一个 "无损模式" 组件 | 倾向替换原 lossless toggle |
