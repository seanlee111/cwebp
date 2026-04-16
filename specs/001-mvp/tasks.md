# Tasks — cwebp MVP 任务分解

> 每个 task 都是可独立完成、可验证的最小单元。按顺序推进。

## Phase 4.0 脚手架

- [ ] **T-01** 初始化 Vite 项目：`npm create vite@latest . -- --template react-ts`
- [ ] **T-02** 装依赖：`react@18 react-dom@18 jszip lucide-react`；`-D tailwindcss@4 @tailwindcss/vite typescript`
- [ ] **T-03** 配置 Tailwind（`tailwind.config.ts` + `src/index.css` 引入）
- [ ] **T-04** 配 `tsconfig.json` 启用 `strict: true`、`noUncheckedIndexedAccess: true`
- [ ] **T-05** 加 `.gitignore`，初始化 git（`git init`）

**验收**：`npm run dev` 能启动，看到 Tailwind 生效的 hello world。

## Phase 4.1 转换核心（不带 UI，可单测）

- [ ] **T-06** 写 `src/core/converter.ts`：`convertToWebP(file, opts)` 纯函数
- [ ] **T-07** 写 `src/utils/fileSize.ts`：字节格式化
- [ ] **T-08** 写 `src/utils/id.ts`：uuid 包装（用 `crypto.randomUUID`）
- [ ] **T-09** 手动在浏览器 DevTools Console 验证：给定一个 `<input type="file">`，能输出 WebP blob

**验收**：Console 里跑 `await convertToWebP(file, {quality: 80, lossless: false})` 返回 Blob，`URL.createObjectURL(blob)` 打开能看到正常 WebP 图。

## Phase 4.2 最小 UI（单文件路径 US-1）

- [ ] **T-10** 写 `DropZone` 组件，支持拖放与点击选择（多选 `accept="image/png,image/jpeg"`）
- [ ] **T-11** 写 `src/core/queue.ts` useReducer 状态机（状态类型定义在 plan.md §5）
- [ ] **T-12** 写 `FileRow` 组件：缩略图（ObjectURL）、文件名、原/新体积、百分比、下载按钮
- [ ] **T-13** 写 `FileQueue` 容器，订阅 reducer，遍历渲染
- [ ] **T-14** 串成 `App.tsx`，完成"拖一张 PNG → 看到转换结果 → 点击下载"路径

**验收**：US-1 可完整走通。

## Phase 4.3 批量 + 质量控制（US-2 + US-3）

- [ ] **T-15** 拖放处理多文件：`e.dataTransfer.files` 全部入队
- [ ] **T-16** 写 `QualityControl`：滑块 0–100 + 无损 toggle
- [ ] **T-17** 用 `useDeferredValue` + 300ms debounce 触发全量重编码
- [ ] **T-18** 写 `useLocalStorage`，持久化 quality 和 lossless
- [ ] **T-19** 写 `src/core/zip.ts`：封装 jszip，收集所有 done 的 blob 打包
- [ ] **T-20** 写 `BulkActions` 组件：`全部下载 ZIP` 按钮

**验收**：US-2、US-3 走通；质量改变后所有文件自动重编码并刷新体积。

## Phase 4.4 边界与失败处理（US-4 + US-5）

- [ ] **T-21** 无损模式 UI（勾选时禁用 quality 滑块并提示）
- [ ] **T-22** 在 converter 中 try/catch，失败文件状态置 `failed` + 错误文案
- [ ] **T-23** FileRow 失败态视觉（红色边框 + 错误 tooltip）
- [ ] **T-24** 启动时 feature-detect：构造一个 1×1 canvas 调 `toBlob('image/webp')`，失败则全屏提示升级浏览器
- [ ] **T-25** 单文件大小上限 50 MB，超限直接 fail 并提示

**验收**：US-4、US-5 走通；故意拖入 `.txt` 文件、损坏 PNG，行为符合预期。

## Phase 4.5 视觉打磨

- [ ] **T-26** 顶部标题 + 卖点文案（"本地处理，不上传"）
- [ ] **T-27** 空态插画（lucide 的 ImageIcon + 提示文字即可）
- [ ] **T-28** 加载中状态动画（微 spinner 在 FileRow）
- [ ] **T-29** 响应式：移动端表格变卡片
- [ ] **T-30** 键盘可达（tab 顺序、enter 触发下载）

**验收**：Chrome + Safari + iPhone Safari 各打开一次，体验没有明显缺陷。

## Phase 4.6 收尾

- [ ] **T-31** README.md 写上怎么跑、怎么打包
- [ ] **T-32** `npm run build` 产物手工打开确认可用（`dist/index.html` 直接 file:// 打开）
- [ ] **T-33** DevTools Network 面板抓一次完整会话，确认无外发请求（Constitution P1 验收）
- [ ] **T-34** 跑一遍 [CLAUDE.md 的 6 条成功判定](../../CLAUDE.md#mvp-成功判定验收标准)

**验收**：所有 MVP 成功判定满足；可部署到 GitHub Pages / Vercel。

---

## 待用户决策的问题

开工前请确认：

1. **是否直接按此方案进入 Phase 4 实现**？还是要改动 spec.md / plan.md？
2. **仓库是否要初始化 git 并推到 GitHub**？
3. **是否要我在 Phase 4.6 后直接部署到 Vercel**？（需授权）

用户确认后，Claude 会按 T-01 起逐项推进，每完成一个 Phase（不是每 task）汇报一次。
