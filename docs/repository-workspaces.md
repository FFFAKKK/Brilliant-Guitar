# 协作工作区与阶段索引

## 2026-09-22 最新决定

用户已授权先保全旧改动并将现有集成成果快进到 main，再从固定 main SHA
创建独立审计任务，配置为 `gpt-5.6-sol / xhigh`。
详见 [统一审计基线决定](integration/2026-09-22-unified-audit-baseline.md)
和 [关闭故障调查](integration/B9-close-lifecycle-investigation.md)。
这是带已知缺陷的统一源码基线，不代表产品验收通过，也不自动恢复四线开发。
下面 B8 阶段的“尚未授权迁移”等表述保留为当时历史状态，受本次决定覆盖。
迁移后的完整 SHA、保全提交和 main 实测结果由总协调回执提供。

## B8 历史快照

更新日期：2026-09-21，Asia/Shanghai。
本次完成 B8 Kernel 边界文档纳入和 workspace fmt 收口；仍待环境验收和 main 迁移，未更新 main。
以下提交和证据是固定快照，不代表已检查各任务的实时运行状态。
原主工作区同名文件的未提交记录保留，不用本文件覆盖。

## 当前阶段

四线交付、独立修复、遗留审计和备份已有记录。B1 Kernel、B2 Agent 及公共基础、
B3 Score 加固、B4 插件平台独有增量、B5 获审接线和修复已集成并完成各自批次验证，
**统一业务源码候选尚未完成四线组合验收**。
B6 在 `a391a86` 重建三种 addon，Workbench 615/615、Desktop Rust 65/65 和
桌面 release 构建通过。B7 在 `0f9b74a` 固定历史输入后，根目录全量为
138 文件、924 passed / 0 failed / 2 skipped，关闭 B6 的 14 项失败；
B8 在 `a380262` 纳入已校正的 Kernel 持久化边界，并通过 workspace fmt、
Rust 667 passed / 2 ignored、Clippy 和 Desktop Rust 65/65。
尚待可重复环境预检和真实启动验证，不能宣布正式环境全绿。
因此，下一轮共同开发基线尚未发布，不能让各任务自行拉取旧 main 后就宣布环境一致。

| 项目 | 已有证据 | 尚未完成 |
| --- | --- | --- |
| Kernel | B8 workspace 667 passed / 2 ignored、fmt、Clippy 通过；校正边界 `3a7d870` 已定向纳入，未引入旧 `9640b6c` 草案 | 正式环境整体验收；新持久化架构未批准 |
| Score | B3 三次加固保留；B6 Workbench 全量 615/615，Desktop Rust 65/65 | 正式环境整体验收；自动 addon manifest 的 Git 来源记录机制 |
| Agent | B2 交付和修复保留；B5 resolver 接线保留；B6 Workbench/桌面测试通过 | 整体验收及真实启动验证 |
| Plugin Platform | B4 独有增量、B5 身份及组件范围修复保留；B6 Workbench 全量通过 | 整体验收及真实启动验证；未整支合并混合交付 |
| 遗留内容 | 审计 `430a920`、保全 `89c433b`；B8 再次复核 85/85 一致，11 个保护引用未变；main 32 项分类未变 | 原目录迁移前须批准保全处置；C7 不纳入本次 main |
| 共同环境 | 三处 npm 依赖独立锁定离线安装；B6 产物、B7 根目录全量、B8 Rust/Desktop 回归和 fmt 有证据 | 可重复开工预检和真实启动；随后获批迁移 main 并验收原目录 |

证据入口：

