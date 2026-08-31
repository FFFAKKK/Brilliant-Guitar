# RKP-2 E3 Workspace Law Acceptance and Archive Closure

## 1. Goal

在不启动 RKP-2 S6.2/S6.3、不重跑 E3 stress、不修改产品或 Rust 实现的前提下，为已经通过独立实现审计的 E3 Workspace Law 目标建立一次有限、可验证、非递归的接受与原生归档闭环。

目标任务：

```text
.trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
```

目标任务已经获得技术审计 PASS，但当前仍是 `in_progress`，且 `archive_authorized=false`。当前 Workspace Law 还明确要求该任务只存在于活动路径；因此技术 PASS 不能直接转化为原生归档动作。

本任务只规划：

1. 在现有 Workspace Law 单一测试文件中加入目标归档与本任务归档的有限状态投影；
2. 记录目标任务的独立 owner 接受与归档授权；
3. 使用 Trellis 原生命令归档目标任务；
4. 冻结归档后的 Q3 候选并交给专用独立实现审计任务；
5. 审计通过且 owner 再次授权后，使用同一已审计 law 原生归档本任务；
6. 使 Stage 6 返回“无当前子任务、等待 Stage 6 owner 决策”的稳定状态。

## 2. Confirmed base

| Item | Exact value |
| --- | --- |
| planning base | `c73e2139d3a1a9e89e4ec6071678d75be1c02abb` |
| source closeout docs | `c7c6bf710d645872d521a01b9b72b93c6cf5b625` |
| source closeout native archive | `c73e2139d3a1a9e89e4ec6071678d75be1c02abb` |
| branch | `codex/rkp-2-e3-law-acceptance-archive-closure` |
| worktree | `.worktrees/e3-law-acceptance-archive-closure` |
| parent | `08-26-rkp-2-stage-6-private-scale-evidence-seam-repair` |
| current target state | `in_progress`, review passed, archive not authorized |
| current Stage 6 implementation child | `08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair` |
| focused Workspace Law baseline | `11 tests / 8 pass / 3 historical fail` |
| full baseline | `611 tests / 606 pass / 3 historical fail / 2 skipped` |

本 planning candidate 在技术文件仍未修改时，会确定性引入一项新的 planned closeout gap：focused 为 `11/7/4`，full 为 `611/605/4/2`。第四项失败必须精确为 `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts`；未来 Q1T 单文件修复的目标才是恢复 `11/8/3` 与 `611/606/3/2`。

The accepted E3 Workspace Law implementation record is immutable input:

```text
candidateCommit = 0c561d14193374436361eec09b361cab0170278a
technicalCommit = 36fe1956ec8660d664eb9606912dbc6e1b6c3ede
verdict = PASS_READY_FOR_E3_ACCEPTANCE_PREPARATION
canonical bytes = 323
sha256 = dee0b92ce8a2ff6c8a9737c5b98104e39633b85aaad70e594f61e4847fdd7589
P0/P1/P2 = 0/0/0
```

## 3. Requirements

### E3LAC-R001 — 技术通过与 owner 决策分离

现有独立实现审计 PASS 只证明目标候选技术可接受。目标接受、目标归档、本任务接受、本任务归档分别需要显式 owner 决策。规划审计 PASS、实施审计 PASS 和用户说“继续”不得被合并为一个隐式授权。

### E3LAC-R002 — 同级非递归收尾模型

本任务必须是 Stage 6 的同级子任务，而不是目标任务的子任务。目标归档后不遗留活动 child；本任务自己的归档由已在 Q3 审计的同一 Workspace Law 状态机覆盖，不再创建第三个递归收尾任务。

### E3LAC-R003 — 精确活动/归档解析

Workspace Law 必须对目标任务和本任务分别实现：

```text
active exists XOR archive exists
```

两处同时存在或两处都不存在均 fail closed。目标 manifest 固定 12 个工件，本任务 manifest 固定 11 个工件；缺失、额外或目录层级漂移均拒绝。

### E3LAC-R004 — Q0 至 Q4 有限状态

必须机械区分：

| Phase | Target law | Closure task | Stage 6 |
| --- | --- | --- | --- |
| Q0 planning | active, unaccepted | planning, not started | planning child=closure, implementation child=target |
| Q1 activation | active, unaccepted | active, in progress | planning child=null, implementation child=closure |
| Q2 target acceptance | active, accepted/archive authorized | active | implementation child=closure |
| Q3 reviewed candidate | archive-only, completed | active, review pending | implementation child=closure |
| Q4 terminal | archive-only, completed | archive-only, completed | both current children=null |

