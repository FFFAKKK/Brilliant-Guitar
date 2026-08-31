# Design — E3 Workspace Law Acceptance and Archive Closure

## 1. Why a separate closeout exists

Current authority has a deliberate circular-looking gate:

```text
E3 Workspace Law implementation passed
  -> owner acceptance still required
  -> native archive changes active paths into archive paths
  -> current Workspace Law only accepts the active-path state
```

Archiving directly would make the law that protects the archive transition fail. The bounded solution is not to weaken the law and not to create an unbounded chain of archive tasks. It is to add one finite resolver and two terminal phases to the existing law, then audit the state after the first archive before allowing the second archive.

## 2. Task topology

```text
08-26 Stage 6 parent (remains active)
├── 08-30 semantic authority amendment (historical)
├── 08-31 E3 Workspace Law target (active -> archive)
└── 08-31 this acceptance/archive closure (planning -> active -> archive)
```

This task is a sibling of the target. Therefore:

- target native archive never contains an active child;
- Stage 6 remains the only common lifecycle owner;
- this task can model its own terminal archive without another child;
- Stage 6 becomes eligible for a later, separately planned owner decision only after both siblings are archive-only.

## 3. Exact task manifests

### 3.1 Target Workspace Law — 12 files

```text
check.jsonl
design.md
implement.jsonl
implement.md
operator-handoff.md
prd.md
research/current-e3-law-gap-audit.md
research/file-test-and-rollback-matrix.md
research/final-state-projection-contract.md
research/planning-self-audit.md
review-candidate.md
task.json
```

### 3.2 This closeout — 11 files

```text
check.jsonl
design.md
implement.jsonl
implement.md
operator-handoff.md
prd.md
research/current-state-and-archive-gap-audit.md
research/file-state-and-test-matrix.md
research/planning-self-audit.md
review-candidate.md
task.json
```

No optional artifact exists. A manifest count that is right but contains a substituted name also fails.

## 4. Archive-aware resolver

The only future technical file adds a pure resolver equivalent to:

```ts
type TaskLocation =
  | { readonly kind: "active"; readonly root: string }
  | { readonly kind: "archive"; readonly root: string };

function resolveExactlyOneTaskLocation(
  activeRoot: string,
  archiveRoot: string,
  exactManifest: readonly string[],
): TaskLocation;
```

Required behavior:

1. evaluate both roots without following a fallback search;
2. reject both-present and neither-present;
3. recursively enumerate regular files relative to the selected root;
4. compare the complete sorted manifest to the frozen list;
5. reject symlink/reparse escape or extra nested content;
6. return only the selected root and kind;
7. construct all later lifecycle paths from this returned root.

Unknown paths are never silently classified as archive content.

## 5. Finite lifecycle phases

### Q0 — Planning candidate

```text
target: active, in_progress, audited, archive_authorized=false
closure: active planning metadata, task_start_run=false
Stage 6 current_planning_child=closure
Stage 6 current_implementation_child=target
```

Only the 11 task artifacts and Stage 6 `task.json` may differ from `c73e213...`.

### Q1 — Activation

Preconditions: independent planning PASS, exact accepted planning head, separate user implementation authorization.

```text
target: unchanged active/unaccepted
closure: in_progress, task_start_run=true
Stage 6 current_planning_child=null
Stage 6 current_implementation_child=closure
```

No technical file changes in Q1.

### Q2 — Law extension and target owner acceptance

The existing Workspace Law is extended first. Focused tests must prove Q0–Q4 while the real filesystem is still Q1. Only after that technical gate passes may lifecycle files record:

```text
target acceptance_authorized=true
target archive_authorized=true
target next_gate=native_e3_workspace_law_archive_clock_preflight_required
closure target_owner_decision=<explicit record>
Stage 6 current_implementation_child=closure
```

The target remains active until the same-command clock preflight succeeds.

### Q3 — Target archive and independent-review candidate

Native archive moves the complete 12-file target manifest to:

```text
.trellis/tasks/archive/2026-08/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
```

Q3 requires:

- active target absent, archive target exact 12 files;
- archived target `status=completed`, `completedAt=2026-08-31`;
- existing 323-byte review record unchanged;
- closure remains active and `implementation_review=pending`;
- Stage 6 current implementation child remains closure;
- exact Q3 no-rename path projection;
- clean/staged-empty worktree at the candidate commit.

Q3 HEAD is the exact input to a dedicated independent implementation review task. That reviewer is not the planner or implementation operator.

### Q4 — Closure archive terminal

Only after Q3 review PASS and a separate owner closeout authorization:

1. record the Q3 audit record in this task only;
2. record digest-only reference in Stage 6;
3. set Stage 6 current planning/implementation child to null;
4. set Stage 6 next gate to `explicit_owner_decision_for_stage6_parent_acceptance_archive`;
5. verify Q4 with the already-reviewed Workspace Law and no technical edit;
6. run the second same-command archive clock preflight;
7. natively archive this 11-file task.

