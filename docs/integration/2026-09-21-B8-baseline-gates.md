# B8 边界文档与格式门槛收口

日期：2026-09-21，Asia/Shanghai。状态：本小阶段完成，未晋升 main。
实际验证源码：`a380262e7ed1fb31a0763b6f33dbc6b88266c401`。
父提交：`7bdcadf07e4661261dfbba4a866fbf88b4d34fe8`。
本报告随后单独提交，测试结果不冒称在报告提交上重新执行。

## 已关闭的两项门槛

1. 修复 `crates/brilliant-kernel-session/src/session.rs:389` 的测试 import 换行。
   全文件去空白后与父提交一致；没有更改 import 成员、断言或运行时行为。
   固定 Rust `1.97.1` 的 workspace fmt 现已通过。
2. 将 Kernel 校正提交 `3a7d87074d0a833576bd7e908ce26a249682c38c`
   的已复核边界纳入候选。新增保存/恢复边界文档，并向
   `docs/kernel-commercial-completion.md` 添加对应摘要。

本轮是定向文档适配，不是 cherry-pick 或整支合并：候选未包含旧 `9640b6c` 的错误草案，
不能直接套用以该草案为父树的补丁。新文档压缩重复说明，保留以下关键边界：

- Desktop 已有 lossless `.bgp.json` 导入导出、原子替换和后台 recovery/quarantine。
  不新增保存服务，不用 canonical encoder 替换文件编码合同。
- checkpoint、同会话精确版本的 `mark_persisted` 与物理文件持久化不是同一件事。
- queued recovery 不是 durable receipt，250 ms 不是丢失窗口保证。
- Windows 父目录同步是 no-op；其他平台为 best-effort，不能据源码声称通过断电验证。
- 跨 open/import/close 的会话替换和异步保存回执仍有资格验证缺口。
  不把 Kernel 同会话测试夸大为 Desktop 跨会话保证。
- exact session recovery、WAL、durable history 和新的公开格式仍需单独批准。

原校正分支的两份历史盘点回执留在固定来源中，不复制为候选的实时状态。
本轮重新检查了现有调用路径和文档列出的七个测试符号。
`src/`、`apps/`、`scripts/`、`test/`、依赖和工具链文件均未改变。

## 本轮实际验证

执行目录：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
所有下列验证均已结束。

| 检查 | 实际结果 |
| --- | --- |
| `cargo +1.97.1 fmt --all -- --check` | 提交前和 `a380262` 上均 exit 0 |
| `cargo +1.97.1 test --workspace --all-features --locked --offline --target-dir target` | 667 passed / 0 failed / 2 ignored，exit 0 |
| `cargo +1.97.1 clippy --workspace --all-targets --all-features --locked --offline --target-dir target -- -D warnings` | exit 0 |
| `cargo +1.97.1 test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --offline --target-dir target/desktop-formal` | 65 passed / 0 failed / 0 ignored，exit 0 |
| `git diff --check`、修改范围、七个文档测试符号 | 通过 |
| 遗留保全复核 | 85 文件、1,006,766 bytes，原件/备份/恢复副本一致，四处 index 为空 |
| B1 保护引用 | 11/11 一致 |
| B6 保留产物、锁文件/工具链 hash | 五个产物文件及六个输入文件均一致 |

Rust 的两项 ignored 是既有隔离 scale worker 和显式 10,000 次 soak；
本轮没有额外启用它们。Cargo 仍提示 test profile 的 `panic` 设置被忽略，
这是 Cargo 配置提示；没有为了消除该提示修改公共配置。

本轮 Desktop 回归实际覆盖了物理保存/重开、lossless 导入导出、原子替换、
recovery 合并/取消、坏文件隔离和同进程新 AppState 恢复。
它们不等于真实 GUI 启动、杀进程或断电测试。

