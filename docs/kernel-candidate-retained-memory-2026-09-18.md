# Candidate 保留内存资源闭环（2026-09-18）

## 结论

Rust 微内核现在把 Candidate 的保留内存与 `changeset-logical-bytes` 分开治理。
逻辑账本继续保证跨实现兼容性；新的物理资源信封限制未发布事务在内存中保留的容器、索引、日志、身份、扩展状态和动态载荷。

V1 上限为 `536870912` 字节（512 MiB），公开失败类型为：

```text
command.resource-limit-exceeded
limitKind = candidate-retained-bytes
```

## 计费模型

该信封是确定性的保守估算，不读取 allocator RSS：

- 计入 Candidate、Recorder、IdentityRecorder、ChangeSetAccounting 和执行段的固定结构；
- 按 `Vec::capacity` 计入连续分配；
- 按 `HashMap` / `HashSet` capacity、桶余量、控制字节和对齐余量计入哈希结构；
- 按 UTF-16 单元和 Arc 头部计入共享字符串；
- 递归计入 Candidate 的节点、局部索引、顺序、反向引用、扩展状态和 Journal 容器；
- 对兼容性逻辑载荷使用 2 倍保守系数，覆盖前向/逆向操作和最终准备阶段保留的数据；
- 所有加法、乘法和平台整数转换均在溢出时收敛到 `u64::MAX`，因此溢出必然按超限失败。

真实的 `try_reserve` / allocator 失败仍返回 `command.internal-error`，不会伪装成可预测的资源超限。

## 执行语义

资源信封在三个边界检查：

1. CandidateExecution 从已有前缀创建时；
2. 每个发生变化的 Core 命令或模块执行段完成后；
3. 最终验证和 `PreparedCandidate` 构造前。

超限后 Candidate 会被终止，后续调用不能吞掉错误继续写入。失败不会发布 Store、history、document version 或事件；下一次独立操作获得新的资源预算。

## 合同同步

Rust Serde、Rust lossless writer、TypeScript 命令联合、严格失败解码器和原生 smoke 验证均接受 `candidate-retained-bytes`。同时修复了 TypeScript 严格解码器此前遗漏 `diagnostics` 与 `changeset-logical-bytes` 的合同偏差。

## 验证结果

- `cargo test --workspace --all-features --locked --offline`：652 passed、1 ignored、0 failed；
- `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings`：通过；
- `npm run typecheck`：通过；
- 新增 TypeScript 严格资源合同测试：2 passed；
- 新增 Candidate 资源测试：正常路径、最终超限原子拒绝、终止状态不可吞掉，3 passed；
- 使用当前源码重建 Core V1、Integrated V2 和 WASM addon 后，完整 `npm test`：907 total、905 passed、2 skipped、0 failed；
- `git diff --check`：通过。

全仓 `cargo fmt --all -- --check` 仍被两处本轮开始前已存在的格式差异阻挡：`crates/brilliant-kernel-runtime/src/selectors.rs` 与 `crates/brilliant-kernel-session/src/session.rs`。本轮修改的 Rust 文件均已达到 rustfmt 期望格式；为避免覆盖其他会话正在进行的变更，没有顺手改写这两个文件。

第一次完整 `npm test` 实际读取了被运行中进程占用的
`target/integrated-v2/brilliant_kernel_node.node`。该文件最后生成于 2026-09-17，
未包含当前源码已经实现的精确 Effect 错误、最小 affected 集合和 rule-warning V2，
因此产生 13 个看似属于 integrated/plugin 的回归。用当前源码和
`integrated-bridge-v2` feature 重建后，产物另存到
`target/kernel-commercial-current/integrated-v2.node`，并通过
`BRILLIANT_INTEGRATED_ADDON_PATH` 显式选择；原 13 项全部恢复，完整套件零失败。

本次完整验证使用三份当前源码产物：

- Core V1：3,597,824 bytes，SHA-256 `2efb0d6de0f4f5f4d49e9acfb97c927a862c61b12e4e0f39f4e8501279ad1089`；
- Integrated V2：5,037,568 bytes，SHA-256 `5918135aafe6b95dafcb1367872c0d57edcc2a24149ec698215ddfbd240d7414`；
- WASM V1：6,270,464 bytes，SHA-256 `4435ec9a25166cd79f269fd9559eef784189b7a93de2f65cd40dbf2a29769055`。

标准 `target/integrated-v2` 文件仍由外部进程占用，未强制终止进程或覆盖文件。
README 已补充独立路径验证流程，后续审计不得再用陈旧原生产物推断当前源码状态。

机器可读证据见 `docs/evidence/kernel-candidate-retained-memory-2026-09-18.json`。
