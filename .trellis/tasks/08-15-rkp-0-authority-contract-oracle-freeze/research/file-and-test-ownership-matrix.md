# RKP-0 File and Test Ownership Matrix

| Area | Allowed change | Purpose |
|---|---|---|
| RKP-0 task state | only `task.json`, `operator-handoff.md`, `review-candidate.md` | activation/result handoff only |
| Rust parent state | only `task.json`, `implement.md` | current-child and gate projection |
| Core VNext parent | only `task.json`, `implement.md`, `research/core-vnext-performance-baseline.md`, `research/cvn-roadmap-and-stage-plan.md` | next-gate and durable roadmap projection |
| CVN-7 task/status | only `task.json`, `operator-handoff.md`, `review-candidate.md`, `evidence/README.md` | record invalid input/status without evidence publication |
| CVN-7 failure ledger | only new `research/official-run-failure-ledger.jsonl` | exact fifth invalid-input row; outside `evidence/` |
| Core spec | only `index.md`, `backend/index.md`, new `backend/rust-runtime-transition.md` | current-vs-target authority |
| `test/core-kernel/rust-migration/**` exact files | yes | deterministic oracle and data contracts |
| `src/**` | zero | production runtime begins later |
| existing tests outside exact new directory | zero | preserve accepted baseline tests |
| package/lock/tsconfig | zero | no new runner or dependency |
| Cargo/Rust files | zero | RKP-1 owner |
| post-Core roadmap files | zero | boundary authority consumed read-only |
| archived tasks | zero | accepted history immutable |

## Required tests

1. oracle schema strict decode and extra/missing-field rejection;
2. command inventory equality and 28+28+8 counts;
3. unique scenario IDs and exact ordering;
4. two-generation byte equality;
5. per-row and whole-file hash verification;
6. qualification V2 data alignment with parent PRD and CVN-7 fixture constants;
7. exact SDK 8/34 and nine ABI name equality;
8. closed changed-path subset against the full PRD allowlist;
9. current CVN-7 and full regressions.

The full suite count after RKP-0 equals the 516 baseline plus the newly discovered RKP-0 test cases. The operator reports both baseline and new totals rather than hard-coding an assumed final number in task metadata.
