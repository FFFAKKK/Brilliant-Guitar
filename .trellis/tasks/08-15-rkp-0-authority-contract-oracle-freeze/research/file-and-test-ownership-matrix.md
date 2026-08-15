# RKP-0 File and Test Ownership Matrix

| Area | Allowed change | Purpose |
|---|---|---|
| RKP parent/task dirs | yes | planning, state and handoff |
| Core VNext parent selected docs | yes | next-gate and durable roadmap projection |
| CVN-7 selected task/evidence docs | yes | exact fifth invalid-input ledger |
| Core spec indices + transition spec | yes | current-vs-target authority |
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
7. current CVN-7 and full regressions.

The full suite count after RKP-0 equals the 516 baseline plus the newly discovered RKP-0 test cases. The operator reports both baseline and new totals rather than hard-coding an assumed final number in task metadata.
