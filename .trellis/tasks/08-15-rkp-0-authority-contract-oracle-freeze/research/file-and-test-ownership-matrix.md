# RKP-0 File and Test Ownership Matrix

| Area | Allowed change | Purpose |
|---|---|---|
| RKP-0 task state | only `task.json`, `operator-handoff.md`, `review-candidate.md` | activation/result handoff only |
| Rust parent state | only `task.json`, `implement.md` | current-child and gate projection |
| Core VNext parent | only `task.json`, `implement.md`, `research/core-vnext-performance-baseline.md`, `research/cvn-roadmap-and-stage-plan.md` | next-gate and durable roadmap projection |
| CVN-7 task/status | only `task.json`, `operator-handoff.md`, `review-candidate.md`, `evidence/README.md` | record invalid input/status without evidence publication |
| CVN-7 failure ledger | only new `research/official-run-failure-ledger.jsonl` | exact fifth invalid-input row; outside `evidence/` |
| Core spec | only `index.md`, `backend/index.md`, new `backend/rust-runtime-transition.md` | current-vs-target authority |
| `test/core-kernel/rust-migration/oracle-schema.ts` | create | strict data-only oracle contracts and decoders |
| `test/core-kernel/rust-migration/ts-oracle-fixtures.ts` | create | literal fixture, assembly and 64-scenario construction |
| `test/core-kernel/rust-migration/ts-oracle-capture.test.ts` | create | deterministic TypeScript oracle capture and regeneration checks |
| `test/core-kernel/rust-migration/oracle-manifest.test.ts` | create | exact manifest, hashes, inventory and Qualification V2 checks |
| `test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json` | create | frozen exact-name and fixture-provenance manifest |
| `test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl` | create | canonical 64-row oracle corpus |
| `test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json` | create | machine-readable qualification method and budgets |
| `src/**` | zero | production runtime begins later |
| all tests outside the seven exact paths above | zero | preserve accepted baseline tests |
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

This matrix is a projection of the explicit repository-relative allowlist in `prd.md`; it cannot add, imply or widen an allowed path. Directory wildcards and sibling files are excluded.

The full suite count after RKP-0 equals the 516 baseline plus the newly discovered RKP-0 test cases. The operator reports both baseline and new totals rather than hard-coding an assumed final number in task metadata.
