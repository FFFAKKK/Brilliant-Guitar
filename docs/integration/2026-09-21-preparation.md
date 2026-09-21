# 四线集成准备清单

日期：2026-09-21，Asia/Shanghai。
状态：仅完成隔离工作树和提取清单准备；没有集成业务提交，没有执行组合测试。
本文件及同目录 `2026-09-21-evidence.json` 是本轮快照，不取代用户授权。

## 1. 本轮边界

- 用户只批准第 1 步：建立独立集成区，固定来源，核对重复内容、保留范围和阻挡项。
- 集成准备分支：`codex/integration-preparation-20260921`。
- 工作树：`E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/integration-preparation-20260921`。
- 基线：`269112b2d85e01827e8cb81bdcc5b671afde4303`。
- Git common directory：`E:/desktop/brilliant_ideas/brilliant_guitar/.git`；这是真正共享仓库的 Git Worktree，不是复制仓库。
- 本轮只新增这两份准备文档。业务源码仍是共同基线，不复制主目录未提交文件。
- 不进行 merge、cherry-pick、rebase、push、依赖安装、业务修复、旧工作树清理或 Trellis 创建。
- 不启动其他任务，不派发实现或检查子代理。视觉任务不参与汇报。
- 本小阶段结束后停止。修复、候选集成、合入 main 分别需要后续授权。

## 2. 固定来源

以下四个正式工作树本轮只读核验均干净。完整 SHA、目录、提交顺序见 evidence JSON。

| 工作线 | 分支 | 交付 HEAD | 相对基线变更文件数 | 当前处置 |
| --- | --- | --- | ---: | --- |
| Kernel | `codex/kernel-checkpoint-resource-hardening` | `9640b6c` | 14 | 代码候选截至 `256413c`；最后的文档提交暂缓 |
| Score | `codex/score-changeset-typed-migration` | `717cdc0` | 22 | 基础迁移只保留一份；三次加固完整保留 |
| Plugin Platform | `codex/plugin-session-intent-decoupling` | `7d93aa8` | 61 | 前三个平台增量可评估重放；最后混合提交只做逐 hunk 提取 |
| Agent | `codex/agent-plugin-ownership` | `fe54697` | 50 | 保留本线实现、回归和两份边界文档；携带的公共基础去重 |

本地 `main` 和本地远端跟踪引用 `origin/main` 都是 `269112b`。
没有 fetch，不能把本地远端跟踪引用称为远端服务器的最新状态。
四条线与 main 的 merge-base 均为上述完整基线 SHA。

## 3. 后续候选顺序

以下是提取方案，不是已执行操作，也不是自动执行脚本。
后续批准集成时由总协调独占集成工作树；开发线不互相合并。
每一批完成差异核验和对应验证后停止汇报，不能自动跨入下一批。

| 批次 | 来源提交，按顺序 | 保留范围和约束 |
| --- | --- | --- |
| B1 Kernel | `7b1fcae`、`e1ae2f5`、`d2bcef3`、`8cf2a1a`、`256413c` | runtime 私有实现、故障/状态机/soak 测试及随附文档；Projection 文档不授予实施新模块的权限 |
| B2 Agent 及公共基础 | `42039d9`、`a09915a`、`e961868`、`b8fd69d`、`35f51c5`、`fe54697` | 已带一份 grants 和 Score 基础；保留完整 Agent 回归及边界文档。先解决下述验证缺口，不能视为已通过候选 |
| B3 Score 加固 | `3d71f63`、`8ece0f3`、`717cdc0` | 输入/上下文/结果绑定、只读范围、未请求字段保护、异步前快照；保留三份端口测试中的全部加固用例 |
| B4 Platform 独有增量 | `1200e2c`、`8ea91f8`、`b23878d` | 会话意图/激活、固定 contribution 捕获、startup/bootstrap/host resolver 及对应测试 |
| B5 共享接线与测试适配 | `7d93aa8` 相对 `fe54697` 的选定增量，加上另行批准的修复 | 只提取 resolver 接线和必要测试适配；不得整体 cherry-pick `7d93aa8`，不得整文件覆盖已加固 Score |
| 暂缓文档 | `9640b6c` | 不直接进入架构依据；Kernel 校正现有桌面保存/恢复事实并复核后另行决定 |

