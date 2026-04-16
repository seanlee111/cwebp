# cwebp · 本地图片转 WebP

零安装、不上传的 **PNG / JPEG 批量转 WebP** 工具。图像处理完全在浏览器本地完成，文件字节不离开用户设备。

## 快速开始

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:5173/](http://localhost:5173/)。

## 打包 / 部署

```bash
npm run build
```

产物在 `dist/`。三种用法：

1. **本地直开** — 双击 `dist/index.html` 即可在浏览器使用（Vite 配置 `base: './'` 保证 `file://` 可用）
2. **静态托管** — 上传整个 `dist/` 到 GitHub Pages / Vercel / Netlify / Cloudflare Pages
3. **嵌入容器** — 嵌入任何静态 web 服务器（nginx / Caddy / python -m http.server 均可）

## 功能

- 拖放 / 多选 PNG、JPEG 文件
- 批量串行转换，单文件失败不阻塞其他文件
- **双编码模式**：
  - **真无损（WASM，默认）** — `@jsquash/webp` + libwebp `-lossless`，像素级保真（含透明通道）
  - **高速（Canvas）** — 浏览器原生 `toBlob`，lossy，质量 0–100 可调
- WASM 走动态 import + `requestIdleCallback` 后台预热，不占首屏预算
- WASM 加载失败时 UI 有明确降级按钮（"改用 Canvas" / "重试"）
- 原始 → 输出体积对比与节省百分比
- 单文件下载 / 全部打包 ZIP
- 键盘可达；响应式到移动端
- 启动 feature-detect，不支持 WebP 编码的浏览器显示明确提示
- 单文件 > 50 MB 直接标记失败（避免浏览器 OOM）

## 隐私声明

整个应用运行时**不发起任何网络请求**。可在 DevTools Network 面板自证：完整转换 + 下载一次流程后，Network 面板只应看到静态资源加载（`/src/*.tsx` 或 `/assets/*`），不应看到任何图片数据的出站请求。

核心转换使用浏览器内置的 `HTMLCanvasElement.toBlob('image/webp', quality)`，底层是 Chromium / WebKit / Gecko 自带的 libwebp，**没有任何第三方编码服务**。

## 项目文档

本项目采用 Spec-Driven Development。

- [CLAUDE.md](./CLAUDE.md) — 总体方案与最新状态
- [specs/001-mvp/constitution.md](./specs/001-mvp/constitution.md) — 不可变项目原则
- [specs/001-mvp/spec.md](./specs/001-mvp/spec.md) — 产品规格（WHAT & WHY）
- [specs/001-mvp/plan.md](./specs/001-mvp/plan.md) — 技术方案（HOW）
- [specs/001-mvp/tasks.md](./specs/001-mvp/tasks.md) — 任务分解清单

## 技术栈

- **Vite 6** + React 18 + TypeScript 5 (strict 模式，含 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes`)
- **Tailwind CSS 4** via `@tailwindcss/vite`
- **JSZip** — ZIP 打包（STORE 模式，WebP 已压缩，跳过 deflate 省 CPU）
- **lucide-react** — 图标
- **@jsquash/webp** (Squoosh 团队) — WASM 版 libwebp，动态 import 拆独立 chunk

生产构建首屏 **88.65 KB gzip**（HTML + CSS + JS 一次性加载）。WASM 编码器 chunk（enc ~115 KB + enc_simd ~128 KB + dec ~49 KB + 入口 ~16 KB，gzip 后）仅在进入 WASM 模式时加载。

## 目录结构

```
cwebp/
├── CLAUDE.md                    总体方案
├── README.md                    本文件
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig{,.app,.node}.json
├── specs/001-mvp/              Spec-Driven 产出
└── src/
    ├── App.tsx                  顶层容器，串联 DropZone / Queue / QualityControl / BulkActions
    ├── main.tsx                 React 入口 + dev-only window.__convertToWebP
    ├── index.css                Tailwind 入口
    ├── components/
    │   ├── DropZone.tsx         拖放区 + 点击选择
    │   ├── FileRow.tsx          单个文件的缩略图/状态/下载
    │   ├── FileQueue.tsx        队列渲染
    │   ├── QualityControl.tsx   质量滑块 + 近无损
    │   └── BulkActions.tsx      全部下载 ZIP
    ├── core/
    │   ├── encoder.ts            策略分发（canvas / wasm）+ 公共导出
    │   ├── canvasEncoder.ts      Canvas toBlob 路径（lossy）
    │   ├── wasmEncoder.ts        @jsquash/webp 路径（lossless）+ 懒加载
    │   ├── errors.ts             共享 ConversionError
    │   ├── queue.ts              useReducer 状态机
    │   └── zip.ts                JSZip 封装
    ├── hooks/
    │   └── useLocalStorage.ts   持久化设置
    └── utils/
        ├── fileSize.ts          字节格式化
        └── id.ts                uuid
```

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 启动 Vite dev server（HMR） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 预览 build 产物 |
| `npm run typecheck` | 严格 TypeScript 检查 |

## 浏览器支持

- Chrome / Edge / Opera ≥ 88
- Firefox ≥ 89
- Safari ≥ 14（2020-09）

低于此的浏览器会在启动时看到"浏览器不支持 WebP 编码"的提示页。

## Roadmap

- ✅ Phase 2: `@jsquash/webp` 真正的 lossless WebP
- ⏳ Phase 3: Web Worker 并行编码
- ⏳ Phase 4: Tauri 桌面版（可输出到原目录）
- ⏳ Phase 5: AVIF 输出支持（可选）
