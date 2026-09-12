# SDK 插件命令与混合 Batch 的 Native 闭环（S2.2）

当前实现真实官方 SDK 插件命令、独立 Core 编辑及 Core/插件混合 Batch，经 Rust 的一个事务、一个 Store 和一条历史提交；显式扩展迁移已接通，同一贡献者内两层扩展关系已有真实消费者验证，模块网关的 Batch 子项权限绕过已修复。本文后面的分片记录保留各时点的证据，当前状态以本段和最新分片为准；不代表整个 S2 完成或达到商业级发布标准。默认引擎未切换。

## 实际执行路径

1. 私有宿主选择 `installNativeIntegratedBackendV2(addon)` 后，现有 `CommandBus.createIntegrated` 工厂使用真实 compiled catalog 与 inventory resolver。SDK WeakMap 品牌认证和 gateway 能力、assembly 身份检查继续有效；返回的 restore 函数恢复之前的工厂选择，已创建的 session 保持原装配。
2. 真实 SDK decoder/preparer/transformer 绑定留在宿主适配器。任意 decoded JS 中间值不跨 JSON。回调只收到冻结的 Core 文档和兼容扩展视图，不持有可写 Store。
3. `createIntegratedKernelSessionV2` 返回一个绑定 session 与固定执行器的 Node 函数。函数的 N-API 生命周期管理 Rust session 和 callback reference；`RefCell` 在进入回调前取得独占借用，重入不能取得第二个可变引用。它没有可替换 executor 的后续参数，也不能把 V1 handle 混入这条入口。
4. Rust 独立检查描述符来源、安装状态、命名空间、owner、版本、请求形状、引用存在性和效果数量。独立模块命令使用 typed overlay，混合 Batch 使用 occurrence candidate；两者共用 SDK 准备与效果解码逻辑。后续回调的完整视图反映此前的 Core/扩展修改。JS adapter 校验模块 issues 与 classifier 结果，Rust Foundation 及现有 adoption 路径仍校验 Core。
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

沿用七个 crate。Node crate 的 `integrated-bridge-v2` feature 构建独立文件 `target/integrated-v2/brilliant_kernel_node.node`；默认构建的五入口产物仍放在 `target/rkp-1-node/brilliant_kernel_node.node`。README 给出按顺序构建、复制两份文件的命令。当前 V2 产物包含原有五入口、`createIntegratedKernelSessionV2` 和纯函数 `migrateKernelExtensionV2`，共七入口；新增迁移入口是本片明确的私有协议增量。原六入口 V2 的历史记录仍保留，V1 的五入口集合未扩充。

撤回本片不会改变默认 TS 引擎。停止选择私有 V2 工厂即可停止新建 V2 session；已有 session 的 assembly 固定，不支持热替换。工作仅在内核分支，主线、UI 和仓库归档不参与此变更。

实现提交为 `5d5b6eb`。本片的检查日志放在 `.local-evidence/kernel-integrated-native-2026-09-12/`，与编译缓存分开。Rust 508 项、TS/Native 782 项测试通过；定向 Native 集成用例为 14 项，fmt、严格 Clippy、Rust 1.88 检查及两个 release 产物构建通过。回归计数与两个 addon 的标识见 [evidence JSON](evidence/kernel-integrated-native-2026-09-12.json)；不是 Qualification V2。

## 剩余工作与实用限制

- 这条实验 V2 session 已接通独立 Core 命令、纯 Core Batch、domain commands 和跨域 Batch，支持现有两种 effect request。Core 与模块命令共用同一 Store、资源账户与历史；此处的接通仍不等于完整资源/平台资格验证。
- JS SDK 允许宽视图读取，当前会完整物化回调输入，并执行完整语义检查。私有 `callbackProjections` 记录这一兼容路径的视图工作；不要把 Core typed metrics 当成整个 V2 调用的成本，也不能把这些回归测试当性能资格证据。
- 私有响应在 adoption 前进行保守空间预检；实际内存压力、资源边界的完整矩阵和异常终止恢复仍需 S3 验证。
- 回调绑定和模块 issue 解析依赖真实 JS SDK 宿主，尚未实现可移植 WASM 产物、燃料/内存限制或执行超时。同步 JS 回调不能由此强制终止。
- 显式 extension migration 已接通；结构不同的插件关系维护、多级依赖消费者及商业性能资格仍未完成。应用/SDK 的 51/8/34/9 公开导出与 ABI 冻结继续适用。

## S2.2b：Core 入口和 candidate 历史

