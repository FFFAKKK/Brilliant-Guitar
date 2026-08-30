# RKP-2 Stage 6 E3 Workspace Law Final-State Projection Repair

## Goal

修复一项单一的测试治理合同缺口：E3 已完成 fresh scale evidence run 并生成原规划允许的八个 evidence/lifecycle 路径，但现有 Workspace Law 仍把 `HEAD` 当作历史 E2 终点，因此把合法 E3 终态误报为第四项失败。

本任务只规划并在后续单独授权后修改：

`test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

它不改变 Rust、TypeScript 产品实现、fixture、worker、process wrapper、公开合同或性能数据。

## Background and confirmed evidence

- 规划基线：`4ad23773e9c9e1081667a4eccb84cc464b85bc89`，tree `9dbcef77fbcc258e4fe96fdfb2b28839f095d610`。
- E3 source worktree：`.worktrees/rkp-2-stage-6-semantic-canonical-authority-amendment`。
- E3 fresh protocol SHA-256：`64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862`。
- E3 fixed workload：400 measures、16 parts、12,800 voices、102,400 events、51,200 notes、18 extensions。
- E3 result：exit `0`、timeout `false`、`partialEvidence=false`、peak working set `821,886,976` bytes。
- 当前定向 Workspace Law：11 tests，7 pass，4 fail。
- 三项失败属于已知历史 fail-closed 基线；唯一新增失败为：
  `Stage 6 semantic canonical evidence correction and E2 worker stay inside the accepted contracts`。
- 新增失败的实际额外路径正是原 E3 规划允许的五个新增 evidence/lifecycle 路径：
  - RKP-2 parent `operator-handoff.md`；
  - RKP-2 parent `review-candidate.md`；
  - Stage 6 parent `operator-handoff.md`；
  - Stage 6 parent `review-candidate.md`；
  - Stage 6 parent `research/implementation-evidence.md`。
- 现有测试在 `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts:680-706` 把历史 E2 断言投影到当前 `HEAD`，并在 `:1185-1199` 继续使用 E2 path set；E3 到来后该时间模型失效。

## Requirements

### E3LAW-R001 — 历史 E2 终点冻结

历史 E1R2/E2 path-set 断言必须使用精确终点 `4ad23773e9c9e1081667a4eccb84cc464b85bc89`，不得继续消费动态 `HEAD`、working tree、staged 或 untracked 状态。

### E3LAW-R002 — E3 独立终态投影

新增独立 E3 final-state projection，以 `4ad23773e9c9e1081667a4eccb84cc464b85bc89` 为范围起点，并合并：

1. `<base>..HEAD`；
2. unstaged changes；
3. staged changes；
4. untracked, non-ignored files。

### E3LAW-R003 — 三个互斥 owner set

E3 final-state projection 必须精确区分：

1. **original E3 lifecycle/evidence set**：原任务冻结的八个路径；
2. **law repair technical set**：只含 Workspace Law 测试文件；
3. **law repair planning/lifecycle set**：只含本任务规划与生命周期文件。

同一路径不得由两个 set 重复拥有；Stage 6 parent `task.json` 只归 original E3 set。

### E3LAW-R004 — 八路径合同保持

original E3 set 精确保持为：

1. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json`
2. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md`
3. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md`
4. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/research/implementation-evidence.md`
5. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
6. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md`
7. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md`
8. `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`

缺一项或出现第九项均 fail closed。

### E3LAW-R005 — E3 evidence 真实性

Workspace Law 必须验证：

- evidence 文件存在且 protocol SHA-256 精确匹配；
- source HEAD/tree、fixed counts、exit/timeout/partialEvidence/RSS 与 evidence 文档一致；
- `stage_6_private_scale_evidence_seam_repair_completed=true`；
- `e3_candidate_freeze_completed=true`；
- `implementation_candidate_ready=true`；
- dedicated independent implementation review 仍为 pending；
- child 保持 `in_progress`；
- RKP-2 S6.2/S6.3 false，TypeScript default。

### E3LAW-R006 — 原九份规划权威不漂移

原 08-26 task 的九份 LF-normalized UTF-8 SHA-256 必须继续逐项精确匹配；本修复不得修改这些文件。

### E3LAW-R007 — 历史红门禁保持可见

修复后的定向 Workspace Law 预期从 `7 pass / 4 fail` 变为 `8 pass / 3 fail`。以下三项既有历史 fail-closed 不得被改绿、跳过、重命名或从 runner 排除：

1. `implementation changes stay inside the literal RKP-2 allowlists`；
2. `part owner repair stays anchored to its accepted six-path wire contract`；
3. `Stage 6 hostile and resource evidence consumes the existing private Rust seams`。

### E3LAW-R008 — 负向证明

测试必须覆盖并 fail closed：

- evidence 文件缺失；
- original E3 出现第九 lifecycle path；
- protocol hash 不匹配；
- E3 candidate 被误记为已通过独立实现审计；
- S6.2 或 S6.3 为 true；
- default runtime 不是 TypeScript；
- 08-30 historical child 被误记为 E3 live owner。

### E3LAW-R009 — 单文件技术边界

未来技术修改 allowlist 精确为一个文件：

`test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

新增第二个 technical path 立即返回规划复审。

### E3LAW-R010 — 生命周期边界

本任务保持 `planning`、`task_start_run=false`、`production_implementation_authorized=false`，直到独立规划审计通过并收到新的实施授权。任务创建授权不等于实施授权。

## Acceptance Criteria

- [ ] 历史 E2 path-set 以 `4ad23773...` 为不可变终点，不再读取 live `HEAD`。
- [ ] E3 final-state projection 精确覆盖三个互斥 owner set。
- [ ] original E3 八路径缺失/多出均 fail closed。
- [ ] E3 evidence protocol hash 和终态字段被机械验证。
- [ ] 原九份 08-26 planning authority hashes 继续精确匹配。
- [ ] 08-30 child 保持 historical，E3 live owner 仍为 08-26 parent。
- [ ] 定向结果精确为 11 tests、8 pass、3 known historical fail-closed、0 additional failure。
- [ ] typecheck、build、Trellis、JSON/JSONL、parent-child uniqueness、`git diff --check` 通过。
- [ ] Rust/product/worker/process/fixture/package/Cargo/source config 相对 planning base 零差异。
- [ ] E3 source worktree 的八文件现场在规划阶段保持 byte-for-byte 原样。
- [ ] 形成单一、可回滚的 technical commit 后才进入独立实现审计。

## Out of scope

- 重新运行 E3 stress workload；
- 修改 E3 fixed fixture、counts、protocol、timeout 或 RSS 目标；
- 修改 Rust store、codec、indices、FFI 或产品代码；
- RKP-2 S6.2/S6.3；
- 接受、归档、集成、qualification、default cutover、push 或 RKP-3；
- 修复三项历史 fail-closed。

## Planning status

需求与边界已由仓库和 fresh E3 现场证据闭合，没有待用户决定的产品问题。下一门禁是独立规划审计。
