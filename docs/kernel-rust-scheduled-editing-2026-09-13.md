# Rust 调度插件编辑 · 2026-09-13

新增私有显式入口 `installNativeWasmScheduledEditingV4`，Native 会话参数为 `4`。
Rust Runtime 在既有最终插件校验调度之上，接管命令解码、命令准备、效果解码、
效果变换的逐次调用。编辑路径不再借助 TS 贡献者执行器安排这些步骤，也不再把
完整 Core 候选传给宿主。该入口尚未成为产品默认。

## 行为与边界

- Runtime 从已安装装配取得贡献者与定义，先解码再检查目标存在性，检查准备结果、
  受影响地址及资源限额，再沿用既有事务效果、写权限、最终校验和历史机制。
- 视图只有本贡献者兼容扩展、声明依赖和文档身份；Core 数据经既有 V2 协议按需读取。
  每次读取绑定当时的 Rust 候选，效果变换能够看见本事务先前写入。
- Batch 中尚待后续步骤修复的临时状态保留原始值，不提前当成最终合法文档解码；
  最终合法性仍由 Rust 判断。目标重复身份不能通过“存在性”检查。
- V4 必须收到对应版本确认；旧宿主忽略参数、降级到 V2/V3，或发回旧式
  聚合准备/变换请求均拒绝。V2、V3 入口保留自身行为。
- 原有 Wasm 执行、Core 读取和双向宿主传输预算继续生效。拆分后的每个回调有
  自己的读取上限，操作累计账户仍共享，失败不能被吞掉后继续提交。

TS 仍是可信的数据传输和真实 Wasm 绑定适配层，Runtime 尚未直接持有 guest。
独立迁移仍明确走参数 `2` 的既有流程；迁移入口拒绝 `3`/`4`。
Rust 内部完整候选构造和最终 Core 校验仍有成本，不能称为全增量实现。

## 实测

同机、同一 release Native 和 V2 参考 guest，顺序运行 V3/V4，每档六次插件编辑，
全部成功。宿主请求为六次调用的合计，耗时为编辑中位数：

| 小节 | V3 请求 | V4 请求 | V3 耗时 | V4 耗时 |
|---|---:|---:|---:|---:|
| 16 | 177,718 B | 26,145 B | 17.99 ms | 12.07 ms |
| 64 | 650,926 B | 26,145 B | 44.84 ms | 21.09 ms |
| 256 | 2,553,370 B | 26,145 B | 154.00 ms | 59.24 ms |

六次编辑的 guest 双向传输均为 27,454 B。这里只证明该参考负载的传输改善；
扩展数据和主动读取增多仍会增加成本。小样本中位数不构成商业性能资格，
不能据此推断 P95/P99、峰值内存或真实业务插件容量。

## 验证与构件

- 25 项真实 Wasm 专项通过，覆盖 V2/V3/V4 的编辑、Batch、历史、迁移、
  授权依赖、过时宿主、异常和资源失败回滚。
- V4 测试将 TS 贡献者执行器及插件汇总函数替换为抛错函数，仍完成真实双插件
  编辑、撤销、重做与 SDK 对照；执行器调用数为零。捕获到四类准备/变换调用，
  每次请求小于 2 KiB，无完整 Core 文档。
- 临时 Batch 数据可在最终提交前修复；无效载荷与不存在目标同时出现时仍先报
  无效命令，合法载荷才报告目标不存在。
- Rust 专项 4 项通过；全工作区全功能 **574 通过、1 忽略、0 失败**。
  Node/Native 全量 **886 项，884 通过、2 跳过、0 失败**。
  TS 构建、严格 Clippy、fmt 和 Rust 1.88 全目标全功能检查通过。
- 新 V4 专项在上一代 Native 产物上因不支持新协议失败，新产物通过。

代码基线 `4c2bf42`。新 `target/wasm-v1/brilliant_kernel_node.node` 为
5,842,944 字节，SHA-256：
`36fcabd41888e4d4b2318c4e5c36a8101b1710b7c829cab4d75c60a2649ce0fd`。
前代备份 `target/scheduled-editing/prior-wasm-v1.node` 的 SHA-256 为
`9cf616ff9e2758ee70d3540f5ff922406148819316c7f243af5117cc727188ea`。
V1/V2 guest 字节未改变；常规 Integrated/Core addon 未替换，全量中相关测试
沿用各自原产物。本轮 Native 源码的执行证据来自重新构建的 Wasm addon。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
cargo +1.97.1 test --workspace --all-features --locked --offline
node dist/test/test-infrastructure/run-compiled-tests.js
node --expose-gc scripts/profile-native-integrated.mjs --scheduled-assessment-v3
node --expose-gc scripts/profile-native-integrated.mjs --scheduled-editing-v4
```

替换 addon、TS 构建、测试及性能测量应顺序执行。本地日志和原始测量位于
`target/scheduled-editing/`，是可重建证据，不随 Git 提交。

下一步先收口独立迁移的宿主调度，再减少 Rust 候选构造成本；随后补齐真实
UI/业务插件闭环、目标平台、长期稳定性和发布资格，最后决定默认切换。
基础功能仍粗估 85–90%，商业准备约 65%。这是定性判断，不是验收项完成比例；
本轮有明确架构与性能进展，但尚无新的商业资格证据。
