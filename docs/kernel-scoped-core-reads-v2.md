# 候选 Core 按需读取 V2 · Rust 基础层

2026-09-13：完成 Rust 内部的候选数据读取能力。执行器可以在一次回调中读取
指定音符、事件、声音线、谱表、分部、小节、Core 文档、元数据及对象归属，
数据来自这次回调对应的 Rust 候选状态。读取失败不能被执行器吞掉后继续提交。

**目前只有 Rust 执行器接口接通；Node/Wasm 尚未获得这个能力。**
现有 V1 guest 仍接收完整 Core 文档。新 Native 产物复核中，参考 guest 在
16、64 小节各成功编辑 6/6 次，256 小节仍失败 6/6 次；独立重放的准备输入
为 211,794 字节，仍报 `wasm.execution-failed:FuelExhausted`。
本轮没有解决这个容量缺口，也没有提高原有执行预算。

## 分步范围

| 步骤 | 状态 | 验收边界 |
|---|---|---|
| R1：Rust 候选读取服务 | 本轮完成 | 精确候选来源、按对象返回、读取配额、失败整次拒绝、迁移与历史验证 |
| R2：版本化 Node/Wasm 接入 | 待实现 | 显式协商、旧 V1 兼容、安全生命周期、按操作累计查询记账、贡献者绑定 |
| R3：实际插件容量验证 | 待实现 | 256 小节真实 Wasm 读写与独立校验、跨插件候选可见性、回滚与历史、资源滥用测试 |

R1 不减少当前宿主已构造的完整候选投影，不提供范围切片、依赖自动调度或增量
语义校验。查询服务不会调用旧 TS Core 校验，也不会从已提交快照冒充候选状态。

## Rust 接口与生命周期

`brilliant-extension-protocol` 增加私有宿主接口 `ContributionCoreReadV2` 及
`ContributionExecutorV2::execute_with_core_reads`；session crate 转导出这两个接口。
默认方法仍调用原有 `execute(request)`，因此现有执行器和 Node 回调合同不变。
没有新增 Cargo feature、依赖、宿主 crate 或 TS/Node 公开导出。

读取能力以可变借用传入单次同步回调，借用的文档由 Rust 生成。
调用者不能提交替代文档或候选编号，也不能借此写入状态、查询历史或读取扩展块。
同一事务的 prepare、transform、assess 可能共用一个 `documentVersion`，
却对应不同数据，因此各自创建独立作用域，绝不按版本号复用候选索引。
独立迁移没有会话版本，回复使用 `null`，不伪造版本 0。

Node/Wasm 接入时不能把这个借用直接保存在可被 JS 留存的函数中。
适配必须证明同步回调结束后读取失效、旧句柄不能读取后续候选、重入不能换源，
并对整次创建／编辑／历史操作／迁移累计记账。当前每回调限制不能替代这些条件。

## 私有读取合同

请求是 lossless JSON 字节；以下三种形状为精确形状，拒绝额外字段和不支持的版本：

```json
{"readVersion":2,"selectorId":"core.selector.score-metadata"}
```

```json
{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}
```

```json
{"readVersion":2,"selectorId":"core.selector.score-entity-ownership","address":{"kind":"note","noteId":"note-1"}}
```

地址使用已有七类稳定地址：`document/documentId`、`measure/measureId`、
`part/partId`、`staff/staffId`、`voice/voiceId`、`event/eventId`、`note/noteId`。
名字与应用查询接口相同不意味着这是已发布的 SDK V2。

回复包含 `readVersion`、`documentId`、`documentVersion` 和 `result`。
成功时 `result` 为 `{"ok":true,"value":...}`：实体值是 `{kind,value}`，
元数据直接返回元数据，归属直接返回已有的对象归属字段。
文档实体只包含 `schemaVersion`、`id`、`metadata`、`measureDefinitions`、`parts`；
顶层 `extensions` 不进入读取能力。lossless 编码保留 UTF-16、负零和普通用户键。

