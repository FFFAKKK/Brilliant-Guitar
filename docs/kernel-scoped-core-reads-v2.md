# 候选 Core 按需读取 V2 · Rust 基础层

2026-09-13：完成 Rust 内部的候选数据读取能力。执行器可以在一次回调中读取
指定音符、事件、声音线、谱表、分部、小节、Core 文档、元数据及对象归属，
数据来自这次回调对应的 Rust 候选状态。读取失败不能被执行器吞掉后继续提交。

**后续 R2a 已接通显式启用的 Node 数据交互；Wasm 插件接入仍未完成。**
下面的 R1 原始验证记录保留；R2a 合同和证据见本文新增章节。
现有 V1 guest 仍接收完整 Core 文档。新 Native 产物复核中，参考 guest 在
16、64 小节各成功编辑 6/6 次，256 小节仍失败 6/6 次；独立重放的准备输入
为 211,794 字节，仍报 `wasm.execution-failed:FuelExhausted`。
本轮没有解决这个容量缺口，也没有提高原有执行预算。

## 分步范围

| 步骤 | 状态 | 验收边界 |
|---|---|---|
| R1：Rust 候选读取服务 | 本轮完成 | 精确候选来源、按对象返回、读取配额、失败整次拒绝、迁移与历史验证 |
| R2a：Node 数据交互与操作账户 | 已实现，见下文验证记录 | 显式版本参数、同步数据往返、无可留存读取句柄、操作累计限额 |
| R2b：Wasm 插件接入 | 待实现 | 贡献者绑定、guest 续执行／请求合同、旧 V1 兼容与减少完整 Core 输入 |
| R3：实际插件容量验证 | 待实现 | 256 小节真实 Wasm 读写与独立校验、跨插件候选可见性、回滚与历史、资源滥用测试 |

R1 不减少当前宿主已构造的完整候选投影，不提供范围切片、依赖自动调度或增量
语义校验。查询服务不会调用旧 TS Core 校验，也不会从已提交快照冒充候选状态。

## Rust 接口与生命周期

`brilliant-extension-protocol` 增加私有宿主接口 `ContributionCoreReadV2` 及
`ContributionExecutorV2::execute_with_core_reads`；session crate 转导出这两个接口。
默认方法仍调用原有 `execute(request)`，因此现有执行器和旧 Node 回调合同不变。
没有新增 Cargo feature、依赖、宿主 crate 或 TS/Node 公开导出。

读取能力以可变借用传入单次同步回调，借用的文档由 Rust 生成。
调用者不能提交替代文档或候选编号，也不能借此写入状态、查询历史或读取扩展块。
同一事务的 prepare、transform、assess 可能共用一个 `documentVersion`，
却对应不同数据，因此各自创建独立作用域，绝不按版本号复用候选索引。
独立迁移没有会话版本，回复使用 `null`，不伪造版本 0。

Node/Wasm 接入时不能把这个借用直接保存在可被 JS 留存的函数中。
适配必须证明同步回调结束后读取失效、旧句柄不能读取后续候选、重入不能换源，
并对整次创建／编辑／历史操作／迁移累计记账。R2a 已为 Node 实现数据交互与账户；
guest 侧仍需验证完整适配，单回调限制不能替代这些条件。

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

以下均为**单次 Rust 聚合宿主回调**的私有限制，后续 R2a Node 路径也受其约束：

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
R2a 已增加下述独立 Rust 操作账户；未来 guest 使用读取时，其输入输出仍必须
同时计入 Wasm 传输账户，不能通过反复重建作用域刷新总额度。

## R2a：Node 数据交互与操作累计账户

后续切片新增显式选择参数：

```typescript
addon.createIntegratedKernelSessionV2(requestBytes, hostCallback, 2);
addon.migrateKernelExtensionV2(requestBytes, hostCallback, 2);
```

