# S2 扩展与组合 Session 功能完成计划

本文件把 `kernel-commercial-completion.md` 的 S2.1–2.4 转成可实施、可验收的功能切片。它是实施计划，不是完成声明，不增加审批阶段，也不以 Native 默认切换或性能优化代替功能闭环。现有 S1 的 Core admission、存储历史和 opaque extension 保留是复用基础，不能据此宣称版本化扩展执行已经实现。

2026-09-12 边界确认：本轮目标是微内核基础编辑和安全插件组合，不向 Core 扩充技巧、反复、弦品等具体业务语义。领域插件负责其语义与关系维护，内核提供统一事务、校验参与、身份、权限和历史机制。已有公开合同保持兼容；只有实际消费者证明现有接口不足时才设计增量合同，不以“多级插件”为由预建复杂平台。采用单主代理、有明确停止点的功能切片，普通检查先依靠本地工具。

## 当前事实与兼容基线

- TS 的实际合同集中在 `src/core-kernel/module-sdk/{contracts,definitions}.ts`、`registry/{integrated-contracts,domain-catalog,domain-catalog-codec,domain-availability,gateway}.ts`、`commands/integrated-runtime.ts` 和 `migration/{contracts,migrate-kernel-extension}.ts`。
- `DomainContributionReadViewV1` 包含 document/version、Core 文档和 compatible extensions；准备回调返回 no-op、rejected 或非空 effect requests。现有请求仅包含 Core written-pitch replacement 和 module-owned extension effect。transform 返回 remove、replace 或 rejected。不能凭计划扩充成任意模块直接写 Core 的接口。
- TS SDK 已有捕获、编译品牌、回调绑定、能力检查、模块 issue 校验和资源上限。Rust 已有严格 requirement、Host Catalog、Inventory/cache、availability 与实际 Store header 读取。元数据投影本身不携带回调；独立 V2 Native 桥已绑定真实 SDK 执行器并接通固定 assembly 的 integrated session、独立 Core/模块命令及混合 Batch。可移植 WASM 执行产物仍未实现。
- 特别注意 Rust 的 `protocolVersion` 与 TS 的 `requirementVersion` 不同，Rust 的 `required_for_write: bool` 也不是 TS 类型层面的字面量 `true`。内部结构不得直接序列化冒充既有公开 wire；应显式映射并做真实输入/输出差分。
- Core runtime 的 `transaction.rs`、`overlay.rs`、`candidate/extensions.rs`、`candidate/journal/combined.rs`、`runtime/admission.rs` 和 `history.rs` 已提供最终准备、一次 adoption、扩展值/顺序恢复，以及 Core/模块候选混合历史。现有 module effects、完整模块校验及固定 assembly/session 已接通；声明读取的依赖优化、迁移与层级关系消费者继续按剩余切片推进，不能建立第二个拥有可变文档的扩展执行器。

冻结条件继续适用：`brilliant-score-1`、28 个 Core commands、应用 51 个 runtime exports、CVN-2 SDK 的 8 个 runtime / 34 个 type exports 及其九个 ABI fields。新私有 Rust 实现通过现有 facade/SDK 行为接线；新增版本号、WASM 内部 ABI 或内部结构不能悄悄修改这些公开集合。Native 内部接线与公开导出合同分开验证。

## 七个 crate 内的归属

以下是建议的内部责任划分；新文件名是实施定位，不表示对应接口已经存在。