- [四线提取顺序与保护范围](integration/2026-09-21-preparation.md)及[固定来源](integration/2026-09-21-evidence.json)。
- [遗留归属审计](integration/2026-09-21-legacy-audit.md)及[逐文件处置](integration/2026-09-21-legacy-disposition.json)。
- [备份与组件范围修复](integration/2026-09-21-preservation-and-component-scope.md)及[实际验证记录](integration/2026-09-21-component-scope-evidence.json)。
- [B1 Kernel 集成报告](integration/2026-09-21-B1-kernel-integration.md)及[重放与验证证据](integration/2026-09-21-B1-kernel-evidence.json)。
- [B2 Agent 集成报告](integration/2026-09-21-B2-agent-integration.md)及[重放与验证证据](integration/2026-09-21-B2-agent-evidence.json)。
- [B3 Score 集成报告](integration/2026-09-21-B3-score-integration.md)及[重放与验证证据](integration/2026-09-21-B3-score-evidence.json)。
- [B4 平台集成报告](integration/2026-09-21-B4-platform-integration.md)及[重放与验证证据](integration/2026-09-21-B4-platform-evidence.json)。
- [B5 接线与权限集成报告](integration/2026-09-21-B5-bindings-integration.md)及[适配与验证证据](integration/2026-09-21-B5-bindings-evidence.json)。
- [B6 正式环境首轮核验](integration/2026-09-21-B6-environment-verification.md)及[构建、失败和保全证据](integration/2026-09-21-B6-environment-evidence.json)。
- [B7 历史测试输入收口](integration/2026-09-21-B7-historical-test-inputs.md)及[固定来源、全量和保全证据](integration/2026-09-21-B7-historical-test-evidence.json)。
- [B8 边界与格式收口、main 就绪路径](integration/2026-09-21-B8-baseline-gates.md)及[实际验证证据](integration/2026-09-21-B8-baseline-evidence.json)。

这些文件分别记录当时状态，不回写旧报告冒充重新验证。独立分支通过不等于组合通过。

## 职责和交付位置

表中 `R` 表示 `E:/desktop/brilliant_ideas/brilliant_guitar`；
`C` 表示 `C:/Users/ATOM/.codex/worktrees`。均为本机路径简写。

| 工作线 | 主责 | 原交付工作树 | 分支 / 固定 HEAD |
| --- | --- | --- | --- |
| Kernel | Rust 事务、历史、checkpoint、资源边界及对应测试 | `C/4708/brilliant_guitar` | `codex/kernel-checkpoint-resource-hardening` / `9640b6c65f55c326d4b016919d42a27b123162c3` |
| Score | typed Read/Edit/ChangeSet、prepare、Desktop Score 接线 | `C/547b/brilliant_guitar` | `codex/score-changeset-typed-migration` / `717cdc08eba0ecd6c9232baffa1960acbb855fdf` |
| Agent | 编排、workflow 执行、预算、审批、回执、重放和恢复 | `C/agent-plugin-ownership/brilliant_guitar` | `codex/agent-plugin-ownership` / `fe546976d00a6f2a76da16efbfced4c852886bb1` |
| Plugin Platform | manifest、SDK、grants、contribution 归属、固定会话激活和宿主装配 | `C/71fa/brilliant_guitar` | `codex/plugin-session-intent-decoupling` / `7d93aa81391cca120c5f33e36deb2b86fcc6c071` |
| 总协调准备快照 | 依赖、职责交接、证据、集成队列和阶段汇总 | `R/.worktrees/integration-preparation-20260921` | `codex/integration-preparation-20260921`；后续候选位置见下 |

准备分支现固定于 `9aba3cbe90ab0a18ce4dd651fc7d19c76bccd9be`，不随候选移动。
后续集成使用 `R/.worktrees/integration-candidate-20260921`，
分支 `codex/integration-candidate-20260921`；本轮索引和证据随候选提交。
B6 业务组合与产物来源 SHA 为 `a391a8636d020e02a6bc94c5116adfacaf732e8d`，
包含 B1 至 B5 业务增量；B7 测试修复及根目录全量验证 SHA 为
`0f9b74a263e5fe633c207e63adb0f9198819e7bc`，业务和构建输入未变。
B8 边界文档及测试 import 格式修复为 `a380262e7ed1fb31a0763b6f33dbc6b88266c401`；
本批重新执行 Rust/Desktop 回归，未重新构建 release addon，也未更改业务行为。
这些仍不是新开发任务的公共开工基线。
身份修复在候选 `510f968` 中包含手工接线适配，不能宣称与来源补丁等价；
组件范围修复在候选 `863e9cb` 中按原补丁重放，详情见 B5 报告。

独立修复位置保留，不作为整支可合并或新任务开工基线：

