# Spec — Phase 4: Bigger Files + Off-Main-Thread Image Encoding

> WHAT & WHY。HOW 见 [plan.md](plan.md)，tasks 见 [tasks.md](tasks.md)。Constitution 延用 `../001-mvp/constitution.md`。

## 1. 问题陈述

MVP / Phase 2 / Phase 3 把两道保守的硬门钉在代码里：

| 门 | 当前值 | 本 Phase 目标 |
|---|---|---|
| 单文件大小（图 + 视频共用） | 50 MB | 图 **200 MB**，视频 **500 MB**（按 kind 分开） |
| 视频时长 | 10 s | **30 s** |

这两个值写的时候故意保守，避免浏览器崩。运行几 phase 后发现：

- **50 MB 挡住了大部分合法视频用例**：手机录屏 / 屏幕录制动辄 80–150 MB，常见的 5–15 s 1080p 片段超限。
- **10 s 视频时长**和 500 MB 文件上限组合起来后已经不是瓶颈，但 30 s 能覆盖演示动图 / 教程片段这一类合理场景。
- 浏览器实际能处理的上限（Chrome ~4 GB tab memory，ffmpeg.wasm 单线程 MEMFS 实测 ~1.5 GB）远高于 50 MB。

同时放宽后会暴露另一个问题：**静态图 WASM lossless 编码在大图上会卡住主线程 1–5 秒**。视频本来就走 ffmpeg worker 不卡，但静态图没 worker 化。大图 UI 冻结是糟糕体验。

**本 Phase 解决两件事**：
1. 放宽两道硬门 + 加大文件 UX 警告（预估耗时、明确提示）
2. 静态图编码搬到 Web Worker，大图不再卡主线程

## 2. 用户故事

### US-4.1 放宽单文件上限

> 作为用户，我拖入一段 120 MB 的 10s 屏幕录制 MP4，之前显示"超过 50 MB"，现在能正常编码输出 animated WebP。

**验收**：
- 图文件 ≤ 200 MB 能入队并尝试转换（是否成功取决于实际内存）
- 视频文件 ≤ 500 MB 能入队并尝试转换
- 超过对应上限时错误文案精确："图片超过 200 MB 上限" / "视频超过 500 MB 上限"
- Constitution / README / spec 里曾经写的 "50 MB" 全部同步更新或标注

### US-4.2 放宽视频时长上限

> 作为用户，我拖入 25 s 视频不再立即失败，能等 ffmpeg 编完。

**验收**：
- ≤ 30 s 视频通过时长门（仍可能因内存失败）
- > 30 s 视频明确失败"超过 30 秒上限"，不触发编码避免无效耗时
- 时长常量集中一处（App.tsx 或 spec-driven 的某个配置）

### US-4.3 大文件 UX 警告

> 作为用户，拖入 300 MB 视频时我看到"这个文件较大，编码可能需要 3–5 分钟"的明确提示，不是盲等。

**验收**：
- 拖入后若总体尺寸（单文件或当次批量）超过软阈值（图 50 MB 或视频 100 MB），顶部出现淡黄色 banner 提示
- FileRow 在视频文件 > 100 MB 或视频时长 > 20 s 时，名字旁显示一个 ⚠ 图标 + tooltip
- 预估耗时基于"视频：大约 (fileSizeMB × 3) 秒"的粗略公式，文案标明是估值

### US-4.4 静态图编码不再卡主线程

> 作为用户，对一张 150 MB 的 PNG 进行 WASM lossless 编码时，浏览器 UI 依然能拖入新图、拖动滑块、滚动页面——编码在后台 worker 跑。

**验收**：
- 编码期间主线程 JS 占用率低（DevTools Performance 抓 5s：主线程 Long Task < 100 ms 次数为 0）
- Worker 加载失败（或浏览器不支持 OffscreenCanvas）时，回退到主线程路径，用户看不到破碎的 UI
- WASM load state 仍然能在 QualityControl 里正确显示（idle / loading / ready / failed）
- canvas 模式和 wasm 模式都在 worker 里跑
- 视频路径不变，依旧在 ffmpeg 自己的 worker 里

## 3. 范围外

- **视频 trim / crop**：Phase 3.1 任务，本 Phase 不做
- **多文件并发**：本 Phase 只做"单任务串行 + 不卡主线程"。并发（2–4 worker pool）另立 phase
- **多线程 ffmpeg.wasm**：不做，需要 COOP/COEP headers，GitHub Pages 不支持
- **改编码算法**：Canvas 仍走 toBlob，WASM 仍走 jsquash；不引第四种编码器
- **流式/分段编码**：500 MB 单视频一次性喂给 ffmpeg。如果内存不够就由浏览器报错，我们显示失败而不是主动分段

## 4. 非功能需求

| 维度 | 要求 |
|---|---|
| 首屏体积 | **仍 ≤ 100 KB gzip 硬门**（worker chunk 独立） |
| Worker chunk | ≤ 20 KB gzip（thin wrapper，编码器核心另算） |
| WASM jsquash chunk | 保持 Phase 2 的 ~270 KB gzip 总量级，不因 worker 化翻倍 |
| 兼容 fallback | OffscreenCanvas 不可用时平滑回退主线程，不 crash |
| 大文件编码延迟 | 200 MB PNG WASM lossless 不对主线程产生 > 100 ms Long Task |
| Constitution | P1 不变（零网络请求）；P2 不变（零安装） |

## 5. 成功判定

同时满足：

1. 150 MB 屏幕录制 MP4 / 15 s 能完整跑通并下载 animated WebP。
2. 35 s 视频被当场拒绝，错误文案正确。
3. 一张 100 MB PNG 在 WASM lossless 模式下编码时，同时拖动质量滑块无感卡顿（DevTools Perf 验证）。
4. 浏览器不支持 OffscreenCanvas（或禁用 Worker）时，应用不白屏，退回主线程编码继续可用。
5. 首屏 JS+CSS gzip ≤ 100 KB 预算**仍然成立**（Phase 2/3 通过的 88–91 KB 为基线）。
6. README / CLAUDE / 所有 spec 里"50 MB"的旧值全部同步。

## 6. 开放问题（plan.md 裁决）

| 问题 | 候选 | 备注 |
|---|---|---|
| 上限拆分的存储方式 | 两个常量 / 按 kind 查表 | plan §2 |
| Worker 和主线程共用一套 encoder 代码 | 抽公共层 / 各写一份 | plan §3 |
| WASM 在 worker 里独立加载 vs 主线程预加载后传递 | 独立 / 传 | plan §4 |
| 大文件软阈值的具体数值 | 图 50 MB / 视频 100 MB | 见 US-4.3 |
| OffscreenCanvas 不支持时的降级路径 | 保持当前代码可 DOM 跑 / 跳出错误 | plan §6 |