| crate | S2 职责与具体落点 | 不承担的职责 |
| --- | --- | --- |
| `brilliant-core-types` | 复用 lossless 文本、稳定身份和精确数值 | 不持有 catalog、回调或 session |
| `brilliant-score-foundation` | 复用 Core 语义规则与地址；提供模块声明所引用的 Core 事实 | 不执行模块代码、不决定安装状态 |
| `brilliant-extension-protocol` | 扩充 `contracts.rs`，按需分出私有 catalog/requirements/rules/executor 合同；版本、effect/issue/read 声明、捕获后产物描述 | 不接触 Store 写入，不成为第二个命令总线 |
| `brilliant-kernel-contracts` | 在现有 codec/result 模式中映射既有 integrated 输入、failure、availability、migration report；保留 UTF-16 与 opaque JSON | 不在 decode 阶段执行模块或做最终语义判断 |
| `brilliant-kernel-runtime` | 在 transaction/overlay/adoption/history 上增加 effect 准备与最终模块 assessment；声明读取的依赖调度和 stored inverse/forward | 不依靠重跑模块回调实现 undo，不暴露可变 Store |
| `brilliant-kernel-session` | 在 `session.rs` 邻近模块组织 catalog/inventory assembly、gateway capability、availability、迁移入口适配和 session 投影；绑定执行服务 | 不复制 Core transaction owner、不另建历史栈 |
| `brilliant-kernel-node` | 现有 facade 边界的严格捕获、错误映射、执行产物传递和事件桥接 | 不隐藏 JS 回调失败，不自行提交效果 |

保持现有七 crate 的依赖方向；执行器依赖选择需要核对 MSRV、打包和实际限制能力，但不因此新建第八个业务 crate。可先在已有 crate 内以私有 trait 隔离执行服务，具体引擎不渗入文档或历史类型。

## 最小功能覆盖矩阵与四个切片

每片交付都包含实际入口、最终状态及失败零变化的证据。正常、拒绝、no-op 必须分开断言；涉及写入时同时比较文档、indices、version、history/dirty、availability 与事件，不能只比较返回 status。

| 切片 | 功能与入口 | 最小可验收闭环 |
| --- | --- | --- |
| S2.1 Catalog / Inventory / availability | 对齐 TS `compileOfficialModuleCatalog` 所在 SDK 编译流程、`resolveKernelIntegratedRuntimeAssembly`、`computeKernelDomainAvailability`；Rust protocol + session 私有 assembly | 同一安装集不同注册顺序产生相同 canonical 结果；重复 namespace/command/effect、非法 descriptor、显式 inventory 不匹配精确拒绝；未知 opaque block 保留；已知缺失/不兼容 block 返回准确排序 facts 与只读状态；重新创建兼容 assembly 恢复可写 |
| S2.2 统一准备、规则、gateway 和 session 提交 | 对齐 `registry/gateway.ts` 与 `commands/integrated-runtime.ts`；runtime 复用 typed/candidate 最终准备和历史 | 一个真实模块命令同批产生 Core pitch 与 extension replace/remove，最终校验一次并提交一次；后项错误整批零变化，failed index 精确；prepare no-op 不增 version/history/event；submit → undo → redo → replay 与 TS 精确一致；capability、owner、namespace 越权及回调异常按既有 failure 区分 |
| S2.3 版本化执行产物 / WASM | 实现捕获、hash、内部 ABI 校验与受限执行服务；接入 S2.2 的同一个 prepare/validate/classify/effect 通路 | 两次执行同一捕获产物与输入得到同一 requests/issues；篡改字节、版本不符、错误导入、非法结果、trap 和各资源上限有机器复现；失败发生后文档、历史和事件零变化；跨 Core/extension 的 effects 仍由 runtime 一次提交 |
| S2.4 显式迁移与第二种消费者 | 对齐 `migrateKernelExtension`；沿用 assembly、effect transformer 和最终校验服务；已有 session facade 保持原调用合同 | v1 → v2 返回 migrated，再次请求返回 not-required；错误 source/target/owner/assembly 和最终模块语义失败精确拒绝；未知 blocks/不相关 Core 值不变；至少一个 Score-owned 消费者与一个 Part-owned、读取 Core 引用的消费者共用所有机制；安装缺失/恢复、Core 删除 owner、混合历史均有完整回归 |

S2.1 可独立落地。S2.2 使用私有、可控执行适配器先证明事务合同；这不等于完成 WASM。S2.3 替换执行来源而不替换事务边界。S2.4 可以在前两片具备准备服务后并行补测试与迁移实现，最终以同一公共入口的机器差分收口。

### S2.1 的实际实施顺序