2026-09-12 的后续实现将原有 admission 的“准备”与“提交”拆开，V1 仍调用两步，V2 在两步之间加入现有 SDK 的模块 assessment 与响应空间预检。Session 注入原来的 27 个叶命令处理器；纯 Core Batch 保留原来的子项失败索引、延迟最终校验和 typed → candidate 提升。没有复制一套命令实现，也没有创建临时可变 Store。

预览 candidate 历史时，按原来的 suffix/prefix 次序解释已存操作，撤销方向保留结构封口边界，最后投影只读文档。失败不移动游标。Core Batch 即便最终文档净变化为零，只要实际执行过编辑，仍保留提交和历史；没有套用独立模块命令的净变化判断。

差分检查发现并修复了共用 overlay 投影遗漏：父级 Voices/Events 顺序未修改时，原来的提前返回会漏掉更深层的新事件或新音符。现在继续下探已存在的父节点，Rust 定向回归以及 Native 删除事件后撤销的完整 assessment 对照均覆盖此问题。

新增 Native 检查消费全部独立 command admission 语料，比较 submit、成功后的 undo/redo、完整 read 和事件；另覆盖 typed 前缀与临时空 ID 后缀组成的净零 Batch，以及该 candidate 历史在模块校验拒绝后重试。Core 编辑与模块编辑交错共用历史，Core/纯 Core Batch 的最终模块拒绝保持零变化。

这条兼容路径为 SDK 回调重新解释已准备或已存操作并完整投影文档，随后才采用原计划。它有额外 CPU/分配成本；私有回调计数及原有 Core metrics 都不代表该路径的完整工作量。此处验证功能正确性，性能计量与投影复用优化属于 S3。

实现提交 `febe3c6`：Rust 509 项通过、1 项忽略；TS/Native 全量 785 项通过、2 项跳过、0 失败。定向 Native 17 项包含 504 个输入、28 类 Core 命令形状语料。fmt、严格 Clippy、Rust 1.88 检查通过。首次全量的唯一失败是源码检查仍要求准备代码内联；更新后仍验证 prepare 内无提交，以及 prepare 后恰好一次 commit。实际事件撤销差分曾暴露的投影问题已由上述修复解决，行为基线未改。日志和产物标识见 [本片回归记录](evidence/kernel-integrated-core-2026-09-12.json)。

## 跨域 Batch 的候选读取前置能力

`candidate/integrated_view.rs` 直接遍历实际 occurrence 图，构造脱离事务的 SDK 文档视图。它使用每个实际节点的位置引用，而非按 raw ID 重新查找，因此临时空 ID、重复 ID、重复 measureContents 和暂时无效的音乐值仍能完整保留。泛型 ID 转换允许事务中间视图保留原始字符串，最终历史预览则使用稳定 ID 并在返回前继续通过原有 Core 最终校验。视图本身不授予提交资格。

新视图已用于 V2 candidate 历史预览，替换间接的强类型 bundle 包装投影。六项专项测试覆盖重复节点分别修改、未知 UTF-16/负零载荷、typed 前缀与 candidate 后缀叠加、Part 删除后同 ID 重建不继承扩展、每个受控集合预留点失败后禁止复用、以及可见字段损坏时整体拒绝。已有包含十余项语义错误的候选检查另增加完整视图对照，证明视图不把无效值悄悄归一化或删掉。

跨域 Batch 的插件写入尚未接通。下一步需将插件效果纳入 candidate 的同一操作日志：先补扩展新增/替换/删除的不可变历史记录和 owner 生命周期绑定，再连接模块子命令的顺序执行、affected 汇总和共享资源预算。当前 recorder 的扩展预期数据只来自 typed prefix 加已记录删除，不能直接把任意当前 candidate 数据当成可信历史；该防护必须保留。

验收仍要求同一个 Batch 中 Core 与模块交错、模块读取临时无效状态后由后项修复、非空效果序列净零时保留历史、失败返回准确子项索引且整批零变化、最终 Core/模块校验一次通过后单次提交，以及已存操作撤销重做不重跑插件 prepare/transform。上述候选读取能力是必要前置，不代表跨域 Batch 已完成。

实现 `d8b39c5`：本片新跑 runtime crate 320 项通过、1 项忽略，真实 integrated Native 17 项通过，严格 Clippy、fmt、Rust 1.88 检查与 V2 release 构建通过。上一片全量 workspace/TS 证据仍归属 `febe3c6`；本片针对私有读取路径进行了上述范围的回归，没有把旧全量计数当作新跑结果。[本片证据](evidence/kernel-candidate-sdk-view-2026-09-12.json) 保存日志和 V2 产物哈希。