| 用途 | 工作树 | 分支 / 固定 HEAD |
| --- | --- | --- |
| Agent 验证修复 | `R/.worktrees/agent-verification-20260921` | `codex/agent-verification-20260921` / `cb918d0a86e7f5874b1efeb3059232d93dbad173` |
| Kernel 文档校正 | `R/.worktrees/kernel-persistence-boundary-correction-20260921` | `codex/kernel-persistence-boundary-correction-20260921` / `3a7d87074d0a833576bd7e908ce26a249682c38c` |
| 平台组件范围修复 | `R/.worktrees/plugin-bindings-identity-fix-20260921` | `codex/plugin-component-projection-scope-20260921` / `ec85c6b84ddb332985ecb44bcaf9ce5018288d8a` |

最后一行的目录名不是分支名；旧身份修复分支
`codex/plugin-bindings-identity-fix-20260921` 仍保留于
`0da94996def194ebe0b9fe159b3642398887115c`。
原独立 Agent 副本 `R/.worktrees/agent-runtime-unification-copy` 有自己的 `.git`，
不是共享仓库的 Worktree，继续留存但不重复引入。

职责按具体变更确定，不授予任何任务整个 `apps/workbench` 或 services 目录的所有权。
共享文件一次由一个主责任务修改，其他任务提交需求或评审；跨模块实现不能顺带承接。
Projection Composer、Playback、Guitar、功能编辑器的新工作尚未分配实施主责。
总协调不自动成为这些业务模块的实现所有者。

插件任务上下文至少包含本索引、四线提取清单、平台独立修复证据，以及交付分支内的
`docs/plugin-platform-ui-contribution-and-session-freeze-plan-v1.md`；
Agent 的两份 ownership/typed-port 边界文档也必须在集成时保留。
旧规划是背景，不替代明确的本阶段范围，不创建 Trellis 任务。

## 相同基线和环境，独立工作区

统一的是公共接口和基线、按包固定的依赖、工具链与验证方式，
不是让任务在同一个目录里编辑，也不是要求开发中的 HEAD 永远相同。
各线允许在共同基线上产生各自获准的增量；公共接口变更须重新协调。

| 必须对齐 | 必须隔离 |
| --- | --- |
| 本阶段验收基线的完整 Git SHA 和合同版本 | 每个任务自己的 Worktree、分支和暂存区 |
| 同一包的锁文件及依赖解析结果 | 各自的可写依赖安装和构建输出目录 |
| Node/npm、Rust/Cargo、必要原生构建工具及目标平台 | 服务端口、测试临时目录、数据库和运行状态 |
| 配置项的语义、fixture、验证命令及执行目录 | 本地配置值和凭据，不在报告中收集秘密 |
| addon 的实际源码状态、构建命令、平台和哈希 | 不引用另一个任务正在覆盖的 `.node` 文件 |

Worktree 隔离不能消除语义冲突，也不会自动安装相同环境。
可共享工具安装和包下载缓存，但不能把另一个任务的可写 `node_modules`、
`target` 或运行数据当作本任务的验收环境。

本轮只读核对的仓库约束：

- `rust-toolchain.toml` 固定 Rust `1.97.1`，包含 rustfmt/clippy。
- 根目录和 Workbench 的锁文件分别固定 TypeScript `5.9.3`、`7.0.2`。
  这是按包不同的版本，不等于版本冲突，也不授权直接升级或统一二者。
  验证必须记录编译器路径、版本和 cwd，不能用任意解析到的 `tsc` 替代。
- 根目录、Workbench、Desktop 有各自的 npm 锁文件；不能只安装根依赖就称环境完整。
- 现有 C6 记录使用 Node `v24.15.0`，但没有完成干净依赖安装或全量组合验证。
  此历史版本记录不能直接等同于全项目已批准的环境基线。
- 旧 addon 有内容哈希但缺来源提交记录。后续组合验收须重建并记录准确来源，
  不能只复制旧产物或设置 `BRILLIANT_INTEGRATED_ADDON_PATH` 就关闭来源缺口。

