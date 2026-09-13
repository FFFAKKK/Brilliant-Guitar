# 大文档初始化与诊断超限修复

2026-09-13。生产代码基线 `3d3e11d`，改动在本提交中。

## 结果与边界

上一轮冻结压力文档包含 102,400 个事件、51,200 个音符，进入 V4 时返回
`command.internal-error`。本轮修复后，原样文档可以打开并完整读取。

原因是初始化复用了编辑后的完整评估流程：旧 K1 产品配置为多声部文档生成
6,401 条“不支持”诊断，超过 4,096 上限；初始化实际上不向调用者返回这份
Core 功能报告。合法的数据被一份未使用的报告挡在了入口。

现在 V3/V4 初始化仍执行结构、Core 语义、扩展可用性和插件验证/分类检查，
但不生成未使用的 K1 Core 功能报告。内部插件评估抽成同一实现供初始化与
编辑调用，避免两套规则漂移。没有伪造 `supported` 结果。
旧宿主回调协议仍接收它原先要求的完整 Core 报告。

编辑、撤销与重做的完整报告契约没有取消。Core 报告超限现在明确返回：

```json
{"code":"command.resource-limit-exceeded","limitKind":"diagnostics","limit":4096,"actual":4097}
```

`actual: 4097` 表示达到第一个超限项即停止，并非声称完整报告只有 4,097 条。
没有提高资源上限、截断报告后宣称完整，也没有改动冻结负载或验收阈值。

**压力编辑尚未可用。** 本轮解决的是合法压力文档无法打开，以及编辑报告超限
被错误归类为内部错误。不能把它等同于整个容量问题已解决。

## 验证

- Rust 新回归覆盖 4,096 / 4,097 条旧 K1 不支持诊断：两类合法文档都能
  打开；前者编辑成功并返回全部诊断，后者明确拒绝且读取状态完整不变。
- 原有模块诊断、错误结果、权限读取与历史测试继续通过，初始化没有跳过
  插件验证。
- Native 新回归使用原样冻结压力文档，验证完整打开/读取，编辑超限后文档、
  版本、历史、dirty 状态不变且没有事件。真实 Wasm 路径不调用 SDK JS 回调。
  同一 Native 测试在旧 addon 上因初始化内部错误而失败，在重建产物上通过。
- 全 workspace / all-features Rust：**580 通过、1 忽略、0 失败**。
- 完整 Node/Native：**892 总计、890 通过、2 跳过、0 失败**。
- TS 构建与严格类型检查、Rust fmt、全目标全功能严格 Clippy、
  Rust 1.88 全目标全功能检查通过。

本轮只替换了 Wasm Native addon；其他 Integrated/Core addon 沿用原产物。
新生产代码的 Native 执行证据来自重建的 Wasm addon。

## 冻结负载前置检查

同机 Windows x64 / Node 24.15.0 / i9-13900HX。每项仅一个样本，
不是 p95/p99，不是正式资格测试，也不证明稳定性能改善。

| 负载 | 初始化 | 插件编辑 | 撤销 | 重做 | 缓存读取 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 代表性 | 1,167.08 ms，成功 | 498.00 ms，成功 | 505.35 ms | 478.40 ms | 0.23 ms |
| 压力 | 4,805.18 ms，成功 | 1,768.60 ms，诊断超限拒绝 | 未执行 | 未执行 | 未计时 |

代表性进程峰值 RSS 497,930,240 字节，压力进程 1,284,382,720 字节；
包含夹具生成和未计时的数据验证，不能代替完整编辑序列的内存验收。
代表性前置检查仍因原始编码哈希不一致而失败，数据恢复检查通过。
压力前置检查现在在 `submit-single` 阶段失败；两者仍为退出码 1，
`qualification: false`。

原始记录：

- `docs/evidence/scoped-admission-representative-2026-09-13.json`
- `docs/evidence/scoped-admission-stress-2026-09-13.json`

## 复现产物与命令

`target/wasm-v1/brilliant_kernel_node.node`：5,891,584 字节，
SHA-256 `9a4e2cf433f0116256a387b4c2fe3c880283dc03791180d7db90d3c34a1877e6`。
前代备份 `target/scoped-admission/prior-wasm-v1.node`。
CVN-7 guest 未改，SHA-256
`e0a8cf1c2ca35156a836ee4cc64bf7dc35e62590931647e2f93cb1deee6ff69c`。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/cvn-7-native-wasm.test.js
node scripts/probe-native-qualification-v4.mjs representative
node scripts/probe-native-qualification-v4.mjs stress
cargo +1.97.1 test --workspace --all-features --locked --offline
node dist/test/test-infrastructure/run-compiled-tests.js
```

产物替换、Node 构建、测试和性能测量按序执行。日志在
`target/scoped-admission/`。

## 后续工作

1. 解决完整 K1 产品功能报告与合法大文档编辑之间的冲突。需要明确可用的
   产品功能策略/诊断获取方式，保持语义合法性与功能支持状态区分；
   不能通过让微内核虚报支持或丢失诊断来“通过”资格测试。
2. 减少局部编辑中的全量文档投影、语义与功能扫描，建立实际增量工作证据。
3. 处理编码顺序兼容性、正式采样、Batch/replay、长序列和真实插件集成。
4. 达成门槛后完成默认引擎切换和发布审查。

微内核基础功能可供继续集成开发，商业资格仍未达标。本轮不提高百分比估计。
