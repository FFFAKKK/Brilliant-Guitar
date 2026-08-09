# Core VNext Extensibility Reservation Execution and Verification Plan

## 1. 执行状态

本文件是规划文档修改任务的有序执行计划。规划包已完成用户审阅，`task.py start` 已将任务切换为 `in_progress`。当前执行只同步获批的父合同、feature matrix、durable roadmap、GD-0 forward-evolution boundary 与本任务证据；生产源码、测试、活动 spec、持久化 schema 和运行时 Registry 不属于 task-owned delta。最终验收与归档仍等待独立审查和用户确认。

本任务全程是 documentation-only：

- 不修改 `src/**`；
- 不修改 `test/**`；
- 不修改构建/package 配置；
- 不修改 `.trellis/spec/**` 的 accepted behavior；
- 不修改 `.trellis/tasks/archive/2026-08/08-04-cvn-4-part-staff-voice-lifecycle/**`；
- accepted CVN-4 branch `700bac9` 已通过 merge `783f69c` 成为前置基线；CVN-4 独立 worktree 的归档后并行 dirty paths 保持原样。

## 2. 激活前条件

操作者收到明确执行指令后，先验证：

1. 当前 worktree 是 `.worktrees/core-vnext-extensibility-reservation-review`；
2. 当前 branch 是 `codex/core-vnext-extensibility-reservation-review`；
3. 原始 planning base 是 `00e0386bd66ec5e36198b8ad8cd2ec292d0b16f8`，accepted CVN-4 baseline 是 `700bac9c457dba84d801161e7d3c39b83ed075ad`，activation baseline 是 merge `783f69c581b32549fae3fb3d168cb2848bdd53f0`；
4. task status 是 `in_progress`；
5. parent 是 `07-29-core-vnext-product-ready-extensible-kernel-completion`；
6. CVN-4 live archive 已验证为 completed/archived：source/test `788594e`、acceptance `1bb19b0`、archive `13039d0`、P0/P1/P2=`0/0/0`；
7. 本分支没有 source/test/spec/CVN-4 task 变更；
8. 父 feature matrix 和 GD-0 public fence 相对基线可读取且未发生未解释漂移。

任何一项不一致时，先更新基线记录和影响图，再进入文档 delta。其他 worktree 的并行修改通过只读状态核对后原样保留。

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
- CVN-0 至 CVN-4 active/archive task files，尤其 `.trellis/tasks/archive/2026-08/08-04-cvn-4-part-staff-voice-lifecycle/**`；
- GD-0 `public-contract` fence 内容；
- 28 command IDs、44 parent FC headings、9 个 primary-owner rows、resource caps、fixtures、budgets；
- `brilliant-score-1`、ExtensionOwner V1、V1 contribution fields 和 V1 effect scope。

## 4. Stage 0 — 激活与基线证据

已于 2026-08-09 完成：

1. `task.py start` 成功将状态从 `planning` 切换为 `in_progress`；
2. branch=`codex/core-vnext-extensibility-reservation-review`，worktree=`.worktrees/core-vnext-extensibility-reservation-review`；
3. accepted CVN-4 branch HEAD=`700bac9c457dba84d801161e7d3c39b83ed075ad`，merge/activation baseline=`783f69c581b32549fae3fb3d168cb2848bdd53f0`；
4. CVN-4 archive 证据为 source/test `788594e`、acceptance `1bb19b0`、archive `13039d0`、P0/P1/P2=`0/0/0`、full tests `312/312`；
5. parent pre-delta counts 为 D/R/AC=`11/11/17`，目标 post-delta 为 `12/12/18`；
6. feature matrix pre-delta 为 44 个 `CVN-FC-*` headings、9 个 primary-owner rows、28 个唯一 Core command IDs；
7. GD-0 pre-delta 为 6 个 `typescript public-contract` fences，SHA-256 依次为 `66A9BD5527D59B0D6826B85A1403E79E34698919FF2274381DB65C9017810D28`、`7C411694565A9B47942DB062EE7A343E0EBDF4B53456158676A5B7EE5D1417CD`、`BCD2001F8136EB55D6832E17D6C0B5A6DAA12F8CD3F6689013664FE0A99B868B`、`36B943C9E1F8559AF721AF1C48BFCB1D3BBDF6A1D69D44D0CA35775BC68D0BC4`、`5C50401320614F8C8B6E66AD853933E6CFBFCA65835EDAF8B4C5555D22D1164E`、`0FA3520DD2B169E3793630D77ED34406515B5C48D5C2F074FCC5C64166675DB4`；
8. 文档 delta 前，task activation 只使本任务 `task.json` 变为 dirty；CVN-4 独立 worktree 的四个归档后并行 dirty paths 未被读取或改写。