B1 与其他线没有变更文件交集，可以独立安排，但不免除最终组合验证。
B2/B3 的中间状态可能仍有旧测试 fixture，不能为了得到绿色结果删除保护用例；
如需要后续批次的接口适配，应报告依赖并停在未验收状态。

### 3.1 重复补丁

本轮用 `git show ... | git patch-id --stable` 再次核验：

| 原提交 | 已重放提交 | stable patch-id | 选定方案 |
| --- | --- | --- | --- |
| `925badc` | `42039d9` | `924b387a558329a2232dc6b745da1d111c6f1dea` | 使用 Agent 链的 `42039d9`，不再应用 `925badc` |
| `20bf15d` | `a09915a` | `720ed264b45f317da759bbc7015ba2348e3851c9` | 使用 Agent 链的 `a09915a`，仅追加 Score 三次加固 |

`git diff --exit-code b880379 b8fd69d --` 退出 0，两个提交的文件树相同。
旧独立副本只留存，不重复引入，不在本轮迁移或删除。
相同 patch-id 不代表最终组合已经通过验证，也不能把不同父树说成完全相同的提交。

### 3.2 文件交集

| 两线 | 相对共同基线的变更文件交集 |
| --- | ---: |
| Kernel / Score、Kernel / Platform、Kernel / Agent | 各 0 |
| Score / Agent | 22 |
| Score / Platform | 22 |
| Agent / Platform | 45 |

交集是审查范围，不是冲突数量。没有在本轮执行试合并或构造组合源码树。

## 4. 混合提交的提取边界

`7d93aa8` 相对其父提交修改 37 个文件。evidence JSON 的
`mixedCommit.files` 对全部 37 个文件给出且仅给出一个处置分类。

### 4.1 可以评估的独有增量

全部路径为仓库根目录相对路径。

| 文件 | 提取范围 | 主责 / 复核 |
| --- | --- | --- |
| `apps/workbench/src/services/workbench-agent-plugin-host.ts` | scoped typed facade 和正式 resolver 接线；先处理校验后覆盖版本的阻挡项 | Platform / Agent、Score |
| `apps/workbench/test/agent-assistant-session.test.ts` | 去掉 snapshot fixture 中已经不存在的 `enabled` 字段 | Agent / Platform |
| `apps/workbench/test/agent-evaluation.test.ts` | typed range result fixture；增加不得走通用 prepare 的断言 | Agent / Score |
| `apps/workbench/test/measure-reference-capability-port.test.ts` | typed `status: "ready"` fixture，不引入纯缩进差异 | Agent / Score |
| `apps/workbench/test/score-measure-index-port.test.ts` | 完整 `ScoreReadPort` 测试适配对象 | Agent / Score |
| `apps/workbench/test/score-read-port.test.ts` | DirectScoreReadAgentPort 直接接收 typed port 的 fixture；与 `717cdc0` 用例合并，不用平台旧文件覆盖 | Score / Agent |

这些“独有”测试适配不改变长期所有权：平台携带的 Agent/Score 测试修改由对应所有者复核，
不是授权平台接管这些模块。

### 4.2 不提取或需要暂缓的内容