## 跨域 Batch 的扩展历史前置能力

实现 `457d90e` 为 candidate 增加扩展插入、替换、删除的已存正向/逆向操作。日志保留不可变 before/after 与实际 owner 生命周期；预期载荷账本从冻结前缀和已记录效果推导，不信任任意当前候选数据。Part 删除消费对应生命期的扩展，随后相同 raw ID 重生不继承旧数据。日志大对象经 Arc 引用，避免扩大普通 Core 操作的内联尺寸。

十项专项回归覆盖全序及净零效果、真实 Store 提交和重复撤销重做、交错 Part 扩展位置、同 ID 重生、预算拒绝、每个受控预留点失败，以及未记录载荷/错误 owner 无法进入可信历史。另将两项已有悬空 owner 回归分别在新账本启用与未启用时执行，保持原断言。候选重复 Part 的歧义删除仍拒绝，已通过真实 TS Batch 确认该行为，未改行为基线。

本片新跑全 feature Rust workspace：525 通过、1 忽略、0 失败；最终 lint 标记和新增悬空断言后重跑定向测试、严格 Clippy、fmt、Rust 1.88 检查均通过。未重复 Native/TS；当前 V2 二进制仍来自 `d8b39c5`。详情见 [本片证据](evidence/kernel-candidate-extension-history-2026-09-12.json)。这关闭了历史记录前置缺口；生产混合 Batch dispatcher、真实 SDK 顺序效果与共享计量尚需接线，S2 仍未完成。此前段落中“预期只来自 typed prefix”的描述是本片前的历史状态。

## S2.2c：真实 SDK 的 Core/模块混合 Batch

实现 `3559713` 接通包含已安装模块命令的 Batch：从第一项起使用同一个 occurrence candidate，Core 子项仍调用原有处理器，模块子项与独立模块命令共用真实 SDK prepare/transform 合同。模块只产出请求；扩展写入和音高效果由 Rust 的同一 recorder 保存。中间读取使用原始 occurrence 投影，允许后项修复临时空 ID、重复 ID或音乐值；最终 Core 校验与模块 assessment 通过后才调用统一提交，整批一条历史、一次版本变化和原有 Core Batch 事件来源。

模块 segment 保留 command/module/contribution 身份及效果范围，单独计量，不伪装成 Core 命令。模块受影响地址按既有合同归一化，再与此前 Core 地址按首次出现去重；实际效果、受影响地址和逻辑字节共用事务账户，已存来源字符串也计入预算。SDK 完成一个子项的准备后才检查外层累计效果上限；无实际效果的子项不消耗 segment/历史，存在非空效果序列但最终净零的 Batch 仍提交并可撤销重做。

真实 Native 对照目前 23 项：原有 504 个独立 Core 输入仍通过，另将同一 504 个输入置于真实插件子项之后，比较 submit、完整 read、事件及重复 undo/redo。新增具体用例覆盖 Core/Score-owned/Part-owned 交错、扩展写入后 Part 删除及同 ID 重生、真实回调读取临时无效 Core 前缀、净零模块序列、全批 no-op、扩展删除位置恢复，以及各回调家族失败和最终模块拒绝的整批零变化。删除最后一个 Part 的例子按真实 TS oracle 返回最终 `semantic.part-required`，没有把它改成成功案例。三个 Rust 执行层测试补证双向共享效果上限、上限处 no-op 及来源/affected 计量；它们不替代 S3 的全资源压力矩阵。

本片最新源码重建了 V1 和 V2 两个产物。Rust 全 feature 工作区 528 通过、1 忽略；完整 TS/Native 791 通过、2 跳过、0 失败；严格 Clippy、fmt、Rust 1.88 和 TypeScript typecheck 通过。首次全量有一个旧 V1 JSON 对象解析耗时比例失败（4.008）；同一二进制单独复测通过，随后未修改的完整套件通过。首跑与复跑日志均保存，未调整冻结阈值。[本片证据](evidence/kernel-native-mixed-batch-2026-09-12.json) 记录产物哈希和全部检查。

本片关闭“生产混合 Batch 尚未接通”的功能缺口。SDK 仍读取完整投影，Core 最终准备和兼容 assessment 有额外校验/物化工作，尚无增量等价或完整性能计量承诺；不能把一个最终模块 assessment 回调解释为内部仅执行一次所有语义规则。WASM、显式迁移、层级关系消费者及平台/资源/性能资格仍待完成，S2 和商业级发布没有因此整体完成。