建议命令：

```powershell
git status --short --branch
git rev-parse HEAD
git worktree list --porcelain
python ./.trellis/scripts/task.py current --source
rg -n "^### CVN-FC-" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
rg -n "Command ID" .trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md
```

**停止点：** branch/worktree/task 指向错误；CVN-4 状态或 commit 证据与 archive 不一致；现有 parent/GD-0 发生未知漂移；activation baseline 之后出现保护路径 delta。

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
2. 增加本任务为 `in_progress` documentation-only reservation gate；
3. CVN-4 状态依据 live archive 证据记录为 accepted/archived；
4. GD-0 acceptance/CVN-2 child creation 前要求本 gate accepted；
5. CVN-6 消费 accepted CVN-2 + reservation charter；
6. CVN-5 原依赖保持；
7. CVN-7 后增加 future gate index，而不是将这些 future features写入 VNext completion；
8. Durable File Index 加入本任务路径；
9. Maintenance Rules 增加 reservation adoption/version-lane change 的更新触发条件。

依赖图推荐标注：

```text
accepted CVN-4 remains a fixed CVN-5 prerequisite

accepted Extensibility Reservation Gate + accepted GD-0 + accepted CVN-1
    -> CVN-2
        -> CVN-6

accepted CVN-2 + CVN-3 + CVN-4 + CVN-6
    -> CVN-5
```

本 gate 不是 CVN-4 的依赖，也不重开 CVN-4 已归档验收；它只位于 GD-0 final acceptance/CVN-2 creation 之前。

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

2026-08-09 已记录结果：

- 本任务 `implement.jsonl`/`check.jsonl` 为 `7/7`，父任务为 `3/3`，两者 `task.py validate` 通过；task/parent JSON parse 通过；
- parent post-delta D/R/AC=`12/12/18`；feature matrix 保持 44 个 FC headings、9 个 primary-owner rows、28 个唯一 Core command IDs；
- GD-0 仍为 6 个 `typescript public-contract` fences，ordered SHA-256 与 Stage 0 六项完全相等；docs-only public-contract fixture 报告 0 diagnostics；
- Markdown fence balance、`git diff --check` 与 task-owned path scan 通过；activation baseline `783f69c` 后只有本任务、父合同、roadmap 和 GD-0 planning docs；
- `npm.cmd run typecheck` 通过；直接 worktree full test 暴露 raw fixture 被旧 checkout 物化为 CRLF，而 HEAD blob 的 SHA-256 为受控值 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`、LF=`7360`、CRLF=`0`；
- 在临时 HEAD-normalized checkout 中复跑完整 `node --test`，exit=`0`、test dots=`312`。临时目录已清理，工作树 source/test 和 index 未改变。

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
git diff --name-only 783f69c581b32549fae3fb3d168cb2848bdd53f0
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
6. 保持 CVN-4 accepted/archive 记录和独立 worktree 的归档后并行修改原样；
7. 当 GD-0 也 accepted 时，CVN-2 才成为可创建/规划 child；
8. 仍需用户单独授权 CVN-2 planning 和后续 implementation。

建议提交边界：

1. `docs(core): plan extensibility reservation gate` — 本任务规划包；
2. `docs(core): adopt additive extensibility charter` — 经执行/审查的 parent/GD-0 delta；
3. `chore(trellis): record extensibility gate acceptance` — acceptance/archive/status。

提交边界仅含本任务、父合同、roadmap 与 GD-0 planning docs；CVN-2 activation 和 production code 保持在后续独立任务。

## 14. 回滚

回滚顺序：

1. 保留 CVN-4 accepted commits、archive 与独立 worktree 的归档后并行 dirty paths 原样；
2. 撤销本分支 docs-only commit 或删除尚未合并的 planning branch/worktree；
3. parent/GD-0 回到修改前文档；
4. 重新运行 FC/command/fence/count 和 Trellis validation；
5. 没有 persisted schema、runtime state、history、document 或 migration 数据需要恢复。