- Desktop 的 7 个文件、Workbench client/host bridge 与 Score 基础及当前 Score HEAD 相同，不从平台重复提取。
- 三个 Score service 在平台中仍等同 `20bf15d`，不包含三次加固；两个 edit/changeset 测试也仍是旧版，拒绝覆盖。
- Agent action runtime、measure reference service、Agent changeset adapter 及 measure reference service 测试与 Agent 候选相同，不重复提取。
- 多个 Agent 生产文件的差异只是空行或 unused import 删除；不借集成做无关整理。若后续实际类型检查证明必须删除 import，再由 Agent 作单独、可解释的改动。
- `apps/workbench/src/workbench-app.tsx` 相对 `fe54697` 仅删除一个空行。固定会话装配和 next-launch 语义已经在 Agent 候选，不列为平台独有功能。
- `docs/plugin-platform-ui-contribution-and-session-freeze-plan-v1.md` 的平台版本缺少 Agent action/workflow 已落地说明；保留 Agent 的说明，不提取该删除。
- `apps/workbench/test/agent-prepared-mutation.test.ts` 的平台版本丢失 fail-closed 用例；保留 Agent 版本，错误消息文字不作为必要集成增量。
- `apps/workbench/test/agent-plugin-runtime.test.ts` 将 dispose 后 `beginRun() === null` 改为 `recovery.items.length === 0`，两者不是同一性质。保留不得继续运行的验证，不直接用替换断言作为通过证据；恢复列表是否也须清空交 Agent 复核。

### 4.3 必须保留的 Agent 回归和文档

- `apps/workbench/test/agent-action-runtime.test.ts`：平台提交中整份缺失。
- `apps/workbench/test/agent-run-core.test.ts`：保留恢复审批绑定持久 workflow、拒绝替换请求绕过身份的用例。
- `apps/workbench/test/agent-workflow-runtime.test.ts`：保留只读目录、固定 workflow scope/operation/range budget 用例。
- `apps/workbench/test/agent-prepared-mutation.test.ts`：保留 typed prepare 缺失时 fail-closed 用例。
- `docs/agent-plugin-ownership-and-assembly-plan-v1.md`。
- `docs/agent-typed-port-orchestration-boundary-v1.md`。

## 5. 阻挡项与后续主责

下表仅分配建议，不是本轮派发。修复授权后每项独立提交，结束即停。

| 编号 | 问题 / 当前证据 | 主责 | 后续关闭条件 |
| --- | --- | --- | --- |
| G1 | resolver 验证 frozen grant 后，host adapter 又用调用者的 `pluginVersion` 覆盖结果身份 | Platform，Agent 复核消费者 | 身份来源唯一；不匹配必须拒绝，不能静默伪装成已校验身份；版本匹配/不匹配、未激活插件和 scope 回归通过 |
| G2 | 平台 `116/116` 回执命令包含在 `7d93aa8` 中不存在的 `agent-action-runtime.test.ts` | Platform | 说明原测试运行树与 SHA，补齐真实命令、文件清单和结果；最终候选上重新运行。当前只能记历史报告待核实 |
| G3 | Agent 当前 HEAD 缺完整类型检查/全量验证；平台携带了测试适配，但也删掉保护用例和替换 dispose 断言 | Agent，Score 复核 typed fixture | 保护用例保留；在授权候选树运行生产/测试类型检查和完整 Agent 回归；明确 dispose 与续跑语义 |
| G4 | Kernel `9640b6c` 漏审已有 Desktop 保存/恢复，将 durable save 当成缺失并建议 canonical encoder | Kernel，Score 复核桌面事实 | 校正文档为现有 lossless `.bgp.json`、atomic write、recovery 链路；不重复建设，不宣称已通过断电资格 |
| G5 | Score 历史 addon 有哈希但 manifest 没有来源 Git SHA | 集成负责人 | 最终组合源码重新构建 addon，记录源码 SHA、命令、产物 SHA-256 和使用该产物的测试结果 |
| G6 | Agent 文档第 3、4 行含既有 trailing whitespace，导致其相对基线 `git diff --check` 失败 | Agent | 后续单独处理 Markdown 换行格式；不在本轮改动源分支 |

G4 可通过继续暂缓文档避免阻挡代码候选；不是要求先实现新的 crash/persistence 系统。
G1 若引出公共契约或生命周期策略改变，先向用户说明并取得决定，不能以“集成修复”为名扩架构。
未完成的 durable typed commit、旧设置迁移、Workflow IR、Projection、Playback、Guitar 等都不是本阶段顺带工作。

