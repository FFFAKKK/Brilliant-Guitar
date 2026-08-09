# Core VNext Extensibility Reservation Execution and Verification Plan

## 1. 执行状态

本文件是规划文档修改任务的有序执行计划。当前任务保持 `planning`；本轮只完成任务、分支、PRD、design、implement、research 和 context manifest。父合同/GD-0 的实际修改、task activation、提交、验收和归档均等待用户审阅。

本任务全程是 documentation-only：

- 不修改 `src/**`；
- 不修改 `test/**`；
- 不修改构建/package 配置；
- 不修改 `.trellis/spec/**` 的 accepted behavior；
- 不修改 `.trellis/tasks/08-04-cvn-4-part-staff-voice-lifecycle/**`；
- 不读取 CVN-4 未提交实现候选为基线或 acceptance 证据。

## 2. 激活前条件

操作者收到明确执行指令后，先验证：

1. 当前 worktree 是 `.worktrees/core-vnext-extensibility-reservation-review`；
2. 当前 branch 是 `codex/core-vnext-extensibility-reservation-review`；
3. planning base 是 `00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8`；
4. task status 是 `planning`；
5. parent 是 `07-29-core-vnext-product-ready-extensible-kernel-completion`；
6. CVN-4 live status 通过其独立 worktree/task metadata读取并记录为 candidate/pending review，除非届时已有新的可验证 acceptance/archive 事实；
7. 本分支没有 source/test/spec/CVN-4 task 变更；
8. 父 feature matrix 和 GD-0 public fence 相对基线可读取且未发生未解释漂移。

任何一项不一致时，先更新基线记录和影响图，再进入文档 delta。不要通过 reset/cleanup 处理其他 worktree 的候选。

## 3. 拥有文件面

### 3.1 本任务规划工件

- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json`（仅 parent-child linkage）
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/task.json`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/prd.md`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/design.md`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/implement.md`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/implement.jsonl`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/check.jsonl`
- `.trellis/tasks/08-09-core-vnext-extensibility-reservation-review/research/*.md`

### 3.2 获批执行后的父/GD-0 文档面

- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/prd.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md`
- `.trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md`
- `.trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/design.md`

### 3.3 保护面

- `src/**`、`test/**`、`package.json`、`tsconfig*`；
- `.trellis/spec/**`；
- CVN-0 至 CVN-4 active/archive task files，尤其 `08-04-cvn-4-part-staff-voice-lifecycle/**`；
- GD-0 `public-contract` fence 内容；
- 28 command IDs、44 parent FC headings/primary ownership、resource caps、fixtures、budgets；
- `brilliant-score-1`、ExtensionOwner V1、V1 contribution fields 和 V1 effect scope。

## 4. Stage 0 — 激活与基线证据

仅在用户批准执行后：

1. 运行 `task.py start`；
2. 记录 branch、HEAD、base branch、worktree 和 dirty paths；
3. 读取 parent task、GD-0 task、CVN-4 live task 状态；
4. 记录 parent PRD decision/requirement/AC counts；
5. 记录 `CVN-FC-*` heading 数、primary owner 表和 28-command count；
6. 提取 GD-0 `public-contract` fences 的 hash；
7. 保存 `git diff --name-only` 作为 pre-change evidence。

建议命令：

```powershell
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
python ./.trellis/scripts/task.py current --source
rg -n "^### CVN-FC-" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
rg -n "Command ID" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
```

**停止点：** branch/worktree/task 指向错误；CVN-4 被误标 accepted；现有 parent/GD-0 发生未知漂移；保护路径已经 dirty。

## 5. Stage 1 — Surface inventory 与决策矩阵确认

核对并更新四个 research 文件：

1. `current-extension-surface-inventory.md`：所有当前入口、owner、版本和限制有 path:line 证据；
2. `reservation-decision-matrix.md`：每项只属于一个分类；
3. `scenario-coverage-matrix.md`：十个场景都有 current path 或 future gate；
4. `contract-impact-map.md`：每个目标文档的 exact section、允许 delta、禁止 delta 和验证方法。

确认以下核心决定没有歧义：

- V1 精确保持；
- future operation expansion 不进入 CVN-2 V1；
- CVN-5 batch 是 V1 跨边界组合路径；
- selector、schema granularity、package Host、external adapters 都使用后续独立 gate；
- active Assembly 原地 mutation 和 generic patch 永久排除。

**停止点：** 某场景需要立即扩大 V1 public fence 或 persisted schema；返回用户与 parent/GD-0 review，不继续文字同步。

## 6. Stage 2 — Parent PRD 最小 delta

在父 `prd.md` 追加：

### `CVN-D012 — Versioned extensibility reservations`

必须包含：

- V1 exact-preservation；
- new-entry/API/schema lanes；
- future operation/selector/schema/Host/Adapter gates；
- permanent invariants；
- CVN-2 前置复审时机；
- future reservation 不构成当前实现。

### `CVN-R012 — Future extension port charter`

必须要求每个 future port 具有 owner、version、capability、data direction、failure、compatibility、migration、Session lifecycle 和 acceptance scenario。

### `CVN-AC018 — Reservation trace and no-V1-drift evidence`

必须验证：

- 所有 future ports 可追踪；
- V1 shape/count/caps/fences 保持；
- 没有 source/test/spec delta；
- CVN-2/CVN-6 消费 accepted reservation；
- CVN-4 状态真实。

原有 D001–D011、R001–R011、AC001–AC017 保持原序和语义。

**Commit boundary（获批后）：** `docs(core): define versioned extensibility reservations`

## 7. Stage 3 — Feature Matrix evolution charter

在 `CVN-FC-112` 后、Validation 章节前增加普通四级或粗体子节，不新增 `### CVN-FC-*` heading：

```text
Additive evolution reservation (non-V1 completion scope)
```

该节精确写入：

- V1 current behavior remains the binding completion contract；
- future new capabilities use new registration/API/schema versions；
- planned operation expansion/selector/Assembly generation/schema v2/external adapters are future gates；
- current CVN-2/CVN-6 operators do not implement them；
- generic patch、mutable document、second owner、ready mutation stay excluded；
- any future gate has its own parent review, caps, fixtures, tests and independent acceptance。

验证：

- Core command count 仍是 28；
- `CVN-FC-*` heading 数和 primary owner count 保持基线；
- FC110/111/112 的 V1 字段、caps、effect scope 和 failure 不变；
- exclusions 没有被 future wording 反向放开。

## 8. Stage 4 — Durable roadmap scheduling delta

更新 roadmap：

1. Snapshot date 和 live-state 说明使用实际证据；
2. 增加本任务为 planning-only reservation gate；
3. CVN-4 状态只依据届时 live review 证据；
4. GD-0 acceptance/CVN-2 child creation 前要求本 gate accepted；
5. CVN-6 消费 accepted CVN-2 + reservation charter；
6. CVN-5 原依赖保持；
7. CVN-7 后增加 future gate index，而不是将这些 future features写入 VNext completion；
8. Durable File Index 加入本任务路径；
9. Maintenance Rules 增加 reservation adoption/version-lane change 的更新触发条件。

依赖图推荐标注：

```text
CVN-4 review continues independently

Extensibility Reservation Gate + accepted GD-0
    -> CVN-2
        -> CVN-6

accepted CVN-2 + CVN-3 + CVN-4 + CVN-6
    -> CVN-5
```

不要把本 gate 表述为 CVN-4 的依赖，也不要把 CVN-4 candidate 表述为 accepted。

## 9. Stage 5 — GD-0 forward-evolution sync

只在 GD-0 `design.md` 增加解释性章节：

- GD-0 public fences定义 V1；
- CVN-2/CVN-6 首次实现 V1；
- future capabilities use additive lane；
- future operation expansion/selector/package Host/schema v2 不属于 GD-0 acceptance；
- future lane 保持 single Core owner、frozen Session Assembly 和 compatibility model。

执行前后提取所有 `typescript public-contract` fence，验证数量、顺序和内容 hash 完全一致。

禁止修改：

- `CompiledDomainCommandContributionV1` 九字段；
- application-facing construction/result/availability/replay fences；
- effect V1 scope；
- current rollout ownership map，除非 parent mapping 需要纯状态同步且另有证据。

**Commit boundary（可与 Stage 3/4 同一 docs commit）：** `docs(core): reserve additive module evolution lanes`

## 10. Stage 6 — Traceability 与负面保证

创建一张 requirement-to-artifact trace：

| Requirement | Parent/GD-0 delta | Research evidence | Decisive check |
|---|---|---|---|
| R001 | roadmap status | inventory | diff excludes CVN-4 task |
| R003/R004 | D012/R012 + feature charter | decision matrix | V1 fence/count equality |
| R005 | future gate wording | scenario matrix | no V1 API delta |
| R006 | future selector wording | impact map | no selector runtime export |
| R007 | schema future gate | inventory | `brilliant-score-1` unchanged |
| R008/R009 | roadmap future index | scenario matrix | no Host/Adapter code |
| R011 | parent AC018 | scenario matrix | 10/10 scenario rows |

负面扫描至少检查：

- `src/`、`test/`、`.trellis/spec/`、CVN-4 task paths不在 diff；
- 没有新增 public-contract fence；
- 没有 `register/unregister/replace` ready API proposal进入 V1；
- 没有 `any`/generic patch/JSON path/mutable document capability；
- 没有将 future gate 描述成 implemented/accepted；
- 没有第二 bus/history/replay/event owner。

## 11. Stage 7 — 规划质量验证

### 11.1 Trellis 与数据文件

```powershell
python ./.trellis/scripts/task.py validate 08-09-core-vnext-extensibility-reservation-review
python ./.trellis/scripts/task.py validate 07-29-core-vnext-product-ready-extensible-kernel-completion
python -m json.tool .trellis/tasks/08-09-core-vnext-extensibility-reservation-review/task.json
```

逐行解析 `implement.jsonl`、`check.jsonl`，确认每行是 JSON object、路径存在、没有 `_example`。

### 11.2 Markdown 与合同数量

```powershell
rg -n "^```" .trellis/tasks/08-09-core-vnext-extensibility-reservation-review .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion .trellis/tasks/07-28-gd-0-guitar-domain-core-transaction-contract/design.md
rg -n "^### CVN-FC-" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
rg -n "core\.[a-z0-9.-]+" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
```

使用确定性脚本比较：

- pre/post FC heading list；
- pre/post Core command ID set；
- pre/post GD-0 public fence text；
- V1 caps table；
- CVN-FC-112 effect scope。

### 11.3 Git 边界

```powershell
git status --short --branch
git diff --name-only 00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8
git diff --check
```

最终文件集合只能来自 3.1 和获批后的 3.2。任何 source/test/spec/CVN-4 task path 出现时，移除该越界 delta 并重新验证。

## 12. Stage 8 — 独立审查

Reviewer 不参与规划编写，输出：

- P0：改变稳定真相/事务所有权、静默扩大 V1、误标 accepted、触及生产面；
- P1：future port 缺 owner/version/failure/migration/stop gate，场景无落点，依赖错误；
- P2：路径、状态、术语、trace 或验证步骤不完整。

决定性复核：

1. 逐条 R001–R016 / AC001–AC025；
2. 10 个 scenario walkthrough；
3. parent/GD-0 exact delta review；
4. V1 fence/count/caps/hash equality；
5. planning-only Git path audit；
6. CVN-4 live state 与文档描述一致；
7. P0/P1/P2=`0/0/0` 后才推荐接受。

Reviewer 发现问题时只修本任务/父/GD-0 文档；涉及 V1 行为、schema、caps、command IDs 或 runtime API 时返回 parent planning，不用解释性文字覆盖。

## 13. Stage 9 — 用户接受、提交与归档

用户接受后：

1. 路径限定 staging，仅包含拥有文件面；
2. 创建 docs-only commit；
3. 记录 commit、验证结果、P0/P1/P2 和 user acceptance；
4. archive 本任务；
5. 更新 parent roadmap 的 accepted reservation gate；
6. 保持 CVN-4 独立 review/acceptance 流程；
7. 当 GD-0 也 accepted 时，CVN-2 才成为可创建/规划 child；
8. 仍需用户单独授权 CVN-2 planning 和后续 implementation。

建议提交边界：

1. `docs(core): plan extensibility reservation gate` — 本任务规划包；
2. `docs(core): adopt additive extensibility charter` — 经执行/审查的 parent/GD-0 delta；
3. `chore(trellis): record extensibility gate acceptance` — acceptance/archive/status。

不要把 CVN-4 候选、CVN-2 activation 或任何 production code 混入这些提交。

## 14. 回滚

回滚顺序：

1. 保留 CVN-4 worktree及其候选原样；
2. 撤销本分支 docs-only commit 或删除尚未合并的 planning branch/worktree；
3. parent/GD-0 回到修改前文档；
4. 重新运行 FC/command/fence/count 和 Trellis validation；
5. 没有 persisted schema、runtime state、history、document 或 migration 数据需要恢复。
