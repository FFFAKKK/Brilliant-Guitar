# Wasm 按需读取与 256 小节参考负载 · 2026-09-13

**参考 Wasm guest 在相同燃料和传输上限下完成了 256 小节／1024 音符编辑：6/6 次成功。**
此前完整 V1 视图的同规模准备阶段 6/6 次耗尽燃料。这是特定参考 guest
的容量修复，不是任意业务插件、端到端性能或商业发布资格。

## 已接通的合同

可信 Node 宿主通过 `installNativeWasmCoreReadsBackendV2` 显式启用完整贡献者
Wasm 绑定与 Native Core 读取版本 2。安装时固定目录身份和 guest 字节／SHA-256，
探测每个绑定（包括尚无扩展块的贡献者）的 `callbackVersion: 2` 能力。
旧 guest 不支持时安装失败，既有完整输入 V1 安装入口继续存在。

V2 guest 保留原有三导出、无 import 的有界 Wasm ABI。每次调用仍是全新实例；
它收到六类既有插件操作、`viewVersion: 2` 和 **没有 `coreDocument` 的视图**。
结果为版本 2 的完成值，或一份 Core 选择器查询。Node 通过前一轮的 Native
数据帧获取当前 Rust 候选结果，在同一回调内重新执行需要继续的 guest。
已完成的 guest 子调用按精确请求数据复用结果，避免重复插件副作用；
查询不得重复，次数、回复字节和索引遍历受 Rust 的单回调与整次操作账户约束。
宿主没有把 Rust 候选句柄或读取函数暴露给 guest／JS。

这仍由可信 TS 构造完整回调候选及插件兼容／依赖视图，再运行宿主插件调度；
只移除了**发给 V2 guest 的完整 Core 文档**。guest 可以主动选择一个实体，
文档级选择仍受单回复 1 MiB 等限制，不能声称完整 Core 不再传输到 Node。
实例重启和 TS 回调重放产生额外的 CPU／内存成本；这不是 Wasm continuation ABI，
也没有使整条事务路径变成纯 Rust。

## 行为证据

- 用真实 V2 guest、两项已认证贡献、同一 Native 产物编辑 256 小节／1024 音符；
  Score／Part 编辑、混合 Batch、撤销重做、事件和读取得到与 SDK 对照相同的结果，
  没有回退到 JS 插件代码。
- 在一个 Batch 中先由 Core 改变末尾音符，guest 的 prepare 读取到**当前候选**；
  独立插件校验能拒绝随后破坏音符／扩展关系的 Core 命令，联合修复则原子成功。
- 跨插件读取仍须显式声明：Score guest 读取之前 Part guest 在同批次写入的
  Part 扩展块，未声明或无数据时拒绝。扩展读授权与 Core 按需读取分别检查。
- 畸形／重复／过量查询、客体燃料耗尽、越权写入、伪造汇总和 issue、非法 UTF-8
  均拒绝有效 Batch 前缀且不留下事件或历史变化，下一次独立操作仍可执行。
- 独立迁移和其他六类插件回调仍走固定绑定；旧 guest／旧 Native 忽略新参数时，
  真实能力探测使新入口拒绝，旧入口继续原样运行。

## 有限诊断样本

Windows x64、Node 24.15.0、i9-13900HX、release Native，每档六次顺序编辑，
每个样本一个分部、每小节四个音符。测量含宿主调度，非冻结 CVN-7 资格运行。

| 小节／音符 | 成功 | 编辑中位数 | 最大单次 guest 输入 | 六次编辑宿主请求字节合计 |
|---|---:|---:|---:|---:|
| 16／64 | 6/6 | 21.30 ms | 830 B | 251,542 B |
| 64／256 | 6/6 | 53.48 ms | 830 B | 961,354 B |
| 256／1024 | 6/6 | 196.69 ms | 830 B | 3,815,020 B |

六次 256 小节编辑的 guest 输入加输出合计约 27.5 KB，但宿主请求仍是约 3.8 MB。
256 小节末尾 GC 后 RSS 样本约 242 MB，**不是峰值内存或泄漏测试**。
此前 V1 同规模的插件编辑 0/6，因此没有对应成功耗时可用于加速比。
没有扩大单客体 1000 万 fuel、整次 1 亿 fuel／4096 次 guest 调用／128 MiB
客体传输，以及 Core 按需读取额度。

## 构件与兼容

新增源码和 `guest-v2.wasm` 位于独立 example；V1 `guest.wasm` 保持
`fa1cc218...` 原字节。当前源码重建 V1 的候选哈希为 `86e7dedc...`；
构建脚本现在拒绝覆盖已归档 V1，候选只落在忽略的 `target/wasm-guest/`，
新 guest 重建两次均为 `f2d64a88...`。旧 V1 精确重建需在它原先的
`42dec13` 源码状态下进行，不应把当前不同字节冒充旧证据。

复现：先按 README 构建 `target/wasm-v1/` 和 TS，再执行：

```powershell
node test/core-kernel/fixtures/wasm-guest/build.mjs --core-reads-v2
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
node --expose-gc scripts/profile-native-integrated.mjs --core-reads-v2
```

完整 Node/Native 865 项中 863 项通过、2 项既有跳过；Rust 567 项通过、
1 项既有忽略；严格 Clippy、fmt、Rust 1.88 全功能和 TS 类型／构建通过。
详细结果和构件哈希见[验证记录](evidence/kernel-wasm-selective-guest-2026-09-13.json)。

**下一个商业关口**：收口 TS 完整候选构造与插件调度的事务开销，验证正式吉他
业务插件对数据读取、资源上限及降级行为的适配；再做目标平台 P95/P99、峰值内存、
长期稳定性、发布和可逆默认切换。微内核基础能力仍粗估 85–90%，商业准备
约 65%；这是工程判断，不是工期进度。
