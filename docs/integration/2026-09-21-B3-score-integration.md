# B3 Score 三次加固集成收口

日期：2026-09-21，Asia/Shanghai。
本批由总协调直接执行，用户批准继续后只实施 B3；
不启动其他任务或子代理，不推进插件平台或 main 晋升。

## 候选与范围

- Worktree：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-candidate-20260921`。
- 分支：`codex/integration-candidate-20260921`。
- 起点：B2 收口 `c1ae2ba86882be2849e0ef5008a1f4badaa07428`。
- 本批验证源码：`e4b113f62f7f5472af554c7076d1b16541d63c2f`。
- Score 来源固定为 `717cdc08eba0ecd6c9232baffa1960acbb855fdf`。

使用 `git cherry-pick -x` 按原顺序重放，不重复引入 B2 已有的 Score 基础。

| 原提交 | 候选提交 | 保留内容 |
| --- | --- | --- |
| `3d71f63` | `8e4d4f8` | typed port 输入、准备上下文及结果边界校验 |
| `8ece0f3` | `1c44d84` | 请求结果绑定、未请求字段不变、workspace 防覆盖和 bounded read |
| `717cdc0` | `e4b113f` | ChangeSet input 与 document precondition 的异步前快照 |

全部无冲突，没有手工改动业务源码或用任一整文件覆盖另一线成果。
三对 stable patch-id 一致，来源 trailer 完整。

## 共享文件保留证明

本批只改变三份 Score service 和三份对应测试，共六个文件。
集成前这六条路径与 Score 基础的唯一差异是
`apps/workbench/test/score-read-port.test.ts` 中 B2 的 DirectScoreReadAgentPort fixture。

Git 在前两个提交中自动合并该测试文件。自动合并后另行验证：

1. 三份生产 service 和 edit/change-set 测试共五个文件与最新 Score 源完全一致。
2. 使用本地 TypeScript AST 唯一定位
   `Direct score tool adapter prefers the typed port and preserves Agent invocation identity`
   测试语句，其文本与 B2 起点逐字一致。
3. 从双方 Git blob 文本中排除该唯一语句后，其余内容与 `717cdc0` 逐字一致。
   因而 Score 全部新增断言和 B2 的 typed fixture 同时保留。
4. 本批改动路径恰好等于 Score 三次加固的六条路径。
   Kernel、Desktop、Agent、Platform、公共 contracts、历史证据、manifest 和锁文件未改动。

具体 SHA、文件列表及比较哈希见 [B3 证据](2026-09-21-B3-score-evidence.json)。

## 实际验证

以下均在 `e4b113f` 的干净候选树重新执行，不引用源分支历史结果。
使用 B2 独立安装的候选依赖，没有复制或重装依赖、修改锁文件或借用旧 addon。
Node v24.15.0，npm 11.12.1，根目录 TypeScript 5.9.3，Workbench TypeScript 7.0.2。

| 检查 | 本批结果 |
| --- | --- |
| 三个 Score 端口测试文件 | 97 passed，0 failed，0 skipped |
| Agent 主回归扣除上述三个文件，24 文件 | 177 passed，0 failed，0 skipped |
| 邻接回归，8 文件 | 56 passed，0 failed，0 skipped |
| 宿主边界，7 文件 | 35 passed，0 failed，0 skipped |
| Workbench 生产类型检查，含本地 TypeScript host build | exit 0 |
| Workbench TS 7.0.2 测试类型检查 | exit 0 |
| 根目录 TS 5.9.3 生产、测试类型检查 | 两项 exit 0 |
| 本批 `git diff --check` | exit 0 |

四份测试清单互不重复，共 42 个文件、365 项测试；
Score 97 项包含 40 个嵌套 context 子测试，不把它们重复计数。
命名文件均在执行前检查存在，覆盖全部 27 个直接导入 `src/agent/` 的测试文件。
初始和最终保全核验均确认 85 个遗留文件与备份一致，原 index 为空；
11 个受保护引用未移动，四条交付及 Agent 修复工作树始终干净。

## 限制与停止点

本批没有重跑 Rust workspace、Clippy、soak 或 Desktop Rust 测试：
分别保留 B1、B2 历史结果，已核验相关源码和锁文件没有变化。
没有运行 Workbench 全量、Native addon 重建与来源资格、UI/E2E、Desktop 打包、
MSRV、多平台 CI、真实断电或正式性能资格。G5 和完整开发环境验收仍未关闭。
既有全仓 fmt 问题未修改；不能把本批测试结果作为全部四线组合验收。

最后只新增本批两份报告并更新协作索引，另作纯文档提交。
功能测试指向上述源码 SHA，不称为在随后文档提交上重新运行。
main、原分支和旧工作树保留；不发布共同开工基线，本批到此停止。

下一批 B4 评估 `1200e2c -> 8ea91f8 -> b23878d` 平台独有增量。
B5 混合接线、resolver 身份修复和组件范围修复仍须单独处理；
禁止整支合并平台旧链或用其中的旧 Score service/测试覆盖当前六文件。
