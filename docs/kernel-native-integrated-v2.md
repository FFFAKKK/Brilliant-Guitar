# SDK 插件命令的 Native 闭环（S2.2a）

本片实现真实官方 SDK 插件命令同时修改 Core 音高和扩展数据，经 Rust 的一个事务、一个 Store 和一条历史提交。它是功能完成计划中的一个已实施切片，不代表整个 S2 完成或达到商业级发布标准。默认引擎未切换。

## 实际执行路径

1. 私有宿主选择 `installNativeIntegratedBackendV2(addon)` 后，现有 `CommandBus.createIntegrated` 工厂使用真实 compiled catalog 与 inventory resolver。SDK WeakMap 品牌认证和 gateway 能力、assembly 身份检查继续有效；返回的 restore 函数恢复之前的工厂选择，已创建的 session 保持原装配。
2. 真实 SDK decoder/preparer/transformer 绑定留在宿主适配器。任意 decoded JS 中间值不跨 JSON。回调只收到冻结的 Core 文档和兼容扩展视图，不持有可写 Store。
3. `createIntegratedKernelSessionV2` 返回一个绑定 session 与固定执行器的 Node 函数。函数的 N-API 生命周期管理 Rust session 和 callback reference；`RefCell` 在进入回调前取得独占借用，重入不能取得第二个可变引用。它没有可替换 executor 的后续参数，也不能把 V1 handle 混入这条入口。
4. Rust 独立检查描述符来源、安装状态、命名空间、owner、版本、请求形状、引用存在性和效果数量。请求依次写入现有 typed overlay，后续 transformer 的完整视图反映前面已准备的音高与扩展修改。JS adapter 校验模块 issues 与 classifier 结果，Rust Foundation 及现有 adoption 路径仍校验 Core。
5. 所有准备与模块 assessment 成功后才调用现有统一提交。模块声明的 affected addresses 在 Rust 校验、去重、排序后进入同一历史和事件。撤销重做先预览已存 inverse/forward 并重新 assessment，成功后才移动原历史游标；不重跑原 prepare/transform。

Core 命令 ID 的原有编码不变。内部历史与事件增加模块 ID 表示，V2 facade 按已固定的 catalog 补上现有公开事件合同要求的 module source。没有建立 TS 命令状态或第二套历史。

## 已覆盖的行为

`test/core-kernel/rust-migration/integrated-native-journey.test.ts` 从公开工厂及真实 SDK 编译结果进入实际 addon，覆盖：

- Score-owned、Part-owned 两种消费者：混合提交、完整读回、事件、no-op、撤销重做和回调次数与 TS 对照。
- 六类回调的异常和畸形结果、最终模块语义拒绝、非法 schema、篡改 namespace/owner/affected 后整批零变化。
- 后项 transformer 读取前项音高修改；扩展删除、撤销恢复原位置；显式 prepare no-op。
- 真正 gateway 的权限隔离和不同 catalog 实例的 assembly 不匹配。
- callback 和订阅回调中的重入写/保存标记拒绝；异步订阅异常不影响已提交事务。
- 保存标记、历史分叉、redo 重新校验拒绝不移动游标；公开 replay 保留此前成功项并准确返回失败下标。
- 已知缺失或不兼容扩展的只读状态与 TS 一致；未知扩展保留，包括 UTF-16 非配对代理字符及 opaque payload 中的 `-0`。

`-0` 修复限于显式新传输路径：新增 JS 数据编码和 Rust `decode_js_value_json` / `FiniteNumber::from_js_number` 保留其符号，原有构造和 decoder 继续归一化，冻结的 V1 编码不变。Core 的 SafeInteger 仍使用原来的数值规范；不能据此宣称所有 JS 数字表现的完整差分已经验收。

## 构建与可恢复性

沿用七个 crate。Node crate 的 `integrated-bridge-v2` feature 构建独立文件 `target/integrated-v2/brilliant_kernel_node.node`；默认构建的五入口产物仍放在 `target/rkp-1-node/brilliant_kernel_node.node`。README 给出按顺序构建、复制两份文件的命令。新版本产物包含原有五入口和一个 V2 创建入口，旧产物的导出集合未扩充。

