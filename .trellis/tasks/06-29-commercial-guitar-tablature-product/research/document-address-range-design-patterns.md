# 文档地址与范围模型研究状态

> **状态：需要重新研究。** 旧研究已归档至
> `.trellis/archive/core-kernel/2026-06-29-retired-document-address-range-research.md`。

K1-2 地址语言必须从 `brilliant-score-1` 的真实稳定实体出发：measure、part、staff、voice、event、note。它还必须分别回答：

- Core 通用命令如何定位实体。
- 诊断 path 与命令 target 是否使用同一抽象，还是保持不同职责。
- range 如何跨 measure/voice 表达而不依赖数组 index。
- Guitar Domain 如何引用 Core Note，同时避免把 string/fret/technique 变成 Core 地址 kind。
- 未知 ExtensionBlock 如何在命令、copy/paste、undo/redo 和 replay 中保持不变。

在 K1-1 review 与 K1-2 独立任务批准前，不定义 `ScoreAddress`、`ScorePoint`、`ScoreRange` 或公开 target union。