先补 `ExtensionRuntimeRequirementV1` 的数据合同与 TS wire 映射，再编译 Catalog，最后接 Inventory / availability 和固定 assembly。现有 Rust `protocolVersion` 结构保留为内部合同；新 decoder 显式读取 TS `requirementVersion`，不能通过重命名旧字段改变既有接口。注册 ID 限制为 1–128 个 ASCII 字符、合法单分隔符；schema 列表限制为 1–256 个严格递增的正 JS safe integers。数值按 JS Number 解析后的值判断，包括指数、浮点拼写与舍入；raw UTF-16 输入不可先有损转码。

Catalog 编译必须保留全局阶段顺序：manifest 与 entries 捕获 → 全部待选 contribution 捕获和绑定关联 → 模块 origin/runtime/trust/API/capability 政策 → 全局重复与聚合上限 → command descriptor、真实 binding、source/namespace → requirements 与 namespace 覆盖 → effect descriptor/binding/version parity → validate/classify slot 检查。不能逐 contribution 提前完成后续阶段而改变首个错误。

纯数据结构不能证明 SDK 品牌。后续内部 Catalog 构造必须消费宿主从真实编译结果取得的绑定；JSON 中的自称认证标志无效。固定 assembly 的身份也不是 inventory 内容哈希：同一 Catalog 实例与 canonical inventory 才复用 identity，不同 Catalog 即使数据相同也保持隔离。完成需求 decoder 只关闭本片的前置合同，不能算 Catalog、assembly 或公开 SDK 执行已完成。

## 必须照搬而不能重新解释的语义

### Inventory、availability 与只读降级

`domain-availability.ts` 在没有显式 inventory 时从 installed requirements 构建 inventory；显式输入严格捕获、namespace 唯一，并检查与已安装 contribution 的完整一致性。inventory 可以保留尚未安装 contribution 的已知 requirement。

availability 遍历文档实际存在的 extension blocks。没有 inventory requirement 的 namespace 不产生 incomplete fact，必须原样保存，不能一概归类为“缺少插件所以只读”。对于已知 requirement，schema 不兼容优先形成 `required-contribution-incompatible`；版本兼容但 contribution 缺失才是 `required-contribution-unavailable`。facts 按 TS comparator 排序并受上限约束。

零 facts 对应 writable/complete；有 facts 对应 read-only/domain-validation-incomplete 与 incomplete。`integrated-runtime.ts` 的 submit 和 history 操作都有 availability 检查；不能为了“恢复能力”擅自放行只读 session 的 undo。读、序列化和报告仍需保存 opaque 数据，不能把降级实现为丢弃扩展或自动 schema downgrade。

### 准备、校验与依赖

保留当前 TS 的 decode、能力/assembly/target 检查、callback result 校验、Core 语义、模块语义及 support 分类的实际先后；先为冲突错误输入生成 oracle，再实现各入口。语义 invalid 与 valid-but-unsupported、validation incomplete 是不同结果。不能用一个 generic unsupported 覆盖 callback contract violation 或内部错误。

声明式规则与读取声明需要从真实 validate/classify/prepare/effect 需求抽出，覆盖 extension namespace/schema、owner、Core references、字段和子序。变更闭包必须处理 Part 删除、同 raw ID 重生、扩展 owner/current anchor、路径移动和跨 extension 读取；已有 occurrence 生命期隔离不可退化为 raw ID 自动继承。调度结果与独立完整模块校验比较，不以复制调度器作为 oracle。

TS 当前回调拿到宽的 `DomainContributionReadViewV1`；它不自动构成精确读取声明。内部实现可以借用 Store/overlay 事实而避免全 Score 物化，但不能静默少给既有回调允许读取的信息。未证明声明完整时，不得声称局部验证等价。此处是功能正确性工作，后续商业性能测量单独处理。

历史应存准备后的真实效果及逆效果，不存“将来重跑 prepare 的承诺”。扩展 payload、位置与 owner 生命周期纳入同一历史条目。恢复历史后的最终 assessment 是否需执行校验服务，按既有 integrated history 合同实现；这与重跑原始命令准备回调不同。replay 的逐项成功保留和失败 index 继续遵守现有 session 合同，单个 batch 仍全有或全无。

### 迁移与版本

