# RKP-2 E3 Acceptance-State Projection

## Goal

Project the exact independent implementation PASS for the frozen E3 Workspace Law candidate into a mechanically verifiable acceptance-preparation state. The audited candidate remains immutable; this task changes only the law that consumes that historical candidate and the bounded lifecycle records that point to the accepted audit.

## Background

- Audited candidate: `0c561d14193374436361eec09b361cab0170278a`.
- Audited technical commit: `36fe1956ec8660d664eb9606912dbc6e1b6c3ede`.
- Independent audit task: `01a01e48-1934-77b0-821e-a8026cd9e5f7`.
- Independent audit turn: `01a05589-d996-7ec1-ab58-b6f2db049e69`.
- Verdict: `PASS — READY FOR E3 ACCEPTANCE PREPARATION`, P0/P1/P2=`0/0/0`.
- The existing `assertE3LifecycleProjection()` accepts only the pre-review `pending` state and deliberately rejects `passed`. Recording the real audit result without a new state projection therefore adds one Workspace Law failure.
- The existing E3 candidate remains the exact historical union `8 original E3 + 1 technical + 12 repair-task paths = 21` from `4ad23773...` through `0c561d14...`.

## Requirements

### E3ASP-R001 — Preserve the audited candidate

The interval `4ad23773e9c9e1081667a4eccb84cc464b85bc89..0c561d14193374436361eec09b361cab0170278a` must remain an immutable historical projection with exactly 21 paths. The new task must not rewrite, amend, rebase or otherwise replace either endpoint.

### E3ASP-R002 — One audit-record owner

The authoritative implementation audit record must live only in the active E3 Workspace Law parent `task.json`. Its canonical V1 record is:

```json
{"schemaVersion":1,"reviewTaskId":"01a01e48-1934-77b0-821e-a8026cd9e5f7","reviewTurnId":"01a05589-d996-7ec1-ab58-b6f2db049e69","candidateCommit":"0c561d14193374436361eec09b361cab0170278a","technicalCommit":"36fe1956ec8660d664eb9606912dbc6e1b6c3ede","verdict":"PASS_READY_FOR_E3_ACCEPTANCE_PREPARATION","P0":0,"P1":0,"P2":0}
```

The UTF-8 representation is exactly 323 bytes and SHA-256 `dee0b92ce8a2ff6c8a9737c5b98104e39633b85aaad70e594f61e4847fdd7589`. The Stage 6 parent and this task may store only a reference and digest, not a second authoritative copy.

### E3ASP-R003 — Exact transition state machine

Workspace Law must distinguish these states:

1. historical audited candidate: exact `4ad23773..0c561d14` 21-path projection and pre-review pending lifecycle read from `0c561d14`;
2. acceptance-projection implementation: current branch contains the exact planning/lifecycle paths plus the one technical law path, while the authoritative parent still projects pending review;
3. acceptance-preparation candidate: the exact audit record is present, both active parents reference it, this child is candidate-ready, and every later gate remains false.

No free-form `passed` string is sufficient. Candidate commit, technical commit, task ID, turn ID, verdict, counts and canonical digest must all match.

### E3ASP-R004 — Exact file ownership

Immutable planning authority is exactly eight files:

1. `prd.md`;
2. `design.md`;
3. `implement.md`;
4. `implement.jsonl`;
5. `check.jsonl`;
6. `research/audit-pass-and-transition-gap.md`;
7. `research/file-test-and-rollback-matrix.md`;
8. `research/planning-self-audit.md`.

Future technical ownership is exactly:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Future lifecycle ownership is exactly nine paths:

```text
.trellis/tasks/08-31-rkp-2-e3-acceptance-state-projection/task.json
.trellis/tasks/08-31-rkp-2-e3-acceptance-state-projection/operator-handoff.md
.trellis/tasks/08-31-rkp-2-e3-acceptance-state-projection/review-candidate.md
.trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/task.json
.trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/operator-handoff.md
.trellis/tasks/08-31-rkp-2-stage-6-e3-workspace-law-final-state-projection-repair/review-candidate.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md
.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md
```

At terminal candidate freeze, `0c561d14..HEAD` must equal the disjoint union `8 immutable planning + 1 technical + 9 lifecycle = 18` paths.

### E3ASP-R005 — Fail-closed audit validation

The law must reject at least:

- review marked passed without the authoritative record;
- any mismatch in schema, task ID, turn ID, candidate, technical commit, verdict or P0/P1/P2;
- canonical record byte or digest drift;
- duplicate record ownership;
- 20-path or 22-path historical E3 projection;
- extra, missing or duplicate acceptance-projection path ownership;
- review PASS combined with S6.2/S6.3, archive, integration, qualification, cutover, push or RKP-3 advancement;
- TypeScript-default drift;
- the historical 08-30 task reclaiming live E3 ownership.

### E3ASP-R006 — Preserve visible historical gates

The three existing historical fail-closed test names remain unchanged. The terminal focused classification is exactly `11 tests / 8 pass / 3 historical fail / 0 additional`; full recorded classification remains `611/606/3/2` unless the manifest legitimately changes for an independently reviewed reason.

### E3ASP-R007 — Lifecycle boundary

This task stops at `READY FOR DEDICATED INDEPENDENT ACCEPTANCE-PROJECTION IMPLEMENTATION REVIEW`. It does not accept or archive itself or its parent, integrate to RKP-2, start S6.2/S6.3, run E3 stress, run official qualification, change the default runtime, push, or create RKP-3.

## Acceptance Criteria

- [ ] Independent planning review passes the exact planning head with P0/P1/P2=`0/0/0`.
- [ ] Implementation starts only after a later explicit user authorization.
- [ ] Historical candidate `4ad23773..0c561d14` is exact 21 paths and remains immutable.
- [ ] The audit V1 record is exact 323 UTF-8 bytes and matches SHA-256 `dee0b92c...7589`.
- [ ] Audit authority has one owner; all other lifecycle records contain only a reference/digest.
- [ ] The final acceptance-projection delta is exactly `8 + 1 + 9 = 18` paths.
- [ ] All negative fixtures fail closed without weakening the three historical gates.
- [ ] Focused Workspace Law returns exact `11/8/3/0 additional` on Node 20 and the current supported Node runtime.
- [ ] Typecheck, build, five relevant Trellis validations, JSON/JSONL, parent-child uniqueness and `git diff --check` pass.
- [ ] `src/**`, `crates/**`, Cargo, package, tsconfig, fixtures, worker/process and active specs have zero delta from `0c561d14`.
- [ ] Candidate and source E3 worktrees retain their required clean/frozen states.
- [ ] Candidate stops before every later lifecycle gate listed in E3ASP-R007.

## Out of Scope

- Re-running E3 stress or changing its fixture, protocol, counts, timeout or RSS budget.
- Repairing the three historical Workspace Law failures.
- Editing Rust, product code, Node exports, fixtures, workers, process wrappers or build configuration.
- Accepting, archiving or integrating any task.
- RKP-2 S6.2/S6.3, qualification, runtime cutover, push or RKP-3.

## Planning Status

Requirements are closed by repository evidence and the exact independent audit result. No product decision remains. The next gate after this planning candidate is a dedicated independent planning review.
