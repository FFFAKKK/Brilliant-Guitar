# 编辑事务的 Core 报告分页交付

2026-09-14，改动前基线 `a36e54a`。

## 新版交付模式

继任私有集成会话可在创建请求中显式指定 `reportDeliveryVersion: 2`。
仅 Rust 调度准备与评估的 V4 宿主接受该选项；缺省仍使用旧版完整报告，
不支持的版本或旧宿主明确拒绝，不能静默降级。

新版编辑流程仍先检查候选资源、Core 语义、功能状态、插件验证与分类，
再准备响应容量并执行唯一 Store 提交。Core 功能评估遍历所有规则，
计算完整提示总数，不创建完整 unsupported 诊断数组。
Core 语义失败仍返回受原 4,096 条上限保护的完整错误报告；
插件报告的既有数量限制没有改变。

成功提交或 no-op 的 `pipeline.assessment.core` 使用明确的新结构：

```json
{
  "reportVersion": 2,
  "profileId": "brilliant-guitar.k1",
  "status": "unsupported",
  "diagnosticCount": 6401
}
```

该结构没有 `diagnostics` 字段，不冒充旧的 `ScoreSupportV1` 完整报告。
插件评估仍位于 `pipeline.assessment.modules`。
响应同时附带 `coreReport`：

```json
{
  "reportVersion": 2,
  "documentId": "score-1",
  "documentVersion": 1,
  "profileId": "brilliant-guitar.k1"
}
```

消费方用该引用加上 `operation: "readCoreReportPage"`、`offset`、`limit`
读取明细，协议见 `docs/kernel-profile-report-pages-2026-09-14.md`。
报告针对当前已提交版本；历史版本请求拒绝，未提供永久保留的审计报告库。

## 一致性与失败边界

- 摘要来自待提交候选，引用来自实际完成后的当前版本。
  no-op 不制造新版本，报告引用仍指向原版本。
- Core 命令、混合 Batch、独立插件命令及撤销重做共用最终评估。
  独立插件的分类缓存保存完整摘要，仍先检查 Core 语义和插件验证；
  Core/Batch/历史重新分类。
- 候选失败不发布缓存；最终 Store 提交拒绝时，新版响应不暴露
  candidate pipeline 或报告引用。已提交版本的分页报告继续可读。
- 响应容量预留包含新增引用里的文档 ID；旧版上限和所有冻结输入保持不变。
- 这不是截断报告或放大原限制，而是显式协商的报告交付契约。
  原有 `CommandBus` 完整报告模式继续遵循其原始行为。

## 私有 Wasm 宿主入口

`src/native-host/wasm-core-reads.ts` 增加 `createNativeWasmPagedSessionV2`。
它捕获纯数据初始文档，使用现有目录/需求解析和安装项投影，
完整验证 Wasm 绑定并复用 V4 callback/CoreRead 调度传输。

该函数返回接受/返回 Buffer 的私有会话函数。产品宿主需要显式消费
新版摘要、引用与分页；它不是旧版 `IntegratedCommandBus` 类型的替身。
入口不选择全局默认后端，不增加 Core/SDK 公开导出，不允许 JS 插件回退。
已有 V2/V3/V4 安装函数复用抽取后的相同传输实现。

## 验证范围

- 超过 4,096 条提示时，Rust 核心编辑、no-op、Core Batch、撤销、
  重做返回完整摘要；末页条目可读取，没有为了提交而丢掉提示。
- 明确拒绝不支持的协商值和旧宿主。
- 语义失败、插件验证失败及最终拒绝响应不暴露候选报告引用，
  不消耗提交版本；已提交报告保持有效。
- Foundation 摘要与分页共用原功能规则；非法语义优先于 unsupported。
- 实际 Native/Wasm 测试使用未经修改的冻结压力文档（102,400 事件）。
  插件编辑、重复 no-op、混合插件 Batch、撤销重做对照 TS 参考，
  比较版本、历史、底层事件、完整快照编码、模块评估和 Core 提示总数，
  并将 6,401 条分页明细与参考结果逐条比较。
  旧 addon 首先以 `command.assembly-mismatch` 拒绝新协商，用于确认接线测试有效。
- Native 底层事件不包含旧 JS facade 补充的 descriptor-derived `source`；
  对照只移除这个已知展示层字段，其余事件字段保持完整比较。

最终验证：Rust 全量 600 通过、1 忽略，之后补充的插件验证失败专项
另 1 通过；Node 全量 894 通过、2 跳过、0 失败。
严格 Clippy、Rust 1.88 全目标/全功能检查、fmt 与 TS 构建/严格类型检查通过。
三种 Native 产物已重建。既有进程占用的旧 Integrated 文件经备份哈希
核对后归档到 `target/paged-editing/active-prior-integrated.node`，
没有终止原开发进程；新进程读取新产物。

新增 Native 用例先在旧产物复现协商拒绝，再在新产物完整通过。
第一次专项整例耗时约 220 秒，包含 TS 参考、Native 调用和快照比较，
不能用它代表单次内核操作。最终全量回归启用 `BG_PAGED_TRACE=1`
记录阶段时间，得到以下定位数据：

| Native 阶段 | 耗时 |
| --- | ---: |
| 单次插件编辑 | 1,435 ms |
| 重复 no-op | 702 ms |
| 单次撤销 | 1,159 ms |
| 单次重做 | 1,137 ms |
| Core＋插件混合 Batch | 3,637 ms |
| 混合 Batch 撤销 | 14,440 ms |

这是全量回归环境的单次 wall-clock 计时，未经隔离、校准或百分位采样，
仅用于定位。不同运行的整例耗时不能解释为代码性能提升。
产物哈希、冻结输入哈希、验证摘要和完整阶段记录见
`docs/evidence/paged-editing-2026-09-14.json`，明确标记 `qualification: false`。

## 商业边界与下一步

报告数量不再与新版合法编辑绑定，但全量候选投影、语义检查、
功能扫描和逐页重算仍存在。该模式尚未通过正式性能与长序列资格验收，
没有默认发布切换，也没有真实业务插件/UI 的产品验收。
原完整报告路径的压力编辑仍然会拒绝，不能把新版能力泛化到全部入口。

下一步优先隔离测量混合 Batch 撤销，区分
`CombinedHistory::project_replay` 与 `prepare_replay` 中的候选重建、
结构边界封存和最终校验开销，再推进增量校验/投影优化。
14 秒级的撤销不能当作交互产品可用；真实业务宿主的报告消费流程也仍待接入。