## 6. 验证证据等级

本轮独立完成的是 Git/文件审计，不是功能验证。

| 工作线 | 历史报告 | 本轮如何记账 |
| --- | --- | --- |
| Kernel | `256413c` workspace 667 passed / 2 ignored，严格 Clippy 通过；`9640b6c` 只有文档 | 历史源码验证，未重跑；全仓 fmt 的既有换行问题仍在 |
| Score | `717cdc0` 定向 97/97、全量 572/572、两类类型检查通过 | 历史报告，未重跑；addon 来源 SHA 缺失 |
| Agent | `fe54697` 聚焦 22/22；命令/逐文件清单未完整保留，类型检查及部分测试依赖阻塞 | 不视为当前版本完整验收；不能借用旧副本 160 项或旧 Score 483 项结果 |
| Platform | 两类类型检查报告通过、聚焦 116/116 | 类型检查仍是历史报告；116 的命令/提交内容不一致，待核实。全量/native/Rust 验证未完成 |

本轮相对共同基线 `git diff --check`：Kernel、Score、Platform 通过；
Agent 仅上述两行 trailing whitespace 报错。没有修复或隐藏它们。

后续验收必须基于每批真实源码状态，不仅检查 Git 能否自动合并：

1. 核对新增提交文件范围、公共合同、保留测试和重复补丁。
2. 实际具备依赖后运行生产/测试类型检查，以及本批涉及的端口、平台和 Agent 回归。
3. 在最终组合提交上执行 Rust workspace tests、严格 Clippy，重建 Native addon，验证 Desktop 和 Workbench 全量。
4. 保存完整命令、退出码、源码 SHA、产物哈希及环境阻塞；没有执行的项目不得记为通过。
5. 真实断电、MSRV、多平台等未执行资格继续明确列为未验证，不由常规测试结果推导。

已确认的现有验证入口包括 `npm --prefix apps/workbench run typecheck`、
`node node_modules/typescript/bin/tsc --noEmit -p apps/workbench/tsconfig.test.json`、
`npm --prefix apps/workbench test`、`npm run desktop:check`、`npm run desktop:test`、
`cargo test --workspace --all-features --locked --offline` 和
`cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings`。
这些命令在本准备阶段均未运行；依赖不存在时先报告，不擅自复制旧 addon 冒充新构建。

## 7. 主目录保护和后续交付规则

- 主工作区仍在 main；初始 21 modified、11 untracked，暂存区为空。
- 对这 32 个文件按路径排序，以原始文件字节 SHA-256 建立内容清单，再对压缩 JSON 的 UTF-8 字节求 SHA-256：
  `a71349a256d3390fcdb869f173aac5cc820879eae3f58f2103bb6ec58d9fbcfa`。
- 清单算法与初始文件列表见 evidence JSON。收尾按同算法核对，不用文件相似或已提交推断可以删除。
- 主目录 `docs/repository-workspaces.md` 已有本轮之前的未提交内容和旧快照，本阶段不修改它；也不让旧状态覆盖本清单的固定来源。
- 原工作树、旧 Agent 副本、视觉工作区均保留，不做清理或迁移。
- 后续提交前必须核对实际 worktree、branch、HEAD 和 index，按具体文件暂存并审查 staged diff，不使用 `git add .` / `git add -A`。
- 共享文件和契约采用单一主责；另一条线提供需求或评审，不复制生产实现。冲突不使用整文件覆盖或强制 ours/theirs。
- 若试集成或验证失败，保留候选和证据并停止；不以 reset/清理隐藏失败，不修改源分支。
- 每个后续小阶段完成即在对应任务说明改动、验证和缺口；大阶段在总协调统一报告，用户确认后才能继续。
- 后续集成结果即使通过也不能直接更新 main：主目录混合改动归属处理和 main 晋升需要另行授权。

本轮收尾：只提交准备文档，保留全部源分支和主目录内容，停在第 1 步。
