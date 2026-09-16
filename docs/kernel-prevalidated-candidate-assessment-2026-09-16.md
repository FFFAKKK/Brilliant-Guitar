# Candidate 语义证明复用于 Integrated 分类

日期：2026-09-16。

## 问题

结构化 Core 命令和混合 Core/module Batch 进入 Candidate 路径后，Runtime 在
生成不可变提交计划前已经完成完整 Core 语义验证。Integrated Engine 随后为了
生成 K1 功能分类，又通过 Foundation 对同一最终文档执行一次完整语义遍历。
第二次遍历不会增加安全性，却会对大文档重复读取全部语义依赖。

## 实现边界

Foundation 新增两个名称明确的内部支持入口：一个生成有效文档的完整 K1
分类，一个只统计有效文档的分页摘要。它们保持原分类规则、诊断顺序和容量
边界，但要求调用方已经建立完整 Core 语义有效性。

Integrated Engine 只在以下两种已经持有 Candidate finalization 结果的路径使用：

- `PreparedMutationV1::Candidate` 的结构化 Core 提交；
- `CandidateExecution::finish` 成功后的混合 Core/module Batch。

以下路径继续执行原来的完整语义校验：

- typed Core 和独立模块编辑；
- undo/redo 与其他历史预览；
- 初始文档 admission 和 migration；
- 仅有分类缓存、但没有本次 Candidate 证明的路径；
- 公开 Core report page 读取。

插件验证、插件分类、availability、响应预算、提交前预留、历史和事件行为均未
改变。Candidate 语义失败仍在生成提交计划之前终止，不会进入预验证分类。

## 验证

- Runtime 测试计数证明：普通模块编辑仍执行 Engine 语义扫描；随后成功的
  Candidate 混合 Batch 不再增加第二次 Engine 语义扫描。
- Foundation 直接比较完整评估与预验证分类，确认有效但 K1 unsupported 的
  文档得到完全相同的结果。
- 6,401 条冻结诊断的完整 summary 与预验证 summary 数量一致。
- Rust workspace all-features：608 通过、1 忽略、0 失败。
- 严格 Clippy、Rust 1.88 MSRV 全目标全功能检查通过。
- Core V1、Integrated V2、Wasm V1 三套 Node 原生产物重建成功。
- 完整 Node/Native/Wasm：894 通过、2 项环境门控跳过、0 失败。

## 性能证据

使用未修改的 `profile-native-paged-batch.mjs`、25,600 事件代表性冻结文档、
同一 guest 和三个交替顺序的全新进程。旧、新 addon 的 submit-batch 结果为：

| 轮次 | 旧版本 | 新版本 |
| --- | ---: | ---: |
| 1 | 1,067.54 ms | 865.20 ms |
| 2 | 1,022.59 ms | 864.83 ms |
| 3 | 1,055.49 ms | 857.52 ms |
| 中位数 | 1,055.49 ms | 864.83 ms |

提交中位数下降约 18.1%。旧、新峰值 RSS 中位数分别为 444,481,536 与
443,957,248 字节，本轮不宣称稳定内存改善。undo/redo 中位数分别约为
804.68/811.07 ms 与 688.92/694.41 ms，符合未修改路径的运行波动。

原始证据保存在
`docs/evidence/prevalidated-candidate-assessment-comparison-2026-09-16.json`，
包含每轮操作耗时、RSS、addon/guest/脚本哈希、夹具计数和诊断限制。

这些数据不是 p50/p95/p99 商业资格。当前代表性混合 Batch 仍接近 865 ms，
下一性能重点仍是减少 Candidate 自身的完整语义依赖工作、缩小最终投影与插件
读取成本，并建立真实业务插件和桌面交互的正式延迟预算。