第三个参数省略时保持原有路径；支持版本只为数值 `2`，其他数值在运行宿主回调前拒绝。
这个可选参数是私有 Native API 的新增合同，导出名字和数量不变；
旧二参数 SDK／Wasm 适配继续兼容，但不自动获得读取能力。
旧二进制可能忽略额外参数，因此新的适配必须以实际交换成功进行能力验证，
不能以函数存在或第三参数未抛错作为版本协商成功的证据。

流程始终在一个 Rust 回调的同步借用内：

1. Node 收到既有 JSON 候选请求。
2. 宿主可返回字节前缀 `BGCR2Q`、一个零字节和一份精确的查询 JSON。
3. Rust 用当前作用域读取，并再次调用同一个固定宿主回调，传入前缀 `BGCR2R`、
   一个零字节和读取回复 JSON。
4. 宿主可继续返回查询，或返回既有最终 JSON 结果。返回普通结果即结束这个作用域。

前缀不是 JSON 文本，不会与合法的既有成功／失败回复冲突。回复帧不能作为查询帧，
也不能作为会话操作执行。没有向 JS 导出读取函数、候选编号或指针；JS 保存回复字节
只能保存旧数据，不能在回调结束后用它调用 Rust 读取旧候选。
宿主自行管理数据续执行状态，遇到拒绝或异常时应丢弃这份状态；
Rust 不保存也不恢复宿主的 JS 生成器。新的候选请求必须开始新的交互。

Rust 在复制查询到自有缓冲区之前，直接对 Node 回复中的查询切片进行 4 KiB 检查。
查询失败立即结束交换，不再给宿主一次以“成功”覆盖失败的机会。
回调抛错、无效终止回复和会话重入仍使用既有拒绝边界。
这不是直接对不可信插件开放的 JS API；固定宿主及其协议适配仍属于可信计算范围。

每次 Runtime 创建、操作或独立迁移建立一个线程内共享读取账户：

| 整次操作的项目 | 上限 |
|---|---:|
| 查询次数 | 4,096 |
| 成功回复累计字节，含读取封套 | 32 MiB |
| 新建候选索引的累计遍历计数 | 1,048,576 |

同一线程内同步嵌套进入其他组合会话会继承账户；每个候选仍有独立数据和索引。
读取错误或额度耗尽持续到最外层操作退出，捕获内层读取异常不能清空账户。另一线程及下一次独立操作
使用独立账户；作用域析构处理正常返回和 unwind。
这不建立跨会话原子事务，也不承诺回滚之前已在其他会话完成的独立修改。

累计字节上限参与流式 writer 的事前限制；索引每次遍历也先计费，避免只限制
查询次数而允许反复重建大型索引。元数据不建索引。既有单回调限制同时有效。
此账户独立于既有 Wasm fuel／调用／传输账户，二者均未放宽。
仍未涵盖宿主 JSON 解析、完整候选投影、全部中间复制、峰值内存或 JS 执行时长。

本轮新增 3 项 Rust 账户测试和 7 项真实 Node 交互测试全部通过。
最终 Rust 全量 **567 项通过／1 项忽略**，Node/Native **857 项通过／2 项跳过**；
严格 Clippy、fmt、Rust 1.88 全目标／全功能及 TS 构建通过。
新 V2 独立验证 7 个旅程步骤及 6 次候选读取；新 Wasm 产物用于全量回归。
常规 V2 文件保持原样，新 V2 暂存于 `target/core-read-host-v2/`。
验证记录：`docs/evidence/kernel-core-read-host-2026-09-13.json`。
Node 验证使用实际 256 小节／1024 音符负载，读取最后音符并修改、撤销重做，
读取回复少于 512 字节；**执行者仍是测试宿主，不是实际 Wasm guest**。
因此 R2b 与 R3 仍是开放任务，不能用这个结果关闭此前的 guest 燃料耗尽问题。

## 已验证与复现

以下是 R1 基础层原始记录；当前 R2a 的更高测试总数见上节及对应证据。

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
接下来应完成 R2b、R3，再继续收口 Rust 插件调度、长期资源稳定性、平台性能和发布资格。