## S2.4a：独立扩展迁移 Native 接线

现有公开 `migrateKernelExtension(input, request, catalog)` 在显式选择支持迁移的 Native V2 后端时调用独立 `migrateKernelExtensionV2(bytes, executor)`。新增的是实验产物的私有纯函数，不是编辑 session 的 operation，也没有改变公开函数签名或 51/8/34/9 导出。旧 V1 五入口保持原状；只包装 session 入口的旧私有宿主仍可选择原有迁移实现，S4 默认切换时须选择完整产物。

JS facade 继续负责任意输入的严格捕获、既有 shape/request decoder 和报告构建；Rust 重新检查请求、初始 Core 语义、真实捕获的 catalog/effect 描述符、owner、目标 block 与来源/目标版本，并通过共用 typed transaction 准备扩展替换。SDK callback helper 仅准备 payload，Rust 复核其返回目标版本；SDK validator helper 仅执行兼容模块的既有 issue 检查，不拥有文档替换或历史。两项 helper 由原 TS 迁移实现抽出并共用，未复制一套 JS 迁移引擎作为 Native 的可变状态。

迁移保留原有顺序：shape/request → 初始语义 → assembly/owner → target → source version → target version → not-required 或 decoder/transformer → 最终 Core/模块语义。not-required 不调用插件；migrated 要求 replace 为请求版本。已安装其他兼容模块也参与最终校验；不执行 classifier，不套用编辑 session 的 availability 写锁。允许声明支持的显式降版，不隐含自动降级。

迁移返回脱离输入的结果文档，既有 session 的 Store、版本、dirty、history、checkpoint 和 events 不参与这条调用。当前实现为纯迁移创建临时 Store/typed transaction，完成资源和存储准备检查但不 adoption；这有完整物化成本，尚无性能资格承诺。现有 TS 迁移 JSON 往返会把所有负零归一化为零，该例外已在本迁移路径中复现；not-required 与正常编辑继续保留负零，UTF-16 未配对代理字符和其他 opaque 值仍保留。

新增真实 SDK Native 差分覆盖 Score/Part owner 升降版、幂等且零回调、完整报告和错误优先级、初始无效语义先于 catalog 错误、目标已是新版但来源不支持、六个 decoder/transform/validate 异常或畸形组合、最终其他插件拒绝、替换 JSON 全局函数、伪造返回 schema、私有文档形状错误、输入/既有 session 零变化及旧 backend restore 隔离。旧迁移行为测试和 23 项混合事务 Native 检查仍保留。

这关闭显式迁移接线缺口；S2.4 的真实层级关系消费者、S2.3 WASM、声明读取/增量等价，以及完整资源/平台/性能资格仍待完成。

实现 `61f28cc`：最新源码的 V1/V2 产物均已构建；Rust workspace 全 feature 528 通过、1 忽略；完整 TS/Native 799 通过、2 跳过、0 失败，包括八项新迁移 Native 测试、原四项 TS 迁移测试及 23 项组合事务 Native 测试。严格 Clippy、fmt、Rust 1.88 和 TS typecheck 通过。V2 导出集合检查明确更新为七入口，V1 五入口与公开冻结集合不变。[本片证据](evidence/kernel-native-extension-migration-2026-09-12.json) 保存最终日志和产物哈希。

## S2.4b：实际层级关系消费者与网关 Batch 权限

`a7493f8` 增加经真实公开 SDK 编译及网关调用的测试消费者：Core 音符 → Part-owned 音符索引 → Score-owned 汇总。上层读取下层刚写入的扩展，独立验证器逐字段检查 Core 引用与音高，不复用 transformer 生成预期结果。业务规则完全位于测试插件，Core 没有新增乐器或关系字段。

五项 TS/Native 对照覆盖初次建立/no-op、漏修一层和错误顺序的原子拒绝、音符删除、Part 删除及同 ID 重建、已存历史撤销重做、分支/checkpoint/replay、清除重建及缺插件只读后重新打开。历史恢复不重跑 prepare/transform；未知扩展的负零与未配对 UTF-16 保留。首次运行因测试命令名不属于声明的命名空间而被 SDK 正确拒绝，修正命令名后通过，未放宽 SDK 校验。

消费者的两个命名空间由**同一贡献者**拥有；现有 callback view 仅开放其声明且兼容的数据。因此本片证明现有协议内的两层关系，不能证明跨插件读取、自动依赖排序或精确读取声明已完成。提交修复关系的先后顺序仍由调用者负责，内核最终验证负责阻止过期关系落盘。

