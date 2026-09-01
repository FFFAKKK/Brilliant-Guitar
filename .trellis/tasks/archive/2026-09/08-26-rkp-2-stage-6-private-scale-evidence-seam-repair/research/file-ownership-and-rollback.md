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

Resource ownership is also singular. TypeScript owns validation and any pre-handoff cleanup; it validates before creating the request TEMP root. Once the PowerShell wrapper accepts the request/root, the wrapper alone owns request/stdout/stderr/root cleanup even when `Start-Process` fails. Its final sentinel is generated only after bounded cleanup status is known; the test fixture may release an injected lock after assertions, but that recovery is outside protocol state.

## Immutable planning authority — exact nine

After the bounded repair commit, implementation must not change:

1. `prd.md`
2. `design.md`
3. `implement.md`
4. `implement.jsonl`
5. `check.jsonl`
6. `research/root-cause-and-counter-write-map.md`
7. `research/scale-worker-and-failure-matrix.md`
8. `research/file-ownership-and-rollback.md`
9. `research/planning-self-audit.md`

The sole hash registry is child `task.json.meta.immutable_planning_authority`. Hash input is LF-normalized UTF-8 without BOM. Workspace law recomputes and exact-matches all nine during every E0-E3 gate. Digest mismatch is a planning violation, not an implementation repair opportunity.

## Mutable implementation lifecycle allowlist — exact eight

1. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/task.json`
2. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/operator-handoff.md`
3. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/review-candidate.md`
4. `.trellis/tasks/08-26-rkp-2-stage-6-private-scale-evidence-seam-repair/research/implementation-evidence.md`
5. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`
6. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md`
7. `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md`
8. `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`

Any ninth implementation-lifecycle path fails closed. No parent PRD/design/implement/JSONL, active spec, archive or unrelated task is an implementation owner.

## Protected paths

All other `crates/**`, especially Store, Runtime coordinator, Session, Node, Contracts and Foundation, are zero-delta. `src/**`, Cargo/toolchain/rustfmt, package/package-lock, tsconfig, public DTO/schema/failure/export inventories and unrelated tests/tasks/specs are zero-delta.

## Reversible stages

| Stage | Role | Independent rollback result |
| --- | --- | --- |
| E0 | activation/lifecycle | returns child to accepted planning; RKP-2 remains paused |
| E1 | private Rust seam, compile and small unit proof; no stress request | removes seam; no worker exists yet |
| E2 | sole fixture request, worker/process/workspace law, first real stress integration | retains directly tested seam; removes external worker |
| E3 | fresh request/run, evidence and candidate freeze | returns to technical head; no technical code changes |

After dedicated implementation PASS, owner acceptance/archive/integration are separate gates. Only then may separately instructed RKP-2 S6.2 consume the accepted evidence; it must not implement a second seam.
