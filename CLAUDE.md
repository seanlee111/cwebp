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

| 阶段 | 产出 | 状态 |
|---|---|---|
| 0. Constitution | [specs/001-mvp/constitution.md](specs/001-mvp/constitution.md) | ✅ 已写 |
| 1. Specify (WHAT) | [specs/001-mvp/spec.md](specs/001-mvp/spec.md) | ✅ 已写 |
| 2. Plan (HOW) | [specs/001-mvp/plan.md](specs/001-mvp/plan.md) | ✅ 已写 |
| 3. Tasks | [specs/001-mvp/tasks.md](specs/001-mvp/tasks.md) | ✅ 已写 |
| 4. Implement | `src/` 下的真实代码 | ⏳ 待用户确认方向后启动 |

**工作节奏**：每推进一个阶段产出后，等用户确认或提修改再进下一阶段，避免早期方向走偏后返工。

## MVP 成功判定（验收标准）

同时满足：

1. 用户拖入 10 张 PNG/JPEG（混合，共 ≤ 50 MB），**全部转换成功**生成 WebP 并可下载。
2. 质量滑块调整后，**预览缩略图 & 体积估算实时刷新**。
3. 同一张 1920×1080 的 JPEG（~500 KB），在质量 80 下输出体积应 **小于原图 85%**。
4. 透明 PNG 输出 WebP 后透明通道完整保留（肉眼抽检）。
5. 全程 **没有任何网络请求**离开浏览器（DevTools Network 面板可验证）。
6. 主流浏览器（Chrome / Edge / Safari / Firefox 最新版）均能正常工作。

## 下一步

当前阶段：**等待用户对 spec 方向的确认**。确认后即可进入 `Phase 4 Implement`：

1. `npm create vite@latest cwebp -- --template react-ts`
2. 装 Tailwind、写骨架组件
3. 按 [tasks.md](specs/001-mvp/tasks.md) 的顺序推进

---

_最后更新：2026-04-16_
