# Rust 调度最终插件校验 · 2026-09-13

新增私有显式入口 `installNativeWasmScheduledAssessmentV3`。创建、编辑和撤销重做的
最终插件校验现在由 Rust Runtime 决定贡献者名单、调用顺序、视图和结果汇总。
TS 宿主只将单个调用交给固定的真实 Wasm 绑定，不再执行这条路径的
`runNativeModulePipeline`。新入口尚未成为产品默认。

## 调用与权限

Native 会话第三个参数 `3` 启用此模式；省略参数和 `2` 保留既有行为。
Runtime 首先发出无完整文档的 `assessmentStart` 并检查版本确认，即使没有活跃
贡献者也要确认成功。TS 适配同时验证真实 Core 读取交互及调度确认，拒绝忽略、
降级新参数的旧宿主。缺失任何 Wasm 绑定或不支持 guest V2 协议也在安装时拒绝。

Runtime 使用已认证装配和当前候选选择贡献者。没有兼容扩展数据的贡献者、
有不兼容读取依赖的贡献者不进入执行名单；完整可用性状态仍由 Rust 判定。
Runtime 先执行全部语义校验；有语义问题则拒绝，全部通过后才执行支持度分类。
每份诊断的字段、来源、位置和数量由 Rust 检查，单贡献者最多 1024 条、
每阶段总计最多 4096 条。宿主不再能提交整个校验名单或替换 Core 结果。

单个 `assessmentCallback` 携带贡献者身份、操作、文档身份及版本和 `viewVersion: 2`
视图。视图只包含本贡献者兼容扩展和显式授权的依赖块，按既有 UTF-16 顺序排列；
不包含 `coreDocument`，回调顶层也没有完整 `document`。
数据仍来自同一个 Rust 候选；按需 Core 读取的来源独立保留在 Rust 内部。
派生 SDK 目录里“显式空依赖列表”的表示由可信适配保留，不增加任何读权限。

单贡献者 guest 返回的仅是问题数组或分类结果，不能自带汇总名单绕过 Runtime。
读取失败、Wasm 执行失败、契约错误及额度耗尽均发生在事务采用之前；编辑和历史
游标保持原状，不发布提交事件。独立后续操作恢复。

这不是整个事务路径纯 Rust 化：准备、变换及独立迁移继续使用既有 V2 宿主流程。
迁移入口明确拒绝参数 `3`，新安装器的迁移功能显式调用参数 `2`。
Wasm 程序仍由可信 Node 适配交给 Native executor 执行，Runtime 尚未直接持有
guest 实例；没有取消所有 TS 宿主代码。

## 资源与实测

最终校验仍在 Rust 构造一份完整候选读取源，只是不再将它传给 TS。
Rust 的完整投影、Core 验证和插件视图构造仍有成本，未宣称增量校验完成。
因为聚合回调拆成单贡献者回调，单回调的读取额度也随之分别计费；整次操作的
4096 次读取、32 MiB 读取回复和索引遍历上限仍共享。Wasm fuel、调用、传输账户和
128 MiB 双向宿主传输账户均保持生效，不因拆分重置。

同一台 Windows x64 / Node 24.15.0 / i9-13900HX、同一新 release Native、同一 V2
guest，顺序测量旧、新两种宿主模式，每档六次。以下均为六次调用的宿主请求总字节：

| 小节 | 基础编辑 V2 → V3 | 插件编辑 V2 → V3 | 插件编辑中位数 V2 → V3 |
|---|---:|---:|---:|
| 16 | 82,170 → 1,578 B | 251,542 → 177,718 B | 21.60 → 17.80 ms |
| 64 | 318,774 → 1,578 B | 961,354 → 650,926 B | 56.37 → 43.70 ms |
| 256 | 1,269,996 → 1,578 B | 3,815,020 → 2,553,370 B | 204.34 → 153.51 ms |

两种模式所有编辑都成功，客体传输量相同。基础编辑时文档还没有扩展块；
它仍做 Rust Core 校验和调度协议确认。真实两个活跃贡献者的 256 小节测试中，
单个最终校验宿主请求小于 2 KiB，且关闭 TS 插件汇总函数后仍通过编辑与历史旅程。
插件准备和变换仍传完整候选，因此插件编辑宿主请求没有降到常数级。

这只是特定参考 guest 的小样本诊断，非 CVN-7 资格测试，不证明 P95/P99、
进程峰值内存、真实业务插件或长期运行达标。

## 验证与构件

- 新旧入口共 14 项真实 Wasm 测试在最终全量中通过：同批次候选、独立语义校验、
  声明读取、只读降级、旧协议拒绝、迁移、异常回滚、事件及撤销重做。
- 三项 Rust 专项测试验证记录旅程、错误结果与吞错拒绝、两个阶段的跨贡献者
  4096 条问题上限。Rust 全量 **573 通过、1 项既有忽略、0 失败**。
- Node/Native 全量 **875 项，873 通过、2 项既有跳过、0 失败**。
  严格 Clippy、fmt、Rust 1.88 全目标全功能检查和 TS 类型检查/构建通过。
- Native 调度不可用时，新专项测试在之前产物上失败；新产物明确执行 Rust
  调度，并验证未调用 TS 汇总函数、未传完整校验文档。

代码基线 `9a69b37`。新 `target/wasm-v1/brilliant_kernel_node.node` 为
5,811,200 字节，SHA-256：
`9cf616ff9e2758ee70d3540f5ff922406148819316c7f243af5117cc727188ea`。
之前的产物保留于 `target/scheduled-assessment/prior-wasm-v1.node`，
SHA-256 `e44138ea74333c0543c8254a75e6ab919b697d35315e80d62520aa584ed223da`。
两代 guest 字节和常规 `target/integrated-v2/` 产物未替换；全量 Node 中使用其他
Native 入口的测试沿用它们原有产物。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
node --expose-gc scripts/profile-native-integrated.mjs --core-reads-v2
node --expose-gc scripts/profile-native-integrated.mjs --scheduled-assessment-v3
```

替换 addon、构建 TS 和运行测试应顺序执行。本机日志及原始测量 JSON 位于
`target/scheduled-assessment/`；其内容是可重建的本地证据，不随 Git 提交。

下一步：继续收口准备和变换阶段的宿主投影与调度，再处理独立迁移并完成实际业务、
目标平台、长期稳定性、发布和默认切换验证。基础功能仍粗估 85–90%，商业准备
约 65%；本轮关闭一个明确架构缺口，但没有新的商业资格证据，不提高总体估计。
