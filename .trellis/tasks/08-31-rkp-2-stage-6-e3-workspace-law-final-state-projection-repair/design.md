# Design — E3 Workspace Law Final-State Projection Repair

## 1. Problem model

现有 law 把两个不同时间对象混成一个对象：

```text
historical E2 accepted projection
        +
live HEAD / dirty / staged / untracked projection
```

`currentSemanticCanonicalE1r2Changes()` 和 `currentE2WorkerCandidateChanges()` 都把历史 base 与 live `HEAD` 组合。E2 结束时有效；E3 合法增加 evidence/lifecycle 文件后，历史断言必然把这些路径识别为 E2 越界。

修复原则是**分离时间轴，不扩大原 E3 allowlist**。

## 2. Authority and time anchors

| 名称 | 精确值 | 角色 |
| --- | --- | --- |
| E1R2 planning head | `eb0c13ed5ac218cfec9a983a4bc4e8dfb89acbd7` | historical range start |
| E2 bounded repair base | `c7aa242b359401f76cd05944404cfc686854bec4` | historical E2-only range start |
| E2 terminal / E3 source head | `4ad23773e9c9e1081667a4eccb84cc464b85bc89` | historical range end and live E3 range start |
| E3 source tree | `9dbcef77fbcc258e4fe96fdfb2b28839f095d610` | fresh-run source identity |
| E3 protocol SHA-256 | `64e09779ea34bd04d504d515eb7c391f7db35a0a23a3c366fb2ffb5aa71c2862` | evidence identity |
| repair accepted planning head | `<E3_LAW_ACCEPTED_PLANNING_HEAD>` | implementation range start, filled only after independent planning PASS |

## 3. Historical E2 projection

Replace live helpers with commit-to-commit helpers:

```ts
function historicalSemanticCanonicalE2Changes(): Set<string> {
  return diffNames(E1R2_PLANNING_HEAD, E2_TERMINAL_HEAD);
}

function historicalE2WorkerChanges(): Set<string> {
  return diffNames(E2_BOUNDED_REPAIR_BASE, E2_TERMINAL_HEAD);
}
```

These helpers:

- use `--no-renames --name-only`;
- read no dirty/staged/untracked state;
- assert both endpoints exist and ancestry is valid;
- preserve the current exact historical sets:
  - E1R2+E2: 5 technical + 6 lifecycle = 11 paths；
  - E2 bounded range: 4 worker technical + 6 lifecycle = 10 paths。

No historical assertion is rewritten to accept E3 files.

## 4. Live E3 final-state projection

Add a new helper:

```ts
function currentE3FinalStateChanges(): Set<string> {
  return union(
    diffNames(E2_TERMINAL_HEAD, "HEAD"),
    unstagedNames(),
    stagedNames(),
    untrackedNames(),
  );
}
```

The function has one live purpose: validate the final candidate produced after the accepted planning head. It does not replace the historical E2 helpers.

## 5. Exact disjoint owner sets

### 5.1 Original E3 lifecycle/evidence paths — 8

```text
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/research/implementation-evidence.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
```

### 5.2 Repair technical path — 1

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

### 5.3 Repair planning/lifecycle paths

The task root is frozen as:

```text
.trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/
```

Its exact planned file set is:

```text
task.json
prd.md
design.md
implement.md
implement.jsonl
check.jsonl
operator-handoff.md
review-candidate.md
research/current-e3-law-gap-audit.md
research/final-state-projection-contract.md
research/file-test-and-rollback-matrix.md
research/planning-self-audit.md
```

The full final-state change set from `4ad23773...` must equal the union of these three sets. Duplicate ownership is rejected before equality comparison.

## 6. Source E3 snapshot reconstruction

The live E3 source worktree is intentionally left untouched during planning. Future implementation occurs on this short, isolated branch after accepted planning and explicit implementation authorization.

Seven source E3 paths are reconstructed at their frozen LF-normalized SHA-256. The Stage 6 `task.json` is a semantic merge because task creation adds the new child reference. It must preserve all E3 fields and contain each child exactly once:

```text
08-30-rkp-2-stage-6-semantic-canonical-authority-amendment
08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
```

No source E3 evidence content is regenerated and no workload is rerun.

## 7. Evidence assertions

The law reads `research/implementation-evidence.md` as immutable evidence and checks:

- exact protocol SHA-256；
- source HEAD/tree；
- exact fixed entity counts；
- `exitCode=0`、`timedOut=false`、`partialEvidence=false`；
- exact peak working set `821886976`；
- exact Rust/wall elapsed diagnostics；
- no qualification or product benchmark claim。

The law reads lifecycle JSON and checks:

- 08-26 is the live E3 owner；
- 08-30 remains historical and keeps `stage6_e3_started=false`；
- S6.2/S6.3 false；
- TypeScript default；
- candidate ready but independent implementation review pending；
- no acceptance/archive/integration/cutover/qualification/push/RKP3。

## 8. Negative fixtures

Refactor the projection assertion into pure helpers that accept path sets and parsed projections. This permits deterministic in-process negative fixtures without filesystem mutation:

| Fixture | Required result |
| --- | --- |
| remove evidence path | reject |
| add ninth original E3 path | reject |
| protocol hash differs | reject |
| E3 review marked passed | reject |
| S6.2 true | reject |
| S6.3 true | reject |
| default runtime Rust | reject |
| 08-30 claims live E3 ownership | reject |

## 9. Preserved red gates

The repair changes only the fourth, newly introduced failure. It must not alter expected sets, fixtures, names or execution of the three historical fail-closed tests. Final focused totals are mechanically asserted in the handoff evidence:

```text
tests 11
pass 8
fail 3
```

All three failure names must exact-match the frozen list in `prd.md`.

## 10. Rollback

One technical commit owns the law change. Reverting that commit returns to the observed 7/4 classification while retaining the planning authority and E3 evidence. Rust/product state remains unchanged in either direction.
