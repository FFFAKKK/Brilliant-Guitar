# 插件准备阶段按需构造 Core · 2026-09-13

显式 V4 的命令准备、效果变换现在先取得元数据和扩展上下文；只有实际查询
Core 对象时，才构造该阶段的完整候选。载荷解码和只使用扩展数据的效果变换
不再无条件复制、编码和解析整份谱面。

## 来源与检查

类型化事务及 occurrence Batch 候选都提供独立的贡献者上下文入口，复用现有
元数据与扩展读取逻辑，跳过小节和分部树构造。内部空 Core 数组不是有效文档，
不会通过文档读取返回给插件，也不用于最终校验。

`CoreReads` 的元数据查询使用该小上下文；对象、归属和整份 Core 文档查询
必须先取得完整实际候选，再运行原有全局身份索引检查。即使查询的对象不存在，
也不能借按需读取绕过候选中其他位置的重复身份错误。扩展块仍不进入 Core 回复。

解码和准备之间没有写操作，所以共用一个仅在本阶段有效的延迟缓存；
每个效果阶段创建新的来源，能看到前面的效果写入，不跨效果或事务复用旧状态。
每次回调的查询、字节和索引上限，以及整次操作累计预算继续计费；
缓存不保留读取句柄或索引。构造/读取失败具有粘滞性，不能被宿主吞掉后提交。

这不是直接按对象访问 Store 的完整实现。真正查询音符等对象时，仍会构造
完整 Core 候选及索引；本轮先取消不需要 Core 对象的阶段的完整构造。
最终事务投影、Core 校验、插件校验、撤销重做与独立迁移规则保持原有职责。
V2/V3 仍使用既有准备流程，新行为只在已显式启用的 V4 生效。

## 验证

- 新增实际 Native/Wasm 测试与 SDK 对照：常规单插件编辑的私有完整投影计数
  从 4 次减为 3 次；其中还包含最终事务投影和最终校验来源。
  强制效果解码阶段读取音符后，计数恢复 4 次，并确认读到同一事务刚写入的新音高。
  后续撤销、重做及最终快照完全一致。
- 同一测试在前代 addon 上因仍构造 4 次而失败，新 addon 上通过。
- 新 Rust 测试证明元数据不触发延迟构造、对象/整文档查询不返回简化上下文、
  相邻回调复用同一完整来源、加载失败不能吞掉且后续操作恢复。
  既有重复身份测试增加了延迟来源分支，明确验证索引检查仍生效。
- 28 项真实 Wasm 专项通过，覆盖临时 Batch 数据、先前效果可见性、授权依赖、
  独立迁移、异常回滚及历史。Rust 全工作区全功能 **579 通过、1 忽略、0 失败**；
  Node/Native **889 项，887 通过、2 跳过、0 失败**。
- TS 构建、严格 Clippy、fmt 和 Rust 1.88 全目标全功能检查通过。
  最后扩充的重复身份分支又单独运行通过。

## 参考性能

同机 Windows x64 / Node 24.15.0 / i9-13900HX、同一 V2 guest，旧、新
Native 各顺序测量三轮，每档六次插件编辑。以下为各轮中位数的范围：

| 小节 | 优化前 | 优化后 |
|---|---:|---:|
| 16 | 11.44–15.20 ms | 13.37–14.17 ms |
| 64 | 19.01–23.26 ms | 19.48–20.20 ms |
| 256 | 54.86–61.44 ms | 45.02–50.41 ms |

全部编辑成功，宿主请求仍为六次合计 26,145 B。大文档参考负载有一致改善；
小文档未证明稳定提速，新增上下文的开销和测量噪声不能忽略。
这些数据不证明真实业务 P95/P99、峰值内存、长期稳定性或发布资格。

代码基线 `6ec4504`。新 `target/wasm-v1/brilliant_kernel_node.node` 为
5,892,096 字节，SHA-256：
`948101f2c264616f5d69dd2b0fcbcbf6b682c6ef142f54e32d4393ca3586e1d6`。
前代备份 `target/lazy-core-projection/prior-wasm-v1.node` 的 SHA-256 为
`e700a1377bd37bfe134bbaec33eee804d1f706be3f03988feaff76047f9f96f2`。
其他 Integrated/Core addon 未替换；相关全量测试沿用原产物，本轮新代码的
Native 执行证据来自重建后的 Wasm addon。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
node --expose-gc scripts/profile-native-integrated.mjs --scheduled-editing-v4
cargo +1.97.1 test --workspace --all-features --locked --offline
node dist/test/test-infrastructure/run-compiled-tests.js
```

替换 addon、构建、测试与性能测量应顺序执行。日志及六轮测量 JSON 保留于
本地 `target/lazy-core-projection/`，不随 Git 提交。

后续仍需减少实际对象读取时的完整投影及索引重建，同时保留身份冲突与资源检查；
真实产品闭环、冻结负载资格、目标平台、稳定性和默认切换也尚未完成。
基础功能仍粗估 85–90%，商业准备约 65%，不因参考样本提速提高评级。