后续环境验收需先明确受支持的平台组合和工具版本，按同一基线锁文件准备各自依赖，
禁止任务自行升级公共依赖或修改锁文件来绕过失败。
任务开工检查至少回报实际路径、分支、base SHA、工具版本、锁文件一致性、
配置/产物来源、对应模块类型检查和冒烟结果。缺少证据时记为未就绪。
本候选 B6 补齐了 Desktop CLI 安装，并完成新 addon、Workbench 全量、Desktop Rust
和桌面 release 构建。三处 npm 安装仍禁用安装脚本；没有生成安装包或做真实 GUI 验收。
B7 把必要的历史工作流输入绑定到固定 Git 快照，根目录全量 924 passed / 0 failed /
2 skipped；没有批量搬运隐藏任务目录。Git 历史对象和 `pwsh` 仍是测试前提，
缺少对象的浅克隆或源码压缩包不能代替已验证环境，后续开工预检须明确检查。
本轮 addon、桌面产物和锁文件 hash 与 B6 一致，没有重新构建或借用其他工作树产物。
统一版本约束补齐、可重复的产物来源和开工预检、完整环境验收仍待后续阶段。
B8 已关闭 workspace fmt 和 Kernel 校正边界文档两项门槛。
下一步是可重复环境预检及隔离真实启动，随后才能申请 main 迁移验收；
正式商业发布的断电、多平台、签名和性能资格不冒充已通过，也不自动扩张为本次开发基线门槛。

## 后续开发和同步规则

当前本地 `main` 与本地 `origin/main` 引用为
`269112b2d85e01827e8cb81bdcc5b671afde4303`；没有 fetch，不代表服务器最新状态。
主目录保留 21 modified、11 untracked 的遗留快照，暂存区为空。
这些内容已经保全，不因此自动获得清理或覆盖许可。
本轮确认 main 是 `a380262` 的祖先，保持该条件时可受控快进。
推荐的主目录处置是获批后把仅 32 项旧改动保存到单独历史保全分支，
保留原始字节备份，再切回 main 快进并验收原目录依赖、产物、启动和干净状态。
具体停止条件见 B8；本轮未创建该分支或实施迁移。

1. 总协调在授权后分批组合候选，每批检查差异和测试后停止报告。
   保留 Score `3d71f63 -> 8ece0f3 -> 717cdc0`、Agent 回归及边界文档；
   平台混合提交只提取获审范围，身份修复和 `ec85c6b` 单独纳入。
2. 在组合源码上验证统一环境、重建可追溯 addon、执行组合测试。
   形成固定候选 SHA 后汇总大阶段报告。技术验证不自动授予 main 晋升权限。
3. 用户批准后另行处理主目录遗留内容和 main 晋升。旧文件不能直接清掉或
   用候选整树覆盖。获准的新开发基线通常是晋升后的 main 固定 SHA；
   若用户选择已验收但未晋升的候选，必须明确记录，不能混用多个基线。
4. 下一阶段各任务从同一个已批准 SHA 创建自己的 `codex/<module>-<phase>`
   分支和 Git Worktree，检查环境后仅做本线增量。当前尚无这个批准 SHA，
   不从旧 main、混合平台分支或别人的运行目录自动开工。
5. 已在开发中的分支先报告并提交其拥有的改动，再安排基线更新。
   不盲目 pull/reset/rebase。上一阶段已交付时优先从新基线另开阶段分支，
   保留原分支和回执；未交付增量如何迁移须逐项确定。
6. 后续公共基线更新由总协调发布固定 SHA、接口变化和验证要求。
   各任务在小阶段边界接收，不在运行中的开发/测试目录里后台自动更新。

同仓库的 Worktree 共享 Git 对象和引用，无须通过 `git pull` 才能获得本地 main 的文件。
在功能分支执行 `git pull origin main` 会把获取后的 main 按配置合并或变基进当前分支，
它不是无副作用的“同步环境”命令。远端取回、候选集成和任务基线切换应分开执行。
统一候选出来前如需单模块提前续做，必须另行授权，明确临时基线及依赖，
不能把它宣布为全项目公共基线或顺带更改跨模块架构。

## 交接和报告

每个任务下一阶段的交接单必须明确：

- 唯一主责、worktree、branch、完整 base SHA 和环境验收记录。
- 允许修改的文件或共享文件 hunk、不做的事项、依赖与跨线交接对象。
- 本阶段验收命令、交付条件和停止点。
- 交付时的完整 HEAD、提交顺序、文件范围、未提交状态和未验证项。

提交前审查具体文件和 staged diff，不用 `git add .` / `git add -A`；
提交仅进入本任务分支。开发线不互相整支合并，不自行写入或推送 main。
冲突逐 hunk 处理，不能用整文件覆盖或一概 ours/theirs 消除冲突。