任何跳阶段、双路径、提前完成或提前清空 Stage 6 child 均拒绝。

### E3LAC-R005 — 精确 no-rename 路径合同

相对 `c73e213...`：

- 规划候选精确 12 条：本任务新增 11 条，Stage 6 `task.json` 修改 1 条；
- Q2 精确 20 条：`A11/M9/D0`；
- Q3 精确 39 条：`A23/M4/D12`；
- Q4 仍精确 39 条：`A23/M4/D12`。

所有计数使用：

```text
git diff --name-status --no-renames c73e2139d3a1a9e89e4ec6071678d75be1c02abb..HEAD
```

原生 archive 在普通 Git 显示中可能被识别为 rename；验收权威必须使用 `--no-renames`。

### E3LAC-R006 — 唯一技术文件

未来实现只允许修改：

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

不得新增第二个技术文件。测试只扩展归档状态解析、生命周期投影、路径集合、审计记录和负向 fixture；不得修改运行时、Rust、E3 workload、evidence 或公开合同。

### E3LAC-R007 — 十一个生命周期/上下文文件

未来生命周期 allowlist 精确为：

1. 本任务 `task.json`；
2. 本任务 `operator-handoff.md`；
3. 本任务 `review-candidate.md`；
4. 目标任务 `task.json`；
5. 目标任务 `operator-handoff.md`；
6. 目标任务 `review-candidate.md`；
7. 目标任务 `implement.jsonl`；
8. 目标任务 `check.jsonl`；
9. Stage 6 `task.json`；
10. Stage 6 `operator-handoff.md`；
11. Stage 6 `review-candidate.md`。

目标两份 JSONL 只允许在 Q2 删除六条随目标 active root 移动而失效的 self-reference；目标 `task.json` 同步登记两份新 digest 和 bounded archive-stability repair。不得修改目标 PRD、design、implement、research、生产文件或其既有 323-byte 审计记录。

RKP-2 parent 与 Rust remediation parent 保持 byte-semantic 零差异。

### E3LAC-R008 — 审计记录单一所有权

现有 323-byte E3 Workspace Law 审计记录随目标任务原生移动，内容、字段顺序和 SHA-256 不变。本任务只保存目标 owner task/path、`323` bytes 与 digest；不得复制该结构化记录。

新的 Q3 专用实现审计记录只由本任务 `task.json` 拥有，结构固定为：

```json
{
  "schemaVersion": 1,
  "reviewTaskId": "<Q3_REVIEW_TASK_ID>",
  "reviewTurnId": "<Q3_REVIEW_TURN_ID>",
  "candidateCommit": "<Q3_EXACT_HEAD>",
  "technicalCommit": "<WORKSPACE_LAW_TECHNICAL_COMMIT>",
  "verdict": "<Q3_REVIEW_VERDICT>",
  "P0": 0,
  "P1": 0,
  "P2": 0
}
```

Stage 6 只保存 owner path 与 digest，不复制结构化记录。Q3 审计实际完成前这些 typed slots 不得伪造为真实值。

### E3LAC-R009 — JSONL 归档稳定性

本任务 `implement.jsonl` 与 `check.jsonl` 只引用本轮不会移动的 active authority 或既有 archive authority；不得引用本任务 active root 或目标 active root。

目标任务当前两份 JSONL 共含六条 active self-reference。Q2 必须在显式十一文件 lifecycle/context allowlist 内删除这些条目、更新目标 `task.json` 中对应 digest，并在提交后同时证明：active 状态 Trellis/JSONL 通过，模拟 archive successor 时不存在 active target prefix，剩余路径全部存在且单文件内唯一。原生归档后不得再手工重写。

### E3LAC-R010 — 原生归档与时钟合同

两次归档都只允许使用 `task.py archive`。执行归档的同一个 PowerShell 序列必须先验证：

```text
month = 2026-08
date = 2026-08-31
local time < 23:50:00
```

不允许 fallback month、手工移动、调整系统时钟或 `--no-commit`。任一条件不满足时，在移动前返回 bounded planning repair。

