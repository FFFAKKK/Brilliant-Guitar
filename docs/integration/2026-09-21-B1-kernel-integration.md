# B1 Kernel 集成收口

日期：2026-09-21，Asia/Shanghai。
本批由总协调直接执行，不启动其他任务或子代理。
用户已批准开始整合现有成果；本次只完成 B1，随后停止报告。

## 候选与范围

- Worktree：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
- 分支：`codex/integration-candidate-20260921`。
- 起点：`9aba3cbe90ab0a18ce4dd651fc7d19c76bccd9be`，保留已收口的协调文档。
- 共同业务基线：`269112b2d85e01827e8cb81bdcc5b671afde4303`。
- 本批验证源码：`426b6ab7f4da4b652d0f96f540bd04b3a823b20d`。
- common Git directory：`E:/desktop/brilliant_ideas/brilliant_guitar/.git`。

使用 `git cherry-pick -x` 按原顺序重放五个提交，全部无冲突。
没有手工更改业务代码、覆盖共享文件、使用 ours/theirs 或修改源分支。

| 原提交 | 候选提交 | 内容 |
| --- | --- | --- |
| `7b1fcae` | `9db22b2` | checkpoint canonical 编码流式计数 |
| `e1ae2f5` | `9e907af` | Projection 职责交接背景文档 |
| `d2bcef3` | `84f0911` | 长序列、缓存释放、checkpoint 和索引测试 |
| `8cf2a1a` | `f79649e` | 固定种子事务及历史状态机测试 |
| `256413c` | `426b6ab` | 发布前故障注入与恢复测试 |

未引入 `9640b6c` 的持久化边界草案，也未在本批提取其校正版本 `3a7d870`。
随附 Projection 文档只作交接背景，不授予实施新模块或修改跨层架构的权限。
Agent、Score、Platform 及其独立修复均未重放。

## 防覆盖核验

1. 集成前四条正式交付工作树的 HEAD 与回执一致，全部干净。
2. B1 的 13 个文件与其余三线及协调分支的变更文件交集均为 0。
3. 每个重放提交与对应源提交的 stable patch-id 相同，`-x` 来源记录完整。
4. 候选相对起点恰好改动这 13 个文件，其 Git 内容与源 `256413c` 一致；
   其他路径未变，包括准备阶段文档、公共依赖和工具链文件。
5. 测试后四条交付工作树仍干净；main、origin/main、准备分支和交付/修复引用
   共 11 个受保护引用均未移动。没有 fetch 或 push。
6. 集成前后均重新执行保全脚本 `--verify`：四处遗留工作树及备份
   85/85 原始文件字节与哈希一致，原暂存区仍为空。

完整 SHA、文件清单、命令和日志哈希见
[本批证据](2026-09-21-B1-kernel-evidence.json)。

## 实际验证

以下均在本批源码提交 `426b6ab` 的干净工作树上重新运行，
不是源分支历史结果。Rust/Cargo 使用安装路径下的 `+1.97.1`，
目标平台为 `x86_64-pc-windows-msvc`。
运行前仅在当前命令环境将 `C:/Users/ATOM/.cargo/bin` 加入 PATH。
所有 Cargo 编译显式指定候选内 `.cargo-target/integration-B1`；
首次测试从空构建目录开始，依赖使用既有离线下载缓存，没有借用其他工作树产物。

| 检查 | 本批结果 |
| --- | --- |
| Rust workspace，all-features / locked / offline | 667 passed，0 failed，2 ignored，exit 0 |
| 严格 Clippy，workspace / all-targets / all-features，`-D warnings` | exit 0 |
| 显式 10,000 次 submit/history/checkpoint soak | 1 passed，0 failed，4.72 秒，exit 0 |
| 8 个修改 Rust 文件的 `rustfmt --check` | exit 0 |
| 全仓 `cargo fmt --all -- --check` | exit 1，既有 `session.rs:389` import 换行 |
| 业务增量 `git diff --check` | exit 0 |

workspace 的两个 ignored 用例分别是显式 soak 和旧 Stage 6 私有 scale worker；
本轮随后单独运行 soak，未运行后者。soak 为 debug profile，
其耗时不构成正式性能或内存资格报告。
checkpoint 流式计数、6 个故障恢复用例、默认长序列和 seeded 状态机
均实际包含在 workspace 成功结果中。

全仓 fmt 阻挡路径与共同基线逐字节的 Git 内容一致，本批没有顺带格式化该文件。
Cargo 还提示 test profile 不使用 `panic` 设置，该既有配置警告未在本批调整。
原始日志保存在候选内 `.local-evidence/integration-B1-20260921/`，
属于同机、Git 忽略的验证产物；证据 JSON 记录其哈希，不能当作异机存档。

本批未运行 Workbench/Agent/Score/Platform 测试、Desktop 验证、Node addon 的
产品构建和资格测试、真实断电、MSRV、多平台 CI 或全四线组合验收。
Rust workspace 的 node crate 单元测试不替代 addon 产品验证。
G5 addon 来源和统一开发环境验收仍未关闭。

## 停止点

本批仅形成 Kernel 已纳入的中间候选，不晋升 main，不向开发任务发布公共基线，
不清理旧工作树或未提交内容。
新增两份本批报告并更新候选内协作索引，另作纯文档提交；
测试指向上述源码 SHA，不把后续文档提交说成重新运行过源码测试。

下一批是 B2 Agent 及公共基础，必须保留独立验证修复、
Agent 回归和两份边界文档，并为随后的 Score 三次加固保留完整范围。
本轮停在 B1，不自动重放 B2 或后续批次。