小阶段完成后，各任务报告分别做了什么、测试和缺口，并停止继续实施。
大阶段由总协调汇总后交用户决定，不能自动跨到下一阶段。
**Kernel 同样必须报告。** 唯一免除该汇报流程的是指定视觉设计任务
`01a0b569-4eb2-7ae2-98ee-3e337d8c9ab0`，不扩大为所有前端工作；
视觉任务仍须遵守 Worktree 隔离、文件归属和共享接口边界。

本轮沿用隔离候选完成 B8 边界文档和 fmt 修复，并在固定源码重跑 Rust/Desktop 回归；
保留 B6 release 产物及其原始来源。没有更新 main、修改源工作区或清理旧目录。
没有向任务发送开工指令，也没有核验其当前是否空闲。
B8 小阶段收尾即停；后续依次处理环境验收、获批的 main 迁移及原目录验收。
按用户要求，环境整合完成前不从临时候选恢复四线开发；main 晋升和遗留处置另行报告决定。

## 2026-09-12 历史归档

以下保留当时记录，其中 master、活跃入口和登记数量均为历史状态，不代表当前安排。

本次采用原地归档：旧目录和分支保留，不代表仍需继续执行其中的历史任务。完整恢复包位于 `.repo-archive/2026-09-12/`。

2026-09-12 主线再次整合：`master` 已包含内核 `f9ec44b`；保留三处活跃入口，清理了两条已不存在的临时目录登记，现在共有 53 条 worktree 登记。所有实际目录和分支保留，下面的历史表仍用于追溯，不代表当前登记数量。

### 当时活跃工作区

| 用途 | 分支 | 目录 |
| --- | --- | --- |
| 集成主线 | `master` | 项目根目录 |
| 内核后续开发入口（截至 f9ec44b 已合入主线） | `codex/kernel-commercial-completion` | `.worktrees/kernel-commercial-completion` |
| UI 设计 | `codex/ui-design` | `.worktrees/ui-design` |

### 保留的历史工作区

下表是第一次整理时的归档状态。其两条 `%TEMP%` 失效登记已在后续主线整合时用 `worktree prune` 清理；执行前确认目录不存在、预览仅包含这两项，且对应提交仍是 master 的祖先。清理日志在 `.repo-archive/2026-09-12/kernel-integration/worktree-prune.log`。历史来源行继续保留。