Q4 不允许先形成“closure 仍 active 但 Stage 6 child 已清空”或“closure 已 archive 但 Stage 6 仍指向它”的中间提交。Q3 审计 PASS 与 owner closeout authorization 后，必须先把 closure 的真实审计记录、接受/归档状态投影和 Stage 6 终态精确预暂存。在同一 PowerShell 序列中，使用 `git status --porcelain=v1 -z --untracked-files=all` 机械证明 index 精确只有六个预暂存 lifecycle paths、所有 worktree 列为空、没有 `??` 且不存在其它路径；只检查 `git diff --name-only` 不构成合格预检。随后才执行时钟检查与原生 archive；`session_auto_commit` 必须为有效开启状态，原生 archive 的单一提交同时采用这些 staged changes。

原生 archive 返回后、真实 Q4 Workspace Law 运行前，必须证明新 HEAD 只有 exact Q3 HEAD 一个 parent，且 commit-local `--no-renames` 集合精确为 closure active manifest 的 `D11`、closure archive manifest 的 `A11` 和 Stage 6 lifecycle files 的 `M3`。任一不符时先 revert 该单一 archive commit，再 fail closed；真实 Q4 Workspace Law 只在以上提交成员验证通过后运行。

### E3LAC-R011 — Stage 6 终态

Q4 后 Stage 6 保持 `in_progress`，但：

- `current_planning_child=null`；
- `current_implementation_child=null`；
- `next_gate=explicit_owner_decision_for_stage6_parent_acceptance_archive`；
- S6.1 retained complete；
- S6.2/S6.3 false；
- TypeScript default；
- integration、qualification、runtime switch、push、RKP-3 全部 false。

本任务不接受或归档 Stage 6 本身。

### E3LAC-R012 — 回滚必须按边界逆序

- 目标归档前：先撤销 owner acceptance，再撤销 technical/activation；
- 目标归档后、Q3 接受前：先 revert 目标原生 archive commit，再撤销 acceptance/technical；
- 本任务归档后：revert 本任务原生 archive commit，恢复 Q3 已审计状态；
- 禁止手工目录移动或修改已审计 commit。

## 4. Acceptance criteria

- [ ] 新任务保持 `planning`、`task_start_run=false`、`production_implementation_authorized=false`。
- [ ] 规划任务精确 11 个工件；规划 diff 精确 12 条。
- [ ] Stage 6 child 引用精确一次，并保持目标为当前 implementation child。
- [ ] Q0–Q4、manifest、no-rename 路径和 audit record 均有正负测试矩阵。
- [ ] 唯一技术 allowlist 为 Workspace Law 测试文件。
- [ ] lifecycle/context allowlist 精确 11 个文件；Q2 精确 `A11/M9/D0=20`，Q3/Q4 仍为 `A23/M4/D12=39`。
- [ ] 目标 JSONL 的六条 active self-reference 在 Q2 显式移除，active 与 archive-successor 两种解析均通过。
- [ ] Q4 的 Stage 6 终态与 closure 原生归档处于同一 archive commit；提交前 NUL-delimited status 排除全部 untracked/unstaged/extra paths，提交后 parent 与 commit-local `A11/D11/M3` manifest 精确，且不存在可提交的非法中间态。
- [ ] planning candidate 的 Node 24 与 Node 20.20.2 精确为 `11/7/4`：三项历史 fail 加一项 planned closeout gap，零额外失败。
- [ ] planning candidate full 精确为 `611/605/4/2`；未来 Q1T 后恢复 `611/606/3/2`。
- [ ] Trellis、JSON/JSONL、Markdown fence、diff check、typecheck、build 全部通过。
- [ ] `src/**`、Rust、Cargo、package、tsconfig、evidence、spec 相对 base 零差异。
- [ ] 独立规划审计 P0/P1/P2=`0/0/0` 后，才允许请求实施授权。
- [ ] Q3 由专用独立实现审计任务审查；规划者和操作者不自审。
- [ ] 不 push、不启动 S6.2/S6.3、不重跑 E3 stress、不进入 qualification/cutover/RKP-3。

## 5. Out of scope

- 生产代码或 Rust 修改；
- E3 fixture、request、worker、protocol、RSS 或 timing 修改；
- 再次运行 E3 stress；
- 修复三项历史 fail-closed；
- RKP-2 S6.2/S6.3；
- Stage 6/RKP-2/Rust parent 接受或归档；
- integration、qualification、default runtime switch、push、RKP-3；
- 新的 archive manager 或第二套 Workspace Law。

## 6. Planning gate

本候选只进入专用独立规划审计。当前没有 production implementation authorization，也没有 `task.py start`。