No new closeout task is created.

## 6. Exact path arithmetic

All arithmetic is relative to `c73e2139d3a1a9e89e4ec6071678d75be1c02abb` and uses `--no-renames`.

### Planning candidate — 12

```text
A 11  this closeout task artifacts
M  1  Stage 6 task.json
D  0
```

### Q2 — 18

```text
A 11  this closeout active task
M  1  Workspace Law test
M  3  target lifecycle files
M  3  Stage 6 lifecycle files
D  0
```

### Q3/Q4 — 39

```text
A 12  target archive manifest
A 11  closeout active manifest in Q3 or archive manifest in Q4
M  1  Workspace Law test
M  3  Stage 6 lifecycle files
D 12  target active manifest
```

Totals: `A23/M4/D12=39`. Moving this task between active and archive roots in Q4 does not change the count relative to the base because neither root existed at the base.

## 7. Audit record ownership

### Existing target record

The canonical 323-byte record and SHA-256 `dee0b92c...7589` remain inside the target `task.json`. Native archive moves the owner path but never rewrites the record.

### New Q3 record

Before review:

```text
closure implementation_review=pending
closure q3_audit_record absent
Stage 6 q3_audit_owner points to closure task and digest=pending
```

After dedicated review:

- this task owns the exact ordered structure defined by `prd.md`;
- canonicalization uses UTF-8 JSON, no whitespace, insertion order fixed by the schema;
- candidate commit equals exact Q3 HEAD;
- technical commit equals the one Workspace Law commit;
- P0/P1/P2 all zero are necessary for PASS;
- Stage 6 stores only resolved archive owner path and digest.

Duplicating the structured record anywhere else fails.

## 8. JSONL survival

Because both this task and the target move, active self-references are unsafe. This task's JSONL therefore references only:

- `.trellis/spec/core-kernel/backend/rust-runtime-transition.md`;
- Stage 6 parent files, which do not move here;
- RKP-2 and Rust parent files, which do not move here;
- already archived predecessor closeout authority.

Before target archive, a scripted gate must verify the target's JSONL successor paths resolve after the move. No post-archive manual rewrite is permitted.

## 9. Archive clock contract

Both native moves use the same exact preflight immediately before the archive command:

```powershell
$now = Get-Date
if ($now.ToString('yyyy-MM') -ne '2026-08' -or
    $now.ToString('yyyy-MM-dd') -ne '2026-08-31' -or
    $now.TimeOfDay -ge [TimeSpan]::Parse('23:50:00')) {
  throw 'archive-clock-contract-mismatch'
}
python .\.trellis\scripts\task.py archive <TASK_ID>
```

The check and archive call cannot be split across shells or turns. Any mismatch is a planning input change, not permission to select another directory.

## 10. Test design

### Positive cases

- target active-only exact 12 and archive-only exact 12;
- closure active-only exact 11 and archive-only exact 11;
- Q0, Q1, Q2, Q3, Q4 exact lifecycle matrices;
- Q2 exact `A11/M7/D0` and Q3/Q4 exact `A23/M4/D12`;
- 323-byte record remains exact before and after target move;
- Q3 record has one owner and exact canonical digest;
- Stage 6 child and next-gate projections are exact;
- planning candidate 在 Node 24 和 20.20.2 精确为 `11/7/4`，第四项是本任务尚未被 law 接受的 planned gap；
- future Q1T 后 focused 恢复 `11/8/3`；
- planning full 精确为 `611/605/4/2`，future Q1T 后恢复 `611/606/3/2`。

### Negative cases

- active and archive both present, or neither present;
- target manifests with 11 or 13 files;
- closure manifests with 10 or 12 files;
- substituted filename with correct count;
- rename-collapsed path calculation or wrong A/M/D totals;
- target archive before technical law/pass or owner authorization;
- closure archive before Q3 review/pass or closeout authorization;
- audit field, insertion order, candidate, technical commit, verdict, bytes or digest mismatch;
- duplicate structured review owner;
- active self-reference in any archived JSONL;
- archive month/date/time mismatch;
- Stage 6 child cleared early or points to the archived target;
- S6.2/S6.3 true, Rust default, integration/qualification/cutover/push/RKP-3 true;
- E3 evidence modification or stress rerun.

## 11. Rollback graph

```text
Q4 --revert closure native archive--> Q3 reviewed
Q3 --revert target native archive--> Q2 accepted active target
Q2 --revert owner acceptance--> Q1 technical law only
Q1 --revert technical and activation--> accepted planning state
```

Rollback always uses Git revert/native history and never manual moves. The earlier accepted E3 evidence and audit records remain unchanged throughout.