`migrateKernelExtension` 是输入 document + catalog + 显式 migration request 的纯结果入口，不是现有 session 中隐含的可撤销命令。保持其 `migrated` / `not-required` / `rejected` 和 report；不擅自给 session 增加 migrate operation 或新 history 行为。

现有迁移先捕获/解码并检查初始 Core 语义，再核对 catalog/contribution、目标 block 与 source/target 兼容，调用 effect decoder/transformer，要求 replace 为请求 target schema，再检查最终 Core 与模块语义。目标已经是 target version 时有 not-required 路径，也须保留其前置检查。不得只凭 version 相等提前跳过所有检查。

schemaVersion 是数据格式版本，requirement/inventory/descriptor version 是协议结构版本，command/effect 的版本是执行合同，WASM ABI 与 artifact hash 是执行产物标识；这些不能合成一个“插件版本”。降级运行表示保留数据并限制写入，不代表自动反向迁移。是否支持某次向低版本迁移由显式 source/target 和 transformer 能力决定，不按数字大小自行推断可逆。

## WASM 边界与真正未决问题

现有 S2 文字明确要求 WASM capture/hash/ABI/execution，但所核对的 TS SDK 合同仍是 JS callback 绑定，workspace 当前也没有 WASM executor 依赖。不能把现有九个公开 ABI fields 当成已定义的 WASM 内存/调用 ABI。以下问题需要在相应切片形成具体设计记录；它们不阻止先实施既有合同，也不是新审批门槛。

1. **既有 JS SDK 的兼容方式。** JS callback 如何映射到声明式规则或捕获产物，哪些功能可完整表达？纯私有 Rust fixture runner 不能算公开 SDK 已接通；强制现有消费者改写 WASM 也不符合导出冻结的自动含义。
2. **可移植执行范围。** WASM 的入口、输入/输出编码、UTF-16/JSON 数值约定、允许 imports、内存/栈/执行预算和产物 hash 算法尚需具体选定并复现。应采用无隐式时钟/随机/网络/文件依赖的确定性准备边界；这项建议需实现证据，不能由引擎宣传的 fuel 特性代替验证。
3. **assembly 生命周期。** 当前 assembly 身份绑定 catalog + inventory；运行中热换模块是否保留现有历史和 checkpoint，没有从当前合同获得一个通用热升级承诺。先实现固定 assembly 的 session 与重新创建行为，不新增热安装产品功能。
4. **迁移进入编辑历史的产品含义。** 当前纯迁移入口能完成数据迁移和重新打开。是否需要用户在同一 session 中撤销迁移、迁移后如何关联已保存身份，是额外产品语义，不能擅自新增公开操作；本计划先完整复现现有纯入口。

第二消费者应在现有 Score/Part owner 与已有 effect request 范围内选取结构不同的合成用例，避免引入新乐器产品：例如 Score-owned 配置与 Part-owned、读取 Note pitch 的数据。它们验证“同一协议、同一能力约束、同一写边界”，不以两个改名的 payload fixture 代替。

### 已选定的 SDK / Native 执行接线

独立 GPT-6 审查确认：旧五个 Native 入口仅接收 bytes，不能传递 JS 回调；RKP-4 还精确检查 addon 只有这五个导出。SDK 绑定保存在 WeakMap 中，复制 descriptor 或 Symbol 也不能还原回调。因此采用同一 Node crate 内的**版本化私有 integrated 桥与独立构建产物**，保留旧 V1 产物和五个入口不变。新桥的协议、构建方式和验证清单作为 successor 明确记录；不偷偷扩充旧 bytes 对象、借可选参数隐藏回调或伪造认证字段。公开 51/8/34/9 集合保持不变，七 crate 架构保持不变。

SDK 内部从真实 compiled catalog 的绑定查询创建可信执行适配器。`decode → prepare` 和 `decode → transform` 分别在 JS 适配器内部完成，任意 decoded JS 值不必跨 JSON 往返。Rust 内部 `ContributionExecutor` 按 prepare、validate、classify、transform 分操作；Node 实现调用上述绑定，WASM 实现调用已验证产物。两种来源只返回只读结果，由 Rust 重新校验 owner、namespace、能力、形状和资源，并经现有事务写入、最终校验和单一提交。Undo/Redo 使用已存效果，不重跑原命令 prepare/transform。