实体不存在是正常结果：
`{"ok":false,"failure":{"code":"read.entity-not-found"}}`，同一回调可继续读取。
非法请求、不可用来源、无效来源或配额耗尽则返回 Rust 读取错误并锁定失败状态。
执行器即使捕获错误并返回合法成功回复，Runtime 仍拒绝该回调。
命令保留既有内部错误族；迁移准备保留贡献者归属错误，
迁移汇总校验保留 `migration.internal-error`，不伪造单个贡献者身份。

## 当前资源边界

以下均为**单次 Rust 聚合宿主回调**的私有限制，尚未对 Node/Wasm 开放：

| 项目 | 上限 |
|---|---:|
| 单次查询输入 | 4 KiB |
| 查询次数 | 128 |
| 单次完整回复，含封套 | 1 MiB |
| 成功回复累计字节 | 8 MiB |
| 索引实体 | 131,072 |
| 索引遍历计数 | 262,144 |

元数据读取不建索引；实体查询首次按候选建立索引，同一回调后续查询复用。
索引借用原节点，仅保存身份键和归属信息；构建超限或同类重复身份时不发布部分索引。
它不是一次完整 Core 语义校验；全局身份、覆盖等规则仍由既有最终 Core 校验负责。
回复使用有界 writer，先检查剩余额度再追加字节，不先复制完整实体图再判断长度。

计数上限不等于进程内存或总 CPU 上限。首次实体查询仍有遍历成本，
归属和 ID 会占用索引内存；完整候选投影、TS 调度和其他宿主复制尚未在这里计量。
原有 Wasm 单调用 1,000 万 fuel、操作累计 1 亿 fuel／4096 次调用／128 MiB 传输不变。
未来读取请求与回复必须进入适配层的操作账户，不能通过反复重建作用域刷新总额度。

## 已验证与复现

- 8 项 Runtime 测试覆盖精确形状、实际字段与独立归属断言、缺失实体、lossless
  数据、输入／输出／累计配额、重复身份、索引上限及同版本不同候选。
- 合法的 256 小节 Rust 乐谱可读取最后一个实际音符，回复少于 512 字节，值逐字段
  一致。该测试先通过 `KernelRuntime::create`；它不是先前 1024 音符 Wasm 负载，
  也没有测量查询时间、峰值内存或端到端编辑性能。
- 3 项 Session 测试覆盖完整已记录旅程、同版本准备阶段读到 C 而变换阶段读到 D、
  吞掉查询耗尽后的有效 Batch 前缀整体回滚、下一次操作恢复，以及迁移两个阶段
  的无版本读取和吞错拒绝。原有成功旅程回复保持精确一致。
- 最终 Rust 全量 564 项通过、1 项既有忽略；Node/Native 全量 850 项通过、
  2 项既有跳过。严格 Clippy、Rust 1.88 全目标／全功能检查、fmt、TS 构建通过。
- 新 V2 与 Wasm release 产物均构建。Wasm 产物用于全量测试；常规 V2 保留原文件，
  新 V2 位于 `target/scoped-core-reads-v2/`，单独验证了 7 项旅程步骤、迁移及
  7 个导出不变。Core V1 产物和 guest 字节沿用，不能声称本轮重新构建了它们。

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime --all-features core_reads --locked --offline
cargo +1.97.1 test -p brilliant-kernel-session --all-features integrated::read_tests --locked --offline
cargo +1.97.1 test --workspace --all-features --locked --offline
cargo +1.97.1 clippy --workspace --all-targets --all-features --locked --offline -- -D warnings
cargo +1.88.0 check --workspace --all-targets --all-features --locked --offline
```

Native 构建和 Node 测试前提见 README；构建、替换 addon 与使用它的测试必须顺序执行。
本机详细日志及容量复核位于 `.local-evidence/scoped-core-reads-2026-09-13/`；
构件身份、测试结果与未完成项见
[验证记录](evidence/kernel-scoped-core-reads-2026-09-13.json)。

基础功能仍粗估 **85–90%**，商业准备仍约 **65%**，不是剩余工期比例。
接下来应完成 R2、R3，再继续收口 Rust 插件调度、长期资源稳定性、平台性能和发布资格。
