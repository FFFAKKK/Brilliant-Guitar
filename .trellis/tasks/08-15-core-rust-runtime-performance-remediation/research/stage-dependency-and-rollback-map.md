# Stage Dependency and Rollback Map

| Stage | Depends on | Sole owner | Acceptance evidence | Rollback boundary |
|---|---|---|---|---|
| RKP-0 | `b21540fa` | authority/oracle contract | deterministic oracle + docs/test-only diff | revert RKP-0 commit |
| RKP-1 | accepted RKP-0 | Rust workspace/contracts | cargo + Node native smoke | remove RKP-1 workspace commit |
| RKP-2 | accepted RKP-1 | entity store/indices | round-trip, stale handle, index tests | revert store commit |
| RKP-3 | accepted RKP-2 | transactions/ChangeSet | atomicity + complexity counters | revert transaction commit |
| RKP-4 | accepted RKP-3 | history/read/event/replay | behavioral differential | revert RKP-4 commit |
| RKP-5 | accepted RKP-4 | validation/Rust SDK | incremental/full equality | revert RKP-5 commit |
| RKP-6 | accepted RKP-5 | official providers | synthetic two-module parity | revert provider migration |
| RKP-7 | accepted RKP-6 | full differential/performance | 516 baseline + seeded oracle + budgets | Rust remains non-default |
| RKP-8 | accepted RKP-7 | production cutover | complete regression on Rust default | revert one cutover commit |
| RKP-9 | accepted RKP-8 | Qualification V2 plus legacy transaction-engine/differential-runner cleanup | fresh official evidence + audit; CVN-2 SDK 8/34 retained | revert cleanup; Rust default stays |

Tree membership does not imply activation. The parent metadata and child artifacts must explicitly state the accepted predecessor. One failed or returned child blocks all later creation.