| 原工作区 | 提交 | 原分支/状态 |
| --- | --- | --- |
| `C:/Users/ATOM/.codex/worktrees/03cd/brilliant_guitar` | `1f3f606` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/0589/brilliant_guitar` | `063b332` | `codex/rkp-1-codec-linear-bound-repair` |
| `C:/Users/ATOM/.codex/worktrees/0bf9/brilliant_guitar` | `78ab6cf` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/39b3/brilliant_guitar` | `e81c739` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/3ba1/brilliant_guitar` | `f82fe36` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/3dcf/brilliant_guitar` | `6073b2a` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/439f/brilliant_guitar` | `b393b5b` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/506e/brilliant_guitar` | `7b1c0e3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/6cac/brilliant_guitar` | `0c561d1` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/7082/brilliant_guitar` | `bb292a3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/7970/brilliant_guitar` | `65fef62` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/86cf/brilliant_guitar` | `463c851` | `codex/brilliant-guitar-architecture-v2-authority-sync` |
| `C:/Users/ATOM/.codex/worktrees/c4c3/brilliant_guitar` | `37ac1ad` | `codex/rkp-2-stage-6-eol-audit-return-reentry-planning` |
| `C:/Users/ATOM/.codex/worktrees/d00c/brilliant_guitar` | `0c561d1` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/dcee/brilliant_guitar` | `bb292a3` | `detached` |
| `C:/Users/ATOM/.codex/worktrees/eecb/brilliant_guitar` | `b619f24` | `detached` |
| `C:/Users/ATOM/AppData/Local/Temp/brilliant-guitar-k1-p1-repair` | `30894e2` | `codex/k1-1-p1-repair（目录原已不存在）` |
| `C:/Users/ATOM/AppData/Local/Temp/rkp0-audit-9bc5390-autocrlf` | `9bc5390` | `detached（目录原已不存在）` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/brilliant-guitar-architecture-reset-v2` | `ea574ec` | `codex/brilliant-guitar-architecture-reset-v2` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/core-rust-runtime-performance-remediation` | `5e15995` | `codex/core-rust-runtime-performance-remediation` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/core-vnext-extensibility-reservation-review` | `7467a27` | `codex/core-vnext-extensibility-reservation-review` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-2-official-module-sdk-frozen-assembly` | `302dafe` | `codex/cvn-2-official-module-sdk-frozen-assembly` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-4-part-staff-voice-lifecycle` | `7ad1ff1` | `codex/cvn-4-part-staff-voice-lifecycle` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-5-range-atomic-batch-planning-base` | `d22126c` | `codex/cvn-5-range-atomic-batch-planning-base` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-5-range-operations-explicit-atomic-batch` | `38afdc3` | `codex/cvn-5-range-operations-explicit-atomic-batch` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-6-unified-planning-base` | `d521a61` | `codex/cvn-6-unified-planning-base` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-7-accepted-baseline` | `38afdc3` | `detached` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/cvn-7-core-vnext-final-qualification` | `b21540f` | `codex/cvn-7-core-vnext-final-qualification` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-acceptance-archive-closure` | `c73e213` | `codex/rkp-2-e3-acceptance-archive-closure` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-acceptance-state-projection` | `f27daf7` | `codex/rkp-2-e3-acceptance-state-projection` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-law` | `0c561d1` | `codex/rkp-2-stage-6-e3-workspace-law-final-state-projection-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/e3-law-acceptance-archive-closure` | `65debd5` | `codex/rkp-2-e3-law-acceptance-archive-closure` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/gd-0-independent-acceptance-review` | `ebd8075` | `codex/gd-0-independent-acceptance-review` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/k1-6-core-kernel-integration-gate` | `4e5612b` | `codex/cvn-3-document-factory-measure-lifecycle` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/post-core-official-plugin-product-roadmap` | `c68fcc6` | `codex/post-core-official-plugin-product-roadmap` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1-post-archive-contract-repair` | `b5d6300` | `codex/rkp-1-post-archive-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1a-acceptance-archive-stage6-integration-closeout` | `782431d` | `codex/rkp-1a-acceptance-archive-stage6-integration-closeout` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-1a-public-json-property-cap-scale-compatibility-repair` | `0837427` | `codex/rkp-1a-public-json-property-cap-scale-compatibility-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-cross-platform-full-test-runner-contract-repair` | `9cdc9d3` | `codex/rkp-2-cross-platform-full-test-runner-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-indexed-live-score-store-implementation` | `6d0956c` | `codex/rkp-2-indexed-live-score-store-implementation` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-indexed-live-score-store-load-encode-parity` | `53646c9` | `codex/rkp-2-indexed-live-score-store-load-encode-parity` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-part-owner-wire-contract-repair` | `1bea1b4` | `codex/rkp-2-part-owner-wire-contract-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-runner-event-coverage-planning-repair` | `c69d7b7` | `codex/rkp-2-runner-event-coverage-planning-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-acceptance-archive-integration-closeout` | `b3850a4` | `codex/rkp-2-stage-6-acceptance-archive-integration-closeout` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-eol-audit-return-planning-repair` | `9da9d03` | `codex/rkp-2-stage-6-eol-audit-return-planning-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-eol-portability-prerequisite` | `1f3f606` | `codex/rkp-2-stage-6-eol-evidence-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-private-scale-evidence-seam-repair` | `d14d731` | `codex/rkp-2-stage-6-private-scale-evidence-seam-repair` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-s6-2-evidence-consumption` | `c3c4d19` | `codex/rkp-2-stage-6-s6-2-evidence-consumption` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-s6-2-fresh-evidence-consumption` | `51dbabd` | `codex/rkp-2-stage-6-s6-2-fresh-evidence-consumption` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-2-stage-6-semantic-canonical-authority-amendment` | `4ad2377` | `codex/rkp-2-stage-6-semantic-canonical-authority-amendment` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-3-transaction-overlay-changeset-planning` | `46a684c` | `codex/rkp-3-transaction-overlay-changeset-planning` |
| `E:/desktop/brilliant_ideas/brilliant_guitar/.worktrees/rkp-4-history-snapshots-events-replay-planning` | `902eacd` | `codex/rkp-4-history-snapshots-events-replay-planning` |

每个原本的本地分支均有 `archive/2026-09-12/<原分支名>` 标签。原分支仍保留；独立临时克隆另外保存 history bundle，不合并其过时任务状态。
