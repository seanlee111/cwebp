# Tasks — Phase 6: Chroma-Key for Sequence Composition

> 编号延续 005（T-96..T-106）。Phase 6 从 **T-107** 起。

## Phase 9.0 数据模型

- [ ] **T-107** `src/core/queue.ts`：
  - `FileItem.sequenceChromaKey?: boolean`
  - `ADD_SEQUENCE` action 增加 `chromaKey: boolean`
  - reducer 写入 item

## Phase 9.1 算法与 encoder

- [ ] **T-108** `src/core/videoEncoder.ts`：
  - 内部 helper `applyChromaKey(data, key, tol)` 和 `extractKeyColor(file)`
  - `VideoEncodeOptions` 扩展 or 单独 `SequenceEncodeOptions extends VideoEncodeOptions { chromaKey?: boolean }`
  - `preprocessFrameToPng` 多一个参数 `chromaKey: RGB | null`
  - `encodeSequenceToWebP` 在进入循环前读 key color（如需），传给 preprocess
- [ ] **T-109** `src/core/encoder.ts`：`encodeSequence` 签名同步允许 `chromaKey` 透传

## Phase 9.2 UI

- [ ] **T-110** `src/components/SequenceActions.tsx`：
  - 新 checkbox "扣掉左上角背景色"（默认未勾），放在合成按钮左侧
  - `useLocalStorage<boolean>('cwebp.sequence.chromaKey', false)`
  - `onCompose(files, { chromaKey })` 签名扩展
  - Tooltip 说明"请把背景色放在左上角 (0,0)"
- [ ] **T-111** `src/App.tsx`：
  - `handleComposeSequence` 接收 `opts` 参数 → dispatch 加 chromaKey
  - processor sequence 分支读 `item.sequenceChromaKey` 传给 `encodeSequence`

## Phase 9.3 收尾

- [ ] **T-112** typecheck + build 硬门（首屏仍 ≤ 100 KB gzip）
- [ ] **T-113** CLAUDE.md（iteration 行 006 + commit 轨迹）+ README（功能清单更新）
- [ ] **T-114** commit + push → Pages 自动部署 → 抽测完整流程

**验收**：线上 https://seanlee111.github.io/cwebp/ 能跑通"3 张白底 PNG → 勾选扣色 → 合成 → 下载"完整流程，Chrome 透明网格下白底被完全扣除。

---

## 已决策（见 plan.md §8）

- key color: 第一帧 `(0,0)` 一像素
- 容差: Chebyshev max，±10（固定，不做滑块）
- 所有帧共用此 key color
- checkbox 持久化
- 抠色属性一次性写入 sequence item，不随后续 checkbox 变更