同一轮发现并复现了网关缺陷：`fixture.score.module` 直接调用 `fixture.part.apply` 被拒绝，包入 Core Batch 却能提交。`09fb674` 复用独立命令的模块身份/descriptor capability 检查，对所有可执行模块子项先授权，再向 bus 提交已检查的脱离输入的 Batch。拒绝时没有准备回调、事件或历史变化；可信宿主直接使用 bus 的跨模块编排继续有效。四项新增测试覆盖外模块出现在不同位置、无效 payload、同模块/Core 混合、Proxy 捕获稳定性、嵌套及畸形批量。

最终完整 TS/Native 回归 **808 通过、2 跳过、0 失败（810 项）**；定向 22 项、typecheck/build 和 diff 检查通过。本片仅修改 TS 网关与测试，未重建 Rust；复用 `61f28cc` 原生产物，其 528 通过/1 忽略是继承证据，不是本轮新跑。日志、产物哈希及边界见 [本片证据](evidence/kernel-native-layered-relationships-2026-09-12.json)。WASM、跨插件依赖合同、增量等价以及完整资源/平台/性能资格仍未完成。

## 网关输入捕获收口

`0c397fc` 修复上一片静态 Batch 授权之外的三个动态输入路径。修复前的真实调用表明，Core 叶命令可以在第二次反射时变为外模块命令；严格捕获抛错后，原对象仍会进入 bus 并在第三次反射时提交；首次解码无效、随后捕获为 Batch 的对象也可能绕过子项授权。三个复现均实际产生了外模块提交，不能用上一片的静态输入通过代替此边界证明。

网关现在仅提交完整授权的数据：Core 成功解码后使用其脱离输入的结果；否则严格捕获一次，对捕获结果重新解码并授权，包括 Batch 的全部可执行子项。无法捕获的对象（访问器、循环、反射异常或捕获预算耗尽）在网关返回 `registry.invalid-invocation`，不会重试原对象。这是有意收紧网关入口；可捕获的无效输入和直接 Host bus 的原有错误合同保持原路径。能力拒绝仍发生在读取调用者输入之前。

新增五项测试，包括三个绕过回归、504 种静态 Core 输入分别通过 Core/TS integrated/Native 网关的 **1,512 组结果及状态对照**，以及三种网关对不可捕获输入的零回调、零状态变化检查。最终定向 22 项通过；完整 TS/Native **813 通过、2 跳过、0 失败（815 项）**，build（包含 tsc）与 diff 检查通过。Rust 和两个原生产物未改动，未重复 Cargo 检查。可复核日志及哈希见 [捕获修复证据](evidence/kernel-gateway-capture-2026-09-12.json)。这不是完整安全审计或商业资格完成声明；WASM 和跨插件依赖仍是待实现能力。

## S2.3a：可选 WASM 受限执行服务

`04374dd` 在现有 session crate 内实现 `wasm-executor-v1`：固定 SHA-256 与 ABI、无宿主导入、每次回调独立实例、燃料/内存/表/栈和缓冲区限制，复用 `ContributionExecutorV2` 而不新增写入路径。默认 Node 依赖图不包含 Wasmi；公开 SDK 和两份 Node 产物的导出集合不变。[ABI 与限制说明](kernel-wasm-executor-v1.md) 明确了资源保证及不受 fuel 计量的编译/宿主复制成本。

十项实际 WASM 测试包含真实 Rust session 的提交/撤销/重做对照和已执行批量前缀的失败回滚。SDK 协议夹具由真实 SDK 与新构建 V2 产物生成，复跑逐字节相同；夹具客体仅实现这条协议行程，不是完整业务验证器或 JS-to-WASM 编译器。最终新跑 Rust 全工作区 538 通过、1 忽略；TS/Native 813 通过、2 跳过、0 失败；严格 Clippy、fmt、Rust 1.88 全 targets/features 检查与两份 release 构建通过。[证据](evidence/kernel-wasm-service-2026-09-12.json) 保存日志和哈希。

本片只完成执行服务与既有事务接口，**没有把 WASM 接入公开 SDK 的模块产物绑定**。仍需由可信宿主按模块身份分发准备/效果/校验，不能将现有 aggregate assessment 服务整体委托给单个不可信客体。多模块装配与能力校验、SDK 兼容、Node 生命周期/重入和实际发布资格继续实施；S2.3 与商业级目标均未整体完成。