公开 `createIntegratedCommandBus` 工厂在选定 Native 后端时绑定真实品牌状态，不再创建 TS 可变文档或另一套历史；默认切换仍属于 S4。新桥必须验证回调异常、同 Session 重入拒绝、环境线程和引用释放。当前 JS 回调可读取完整 Core 文档，兼容视图必须真实提供并计入物化成本；不能冒称它已有精确读取声明或能由 Rust fuel 强制终止。WASM 的执行限额另以实际引擎测试证明，这不改变 JS SDK 的既有合同。此决定解决接线方向，不表示桥或执行器已经实现。

## 收口证据

2026-09-12：S2.2a 的真实 SDK 插件 Native 联合事务已实施，具体路径、对照测试、构建和未完成边界记录在 [kernel-native-integrated-v2.md](kernel-native-integrated-v2.md)。这关闭了“只捕获 metadata、尚无 callback 执行”的前置缺口，但 S2.2 的独立 Core/Batch 组合入口和完整 candidate 历史仍待接通；S2.3/S2.4 未因此完成。

后续 S2.2b 已复用原有 27 个 Core 叶处理器与纯 Core Batch admission，接通 V2 的独立 Core 编辑及 candidate 历史的模块 assessment。跨域 Batch 的模块子项接入仍待完成，不能把纯 Core Batch 的通过解释为跨域 Batch 已完成。新增完整命令形状语料差分和候选历史拒绝/重试回归；验证结果与成本限制见上述实施记录。

跨域 Batch 继续推进：实际 occurrence 图的独立 SDK 视图已实现并用于 V2 历史预览，中间视图能保留空/重复 raw ID 和临时无效字段。下一项是 candidate 扩展效果的不可变日志与 owner 生命周期绑定，随后接通模块子项及共享预算。不能为了复用最终强类型投影而提前拒绝 TS 合同允许由后项修复的中间状态。

每片保存真实 TS 生成的输入、完整结果和状态序列，由 Rust/实际 Native 入口消费；legacy 差异保留原结果并解释，不改 oracle 以迁就新实现。覆盖注册排列、合法/非法/缺失版本、callback 异常/畸形输出、资源耗尽、跨域 batch、no-op、undo/redo、分支历史、逐项 replay 和迁移幂等。

最终 S2 完成要求四片功能矩阵全部落地，公开导出/SDK 字段冻结检查通过，Core 与模块完整校验的独立等价证据成立，并证明只有一个可变文档与历史所有者。未知数据无损、所有拒绝零变化和真实第二消费者必须走公开 session/gateway 路径。引擎默认切换、性能资格和后续清理仍按主计划 S3–S5 处理；本文件没有将这些事项标为已完成。

扩展日志前置已由 `457d90e` 实现：不可变 before/after、实际 owner 生命期、扩展全序、Core Part 删除与净零历史均有真实 Store 提交/撤销重做测试。全 feature Rust workspace 525 通过、1 忽略；严格 Clippy、fmt、Rust 1.88 与新增悬空 owner 断言通过。生产混合 Batch 子项及共享计量尚未接通；详情和 fresh/inherited 验证边界见 `kernel-native-integrated-v2.md` 与对应 evidence JSON。

混合 Batch 生产接线已由 `3559713` 完成：真实 SDK 子项与 Core 共用 occurrence candidate、资源账户、最终提交和已存历史；中间无效视图、净零有效序列、Part owner 死亡/重生、no-op、精确失败索引均有真实 Native/TS 对照。新增 504 个插件前缀包裹的 Core 输入，最新完整回归为 Rust 528 通过、1 忽略及 TS/Native 791 通过、2 跳过。旧 V1 耗时检查首跑失败及未修改复跑通过一并记录于 `evidence/kernel-native-mixed-batch-2026-09-12.json`。前面“尚未接通混合 Batch”的分片段落属于历史；当前剩余重点为 WASM、显式迁移、层级关系消费者，以及声明读取/资源/平台资格。