撤回本片不会改变默认 TS 引擎。停止选择私有 V2 工厂即可停止新建 V2 session；已有 session 的 assembly 固定，不支持热替换。工作仅在内核分支，主线、UI 和仓库归档不参与此变更。

实现提交为 `5d5b6eb`。本片的检查日志放在 `.local-evidence/kernel-integrated-native-2026-09-12/`，与编译缓存分开。Rust 508 项、TS/Native 782 项测试通过；定向 Native 集成用例为 14 项，fmt、严格 Clippy、Rust 1.88 检查及两个 release 产物构建通过。回归计数与两个 addon 的标识见 [evidence JSON](evidence/kernel-integrated-native-2026-09-12.json)；不是 Qualification V2。

## 剩余工作与实用限制

- 这条实验 V2 session 已接通独立 Core 命令、纯 Core Batch、domain commands 及其已存在的两种 effect request。Core 与模块命令共用同一 Store 和历史；含模块子命令的跨域 Batch 尚未接通，这是下一片的主要缺口。
- JS SDK 允许宽视图读取，当前会完整物化回调输入，并执行完整语义检查。私有 `callbackProjections` 记录这一兼容路径的视图工作；不要把 Core typed metrics 当成整个 V2 调用的成本，也不能把这些回归测试当性能资格证据。
- 私有响应在 adoption 前进行保守空间预检；实际内存压力、资源边界的完整矩阵和异常终止恢复仍需 S3 验证。
- 回调绑定和模块 issue 解析依赖真实 JS SDK 宿主，尚未实现可移植 WASM 产物、燃料/内存限制或执行超时。同步 JS 回调不能由此强制终止。
- 显式 extension migration、结构不同的插件关系维护、多级依赖消费者及商业性能资格仍未完成。应用/SDK 的 51/8/34/9 公开导出与 ABI 冻结继续适用。

## S2.2b：Core 入口和 candidate 历史

2026-09-12 的后续实现将原有 admission 的“准备”与“提交”拆开，V1 仍调用两步，V2 在两步之间加入现有 SDK 的模块 assessment 与响应空间预检。Session 注入原来的 27 个叶命令处理器；纯 Core Batch 保留原来的子项失败索引、延迟最终校验和 typed → candidate 提升。没有复制一套命令实现，也没有创建临时可变 Store。

预览 candidate 历史时，按原来的 suffix/prefix 次序解释已存操作，撤销方向保留结构封口边界，最后投影只读文档。失败不移动游标。Core Batch 即便最终文档净变化为零，只要实际执行过编辑，仍保留提交和历史；没有套用独立模块命令的净变化判断。

差分检查发现并修复了共用 overlay 投影遗漏：父级 Voices/Events 顺序未修改时，原来的提前返回会漏掉更深层的新事件或新音符。现在继续下探已存在的父节点，Rust 定向回归以及 Native 删除事件后撤销的完整 assessment 对照均覆盖此问题。

新增 Native 检查消费全部独立 command admission 语料，比较 submit、成功后的 undo/redo、完整 read 和事件；另覆盖 typed 前缀与临时空 ID 后缀组成的净零 Batch，以及该 candidate 历史在模块校验拒绝后重试。Core 编辑与模块编辑交错共用历史，Core/纯 Core Batch 的最终模块拒绝保持零变化。

这条兼容路径为 SDK 回调重新解释已准备或已存操作并完整投影文档，随后才采用原计划。它有额外 CPU/分配成本；私有回调计数及原有 Core metrics 都不代表该路径的完整工作量。此处验证功能正确性，性能计量与投影复用优化属于 S3。

实现提交 `febe3c6`：Rust 509 项通过、1 项忽略；TS/Native 全量 785 项通过、2 项跳过、0 失败。定向 Native 17 项包含 504 个输入、28 类 Core 命令形状语料。fmt、严格 Clippy、Rust 1.88 检查通过。首次全量的唯一失败是源码检查仍要求准备代码内联；更新后仍验证 prepare 内无提交，以及 prepare 后恰好一次 commit。实际事件撤销差分曾暴露的投影问题已由上述修复解决，行为基线未改。日志和产物标识见 [本片回归记录](evidence/kernel-integrated-core-2026-09-12.json)。
