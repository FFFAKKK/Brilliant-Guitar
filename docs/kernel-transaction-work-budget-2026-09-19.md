# 整笔事务确定性工作量预算（2026-09-19）

## 结论

Rust 微内核现在为每一笔事务维护一个跨阶段、不可被子命令重置的确定性工作量预算。
V1 上限为 `8388608` work units，公开失败合同为：

```text
command.resource-limit-exceeded
limitKind = transaction-work-units
```

该预算替代内核事务内部的墙钟 CPU 超时。相同输入和相同执行路径得到相同计费结果，
不受机器速度、调度抖动或系统负载影响，因此能够稳定重放、测试和审计。

## 计费范围

预算聚合 Stage 3 已发布的十二类工作指标：

- 语义规则评估和语义依赖读取；
- 实体遍历、实体索引查询和 owner 索引查询；
- 时间索引比较；
- overlay 记录和顺序集合复制；
- ChangeSet 操作、affected 地址；
- 索引删除和索引插入。

长循环在指标发布前先预扣单位，随后发布指标时消费预扣额度，避免重复计费。无法由
Stage 3 指标表达的工作使用补充计费，包括 Candidate 身份绑定、扩展头遍历、最终
delta 收集、Journal 重放和提交准备。所有累计使用饱和加法，整数溢出会收敛到超限，
不会绕过限制。

## 生命周期与原子性

一个预算从 Typed 事务创建开始，经过 Core 命令、Batch 子命令、Typed → Candidate
表示切换、插件 Effect、最终语义验证、ChangeSet/affected/index 准备和提交阶段持续
有效。Candidate 直接创建路径也使用同一合同。预算和已准备事务均不可克隆，类型系统
阻止复制同一计数器或重复消费同一准备结果。

达到精确上限仍允许继续；第一单位超出时记录固定的 `actual` 并进入粘性失败状态。
后续子命令即使捕获内部错误，也不能清除或替换该资源失败。超限不会发布 Store、
history、document version 或事件；下一笔独立事务获得全新预算。

Batch 继续使用现有 `command.batch-child-rejected` 包装最先失败的子命令，但内部失败
保留 `transaction-work-units`、`limit` 和 `actual`。最终验证或提交准备阶段超限属于
整笔事务失败，不会错误归因给已经成功执行的子命令。

## 明确边界

该预算只治理 Rust 内核自身能够控制和计数的工作。TypeScript 插件回调中的任意 CPU
循环无法由同步 Rust 调用安全抢占，仍应由插件平台的 worker 隔离、进程期限或 WASM
fuel 负责。现有 WASM 路径已有独立 fuel 与传输预算；本项没有把插件平台职责重新塞入
微内核。

## 合同同步

Rust Serde、lossless writer、TypeScript 命令联合、严格失败解码器和 Native smoke
均接受 `transaction-work-units`。RKP-3 源码合同现在用真实序列化断言固定该 wire 值，
避免只在枚举派生规则中隐含存在。

## 验证结果

- 定向 rustfmt：通过；
- `cargo test --workspace --all-features --locked --offline`：658 passed、1 ignored、0 failed；
- `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings`：通过；
- `npm run typecheck`：通过；
- `npm run build`：通过；
- RKP-3 合同聚焦测试：7 passed、0 failed；
- 使用当前源码重建三份 addon 后，完整 `npm test`：907 total、905 passed、2 skipped、0 failed；
- `git diff --check`：通过。

第一次完整 Node 运行暴露了一个历史源码令牌测试缺口：公开枚举和 codec 已包含
`transaction-work-units`，但 `command.rs` 没有该 kebab-case 字面量。新增真实序列化
断言后，聚焦测试和完整套件均恢复为零失败。该问题没有进入运行时状态发布路径。

本次验证使用的当前源码产物：

- Core V1：3,614,720 bytes，SHA-256 `70485d13e0bb217141c46ec6011214bf7f3361829a2c3a815b31233e528304a0`；
- Integrated V2：5,056,512 bytes，SHA-256 `d531500d819bdd4f14d779a32b366d7a43f3567b8e749743c27230a22aa2a715`；
- WASM V1：6,289,408 bytes，SHA-256 `1341b1fc85c7f6896210f2855f1faa30d202ae4e85ecbb1d1327836a3c267fde`。

Integrated V2 继续保存在独立验证路径
`target/kernel-commercial-current/integrated-v2.node`，没有覆盖可能被运行中进程占用的
标准目录。

## 当前判断

这项工作关闭了“整笔事务缺少确定性计算上限”的高优先级内核缺口。微内核核心逻辑
完整度仍约 99%，商业候选成熟度约 97%–98%。这仍不是正式商业发布结论：插件回调
CPU 隔离、长时间 soak/fuzz、进程崩溃恢复、真实产品 p95/p99、多平台 CI/签名/打包/
升级，以及受控 Rust 默认切换仍需完成。

机器可读证据见
`docs/evidence/kernel-transaction-work-budget-2026-09-19.json`。
