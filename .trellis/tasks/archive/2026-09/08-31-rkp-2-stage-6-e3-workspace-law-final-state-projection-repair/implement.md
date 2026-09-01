# Implementation Plan — E3 Workspace Law Final-State Projection Repair

## 0. Preconditions

Implementation begins only after all conditions hold:

1. this planning candidate has an independent planning review PASS with P0/P1/P2=`0/0/0`；
2. `<E3_LAW_ACCEPTED_PLANNING_HEAD>` is frozen；
3. user provides a separate implementation authorization；
4. `task.py start` is run for this child only；
5. source E3 eight-path snapshot and `4ad23773...` ancestry revalidate；
6. S6.2/S6.3 false and TypeScript default；
7. original 08-26 nine immutable hashes exact-match。

Planning creation consent does not satisfy items 1–4.

## Phase A — Activation only

Allowed changes:

- this task `task.json`；
- this task `operator-handoff.md`；
- this task `review-candidate.md`；
- parent 08-26 `task.json` only where needed for live child/gate projection。

Required state:

- child `in_progress`；
- `task_start_run=true`；
- implementation authorization recorded only for this single-file law repair；
- candidate ready false；
- implementation review pending；
- no E3 evidence regeneration and no technical change。

Gate: Trellis/JSON/child uniqueness/diff check pass.

## Phase B — Reconstruct the already-measured E3 final state

Copy the seven byte-semantic frozen E3 evidence/lifecycle files from the preserved source snapshot. Merge the 08-26 parent `task.json` semantically so it retains:

- every E3 result field；
- original child `08-30...` exactly once；
- new child `08-31...` exactly once。

Do not rerun the scale worker. Verify source protocol SHA-256 and all frozen LF-normalized hashes before the next phase.

Gate: current range contains only task planning/lifecycle files and original E3 eight-path set; technical delta remains zero.

## Phase C — Freeze historical E2 ranges

Modify only:

`test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Actions:

1. add exact `STAGE_6_E2_TERMINAL_HEAD=4ad23773...`；
2. change historical E1R2/E2 helpers to commit-to-commit projections；
3. remove dirty/staged/untracked/HEAD consumption from historical helpers；
4. retain exact historical 11-path and 10-path assertions；
5. retain all existing process, worker, metric and public-boundary assertions。

Gate: historical E2 assertions pass against the frozen terminal head even when E3 lifecycle paths are present.

## Phase D — Add E3 final-state projection

In the same test file:

1. add exact original E3 eight-path constant；
2. add exact repair technical and task-file constants；
3. assert the three sets are disjoint；
4. add `currentE3FinalStateChanges()` from `4ad23773...` to live candidate；
5. assert exact union and exact eight-path subset；
6. verify evidence protocol/content and lifecycle state；
7. verify original nine planning hashes；
8. keep 08-30 historical with `stage6_e3_started=false`；
9. add all negative fixtures from `design.md`。

Gate: focused Workspace Law is 11 tests / 8 pass / exact 3 known historical fail-closed / 0 additional failures.

## Phase E — Candidate freeze

Update only the repair task lifecycle files and permitted parent projection. Record:

- exact technical commit；
- focused result and three exact historical names；
- typecheck/build/full-run classification；
- protected-path zero delta；
- E3 evidence hashes；
- independent implementation review pending。

Suggested technical commit:

```text
test(rkp-2): project E3 final workspace law state
```

No acceptance, archive, integration, push, cutover, qualification or RKP-3 action occurs in this phase.

## Validation commands

```powershell
python .\.trellis\scripts\task.py validate 08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair
python .\.trellis\scripts\task.py validate 08-26-rkp-2-stage-6-private-scale-evidence-seam-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
python .\.trellis\scripts\task.py validate 08-30-rkp-2-stage-6-semantic-canonical-authority-amendment

npm run typecheck
npm run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js

git diff --check
git status --short --branch
```

Additional scripted gates:

- parse all task JSON and every JSONL line；
- each JSONL path exists and is unique within its file；
- parent contains this child exactly once；
- original nine LF-normalized hashes exact-match；
- final range equals the frozen three-set union；
- changed technical subset equals the one-file allowlist；
- `src/**`、Rust files、worker/process/fixture、package/tsconfig/Cargo/spec zero delta from `4ad23773...`；
- no E3 temp residue；
- planning task immutable files remain unchanged after activation。

## Stop conditions

Return to planning review if any occurs:

- second technical file becomes necessary；
- original E3 needs a ninth lifecycle path；
- evidence must be regenerated；
- historical E2 set changes；
- one of three known fail-closed gates changes for reasons outside this task；
- S6.2/S6.3, runtime default or lifecycle authority must advance。

## Independent review handoff

The implementation candidate is ready only when the worktree is clean and the reviewer receives:

- accepted planning head；
- technical commit；
- exact full changed-path set；
- 11/8/3 focused output；
- original E3 protocol/hash manifest；
- original nine planning hashes；
- protected-path zero-delta output；
- explicit statement that the three historical reds remain intentionally fail closed。
