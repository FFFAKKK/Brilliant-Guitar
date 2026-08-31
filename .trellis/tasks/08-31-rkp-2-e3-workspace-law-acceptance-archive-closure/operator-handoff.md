# Operator Handoff — Planning Candidate Only

## Current state

```text
base: c73e2139d3a1a9e89e4ec6071678d75be1c02abb
branch: codex/rkp-2-e3-law-acceptance-archive-closure
worktree: .worktrees/e3-law-acceptance-archive-closure
task: .trellis/tasks/08-31-rkp-2-e3-workspace-law-acceptance-archive-closure
status: planning
task_start_run: false
production_implementation_authorized: false
independent_planning_review: first review returned 0/3/0; second targeted review of 63212ae returned 0/1/0; third targeted review of bf15f20 confirmed Q4 closure and returned 0/1/0 only for the month rollover; bounded 2026-09-01 archive-date repair complete; fresh targeted rereview pending
```

This handoff is for a dedicated planning reviewer, not a production operator.

## Why this task exists

The E3 Workspace Law target has already passed a dedicated implementation review, but current law requires it at its active path. Direct native archive would invalidate that law. This task plans one extension to the same Workspace Law, then a finite target-archive/Q3-review/closure-archive sequence.

## Frozen ownership

Future technical owner:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Future lifecycle/context owners are exactly:

- three lifecycle files for this closure task;
- three lifecycle files plus `implement.jsonl` and `check.jsonl` for the E3 Workspace Law target;
- three lifecycle files for the Stage 6 parent.

Count: 11. No other files are authorized.

## Required review before implementation

The dedicated planning reviewer must verify:

1. this task is a Stage 6 sibling, not a target child;
2. 12-file target and 11-file closure manifests are exact;
3. Q0–Q4 cannot skip technical review or owner decisions;
4. planning/Q2/Q3/Q4 no-rename path arithmetic is `12/20/39/39`;
5. target 323-byte audit record moves unchanged;
6. new Q3 review record has exactly one owner;
7. the exact six target active self-references are removed in Q2 and JSONL remains valid after both archives;
8. future target/closure archive roots are under `archive/2026-09`, local `2026-09-01` before `23:50:00` is executable and fail-before-move, while accepted historical `archive/2026-08` roots remain unchanged;
9. Stage 6 terminal state does not start S6.2/S6.3;
10. Q4 uses one pre-staged native archive commit with no illegal committed intermediate state;
11. NUL-delimited porcelain status rejects every untracked, unstaged or extra path before archive;
12. the archive commit has exact Q3 as its only parent and commit-local closure `A11/D11` plus Stage 6 `M3` membership before the real Q4 law runs;
13. production/Rust/evidence/later gates have zero planning delta.
14. missing the `2026-09-01` execution window returns for another bounded date sync and never enables fallback month, manual move or system-clock change.

Required verdict: P0/P1/P2=`0/0/0`.

## Operator gate after planning PASS

Even after planning PASS, wait for a separate user implementation authorization. Then follow `implement.md` phase by phase and stop at Q3 for a dedicated implementation audit.

Do not:

- run `task.py start` during planning;
- archive either task during planning;
- edit the technical file during planning;
- rerun E3 stress;
- start S6.2/S6.3;
- accept/archive Stage 6 or RKP-2;
- integrate, qualify, cut over, push or create RKP-3.

## Immediate next gate

```text
READY FOR FRESH DEDICATED INDEPENDENT TARGETED PLANNING REREVIEW
```
