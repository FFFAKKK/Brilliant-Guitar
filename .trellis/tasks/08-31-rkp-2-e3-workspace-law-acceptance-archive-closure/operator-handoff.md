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
independent_planning_review: pending
```

This handoff is for a dedicated planning reviewer, not a production operator.

## Why this task exists

The E3 Workspace Law target has already passed a dedicated implementation review, but current law requires it at its active path. Direct native archive would invalidate that law. This task plans one extension to the same Workspace Law, then a finite target-archive/Q3-review/closure-archive sequence.

## Frozen ownership

Future technical owner:

```text
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
```

Future lifecycle owners are exactly the three lifecycle files for each of:

- this closure task;
- the E3 Workspace Law target;
- the Stage 6 parent.

No other files are authorized.

## Required review before implementation

The dedicated planning reviewer must verify:

1. this task is a Stage 6 sibling, not a target child;
2. 12-file target and 11-file closure manifests are exact;
3. Q0–Q4 cannot skip technical review or owner decisions;
4. planning/Q2/Q3/Q4 no-rename path arithmetic is correct;
5. target 323-byte audit record moves unchanged;
6. new Q3 review record has exactly one owner;
7. JSONL remains valid after both archives;
8. literal archive clock policy is executable and fail-before-move;
9. Stage 6 terminal state does not start S6.2/S6.3;
10. production/Rust/evidence/later gates have zero planning delta.

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
READY FOR DEDICATED INDEPENDENT PLANNING REVIEW
```
