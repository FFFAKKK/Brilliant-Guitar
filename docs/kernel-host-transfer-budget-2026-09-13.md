# Native 宿主累计传输额度 · 2026-09-13

显式启用 Core 读取协议 V2 的 Native 操作，现在对 Rust 与 Node 回调之间的
双向数据合计施加 **128 MiB** 上限。创建、编辑、历史操作和独立迁移均建立账户。
同一线程同步嵌套的会话调用共享账户，包括嵌套调用省略读取协议版本的情况。
独立的旧二参数入口保留原有行为，不自动启用此限制。

计费包括完整候选请求、Core 读取查询和回复帧、宿主最终结果，以及合法 JSON
末尾空白。Rust 在复制请求到 Node Buffer 前检查额度，在复制或解析 Node
返回数据前再次检查。一次超限会锁定当前账户；宿主吞掉内层错误后返回成功，
外层回调仍被拒绝。只有退出最外层作用域才清除账户，下一次独立操作重新计费。

这是宿主传输账户，独立于既有 Wasm fuel、调用次数、客体传输及 Core 读取账户。
它不限制 Node 在返回前自行分配的内存，也不消除 Rust 候选构造、序列化或 TS
重放开销，不代表进程峰值内存、CPU 或长期稳定性达标。

## 验证

- 两项真实 Node 回归在旧 Wasm Native 产物上均失败：超额批次和吞掉嵌套错误的
  外层操作都被提交。新产物两项均通过，证明不是仅验证额度计算器。
- 十条插件命令前先放一个有效 Core 编辑，宿主每次返回合法结果并附加 16 MiB
  空白。第八次回复耗尽累计额度，整批拒绝，快照、历史、脏状态不变且无提交事件；
  关闭膨胀后下一次独立插件编辑成功。
- 外层 V2 prepare 中嵌套四次旧二参数会话创建，每次回调返回附带 32 MiB 空白的
  合法结果。第四次被拒绝；宿主捕获该异常，外层仍拒绝且不采用有效 Core 前缀。
  这不建立跨会话原子事务，之前已完成的独立内层工作不承诺随外层回滚。
- 三项 Rust 单元测试覆盖额度边界、嵌套共享、旧入口、线程隔离和 unwind 后恢复。
- 全量 Rust 工作区测试通过；严格 Clippy、fmt、Rust 1.88 全目标全功能检查、
  TS 类型检查与构建通过。
- 最终 Node/Native **867 项，865 通过、2 项既有跳过、0 失败**。
  Core 读取专项 **9/9**，包括新超限测试和原迁移、256 小节读取与历史测试。
  完整回归也覆盖真实 V2 Wasm guest 的 256 小节旅程。

## 构件与复现

基线提交：`1584bac`。新 release Wasm Native 已安装于
`target/wasm-v1/brilliant_kernel_node.node`，5,755,392 字节，SHA-256：
`e44138ea74333c0543c8254a75e6ab919b697d35315e80d62520aa584ed223da`。
原产物保留在 `target/host-transfer-budget/original-wasm-v1.node`，
SHA-256 为 `a17a1cf9881ded43c3ac3dc17f0b16a50b97bed1b4e38aeda7dc4ca4f26575d5`。
两代 guest 文件及常规 `target/integrated-v2/` 产物没有替换。
这些 target 文件属于本地可重建产物，不随 Git 提交。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/native-core-read-exchange.test.js
node dist/test/test-infrastructure/run-compiled-tests.js
```

构建和替换 addon 必须与使用该文件的测试顺序执行。本机对照日志位于
`target/host-transfer-budget/before.log`、`focused.log`、`final-node-tests.log`。

下一步仍需减少完整宿主候选传输、将插件调度归入 Rust 控制，并完成真实业务、
目标平台延迟、峰值内存、长时间运行与发布验证。此轮完成资源边界修复，
不据此提高商业准备度；基础功能粗估 85–90%，商业准备约 65%，不是工期比例。
