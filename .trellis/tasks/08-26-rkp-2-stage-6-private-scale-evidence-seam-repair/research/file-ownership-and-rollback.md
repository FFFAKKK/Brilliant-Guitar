# File Ownership and Rollback

## Future technical allowlist — exact five

| Path | Owner/purpose | First stage | Rollback |
| --- | --- | --- | --- |
| `crates/brilliant-kernel-runtime/src/indices.rs` | `cfg(test)` private evidence record and exact ignored libtest | E1 | revert E1 |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts` | single fixture/request, artifact selection, evidence validation | E2 | revert E2 |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts` | success/hostile worker and process fixtures | E2 | revert E2 |
| `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1` | hidden process, timeout and peak working set | E2 | revert E2 |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | exact ranges and architecture law | E2 | revert E2 |

The existing fixture source is a read-only dependency, not an implementation path. It remains the sole fixture owner.

## Future lifecycle allowlist

The child owns its twelve planning artifacts and, at E3 only, `research/implementation-evidence.md`. Parent projection may touch only:

- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md`
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md`
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`

No parent PRD/design/implement/JSONL, active spec, archive or unrelated task is an implementation owner.

## Protected paths

All other `crates/**`, especially Store, Runtime coordinator, Session, Node, Contracts and Foundation, are zero-delta. `src/**`, Cargo/toolchain/rustfmt, package/package-lock, tsconfig, public DTO/schema/failure/export inventories and unrelated tests/tasks/specs are zero-delta.

## Reversible stages

| Stage | Role | Independent rollback result |
| --- | --- | --- |
| E0 | activation/lifecycle | returns child to accepted planning; RKP-2 remains paused |
| E1 | private Rust seam | removes seam; no worker exists yet |
| E2 | worker/process/workspace law | retains directly testable seam; removes external worker |
| E3 | evidence/candidate freeze | returns to technical head; no technical code changes |

After dedicated implementation PASS, owner acceptance/archive/integration are separate gates. Only then may separately instructed RKP-2 S6.2 consume the accepted evidence; it must not implement a second seam.