没有重跑根目录 Node 全量、Workbench 全量、生产 build 或新 addon 构建。
根目录 924 passed / 2 skipped 是 B7 固定 `0f9b74a` 的结果；
Workbench 615/615 和桌面 release build 是 B6 结果，不改记成本轮。
本轮仅产生新的 Rust 测试/检查输出；保留的 release 产物仍标记 B6 来源，
不能把其来源 SHA 改写为 `a380262`。

## Main 现在还差什么

四线源码提取与组合已经完成，剩下不是等待四线重新开发或再整支互相合并。
本轮 `git merge-base --is-ancestor main HEAD` 返回 0：
当前 `main` `269112b2d85e01827e8cb81bdcc5b671afde4303` 是候选祖先，
因此保持该条件时可执行受控 fast-forward，无需另造业务 merge 结果。
这不是对未来变化的保证；晋升前必须重新检查。

### 第一步：环境验收

下一小阶段在候选内完成并报告：

- 固定已验证的 Windows x64 工具版本、各包锁文件和独立输出目录规则；
  保留根 TypeScript 与 Workbench TypeScript 的按包版本，不强行统一。
- 可重复的开工预检检查源码/base SHA、工具、历史 Git 对象、`pwsh`、
  锁定依赖及 addon 的源码/构建参数/平台/hash；缺失时失败，不借用别的工作树。
- 补齐实际构建时自动记录源码来源的机制并验证，不能给旧产物事后贴新 SHA。
- 在隔离运行状态下完成实际应用启动和必要冒烟验证，不读取或改写用户日常工程、
  配置、凭据或恢复数据；核对相关组合回归及剩余限制。

通过这一阶段即可提交 main 晋升建议。若出现实际阻挡，应报告具体失败和范围，
不擅自展开新的业务架构。开发基线验收不冒充正式商业发布资格；
断电、多平台、签名、安装包、正式性能和 exact recovery 属于另行约定的产品阶段。

### 第二步：获批后迁移并验收 Main

本轮只读重新确认主目录恰好仍是 32 项：21 modified、11 untracked、0 staged。
全部路径仍与遗留处置清单一致，分类为 14 个重复、16 个被取代旧版、
1 个注释差异、1 个协调记录。没有新出现的待分配业务增量。

推荐的执行方式尚未实施，需要用户批准本阶段处置与晋升：

1. 再验 32 项文件指纹、85 项原始字节备份和恢复副本、引用及运行中占用。
   若文件或引用变化，立即停下重新核对，不用旧清单覆盖新工作。
2. 以原 main 为基础，把仅这 32 项原样保存到单独 `codex/legacy-main-*`
   历史保全分支；逐路径暂存，不把它当作业务交付，也不合回产品线。
   保留现有原始字节备份，补验分支恢复能力，避免 Git 换行规范化丢失原字节。
3. 保全通过后让原目录返回 main，再只快进到已验收的完整候选 SHA。
   不 reset、clean、stash、强推或用候选整树复制覆盖；其他旧工作树原地保留。
4. 在 main 原目录按同一锁文件准备自己的依赖与构建产物，跑同一环境预检及
   启动冒烟，确认 tracked/untracked 工作状态和 index 干净，发布最终完整 SHA。
   不能只移动分支指针就宣称主工作树已经就绪。

旧 `preserve-legacy --verify` 同时要求原主目录保持旧状态，所以它是迁移前门禁；
批准迁移后应使用新的保全转移/验收回执检查备份、历史分支和 main 新状态，
不能改写旧证据让这个前置核验假装仍通过。

C7 StaffProjection 留在其他旧工作树作为未采用的方案，不混入 main，
也不为了开发环境先行落定新的 Projection 架构。
四线只有在 main 验收后才从同一批准 SHA 各建分支/Worktree 并做开工检查。
不共享可写 `node_modules`、`target` 或运行数据。

## 本阶段停止点

修复提交 `a380262` 已完成。新增本报告/JSON并更新协作索引后停止汇报，
不在本阶段实施上述两步，不修改 main、不派发任务、不创建 Trellis。
下一次继续应处理第一步环境验收；本报告不是后台计划或自动执行授权。
