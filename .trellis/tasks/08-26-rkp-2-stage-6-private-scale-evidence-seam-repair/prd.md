# RKP-2 Stage 6 Private Scale Evidence Seam Repair

## 1. Goal

Create an independently reviewable planning authority for the smallest private evidence seam that makes the already-authorized RKP-2 Stage 6 S6.2 scale run executable. This task does not run S6.2, change product behavior, or claim a production-complexity defect.

## 2. Fixed baseline and lifecycle

- Exact planning base: `4a302bc9f9981940336fc97941b08e09bd0d1f67`.
- Parent: `08-24-rkp-2-indexed-live-score-store-load-encode-parity`.
- RKP-2 S6.1 is retained and complete at the exact base. S6.2 and S6.3 are not started.
- This child remains `planning`; `task_start_run=false`, `production_implementation_authorized=false`, `implementation_candidate_ready=false`, and independent planning review is pending.
- TypeScript remains the product default. Push, archive, cutover, RKP-3, official qualification and product-budget claims remain unauthorized.

## 3. Root-cause requirement

The planning P1 is an evidence ownership and allowlist gap:

- ten of the twelve `Rkp2StoreMetrics` categories already have checked write points for import, index construction, query or rebuild;
- `full_document_materializations` and `canonical_encode_bytes` have no non-zero write point;
- `verify_index_parity` is private to `LiveScoreStore`;
- the current Stage 6 three-TypeScript-path allowlist cannot add the Rust-only seam needed to invoke and observe those private operations.

This task must not reclassify that gap as a proven production performance or complexity failure.

## 4. Required future behavior

1. Add one `cfg(test)`-only Runtime libtest seam in `indices.rs`. It may compose existing private import metrics, `verify_index_parity` rebuild metrics, exactly one `export_document`, and exactly one canonical score encoding.
2. Record `full_document_materializations=1` locally after the single export and `canonical_encode_bytes=bytes.len()` locally after canonical encoding. Neither value may be written into persistent `KernelRuntime`, `LiveScoreStore` or another owner.
3. Emit one versioned, data-only evidence record for test consumption. No public export, DTO, Node surface, example binary, product binary, interior mutability, global state or second score owner is permitted.
4. Use only `createStressCvn7Score()` from `test/core-kernel/fixtures/cvn-7-qualification-score.ts`. The TypeScript worker writes a temporary create-request JSON and the Rust seam decodes it through the real Contracts codec. Rust must not recreate the fixture.
5. Precompile and uniquely resolve the `brilliant-kernel-runtime` libtest executable. The 180-second liveness interval starts only for the exact ignored/private test invocation, after compilation.
6. The Windows process wrapper must start the libtest hidden, sample `PeakWorkingSet64`, and fail closed on timeout, non-zero/abnormal termination, missing or malformed output, RSS sampling failure, counter/size/parity mismatch or any duplicate/missing sentinel.
7. Elapsed time and peak RSS are diagnostics. They are not RKP-7 product budgets, RKP-9 Qualification V2 results or official measurements.

## 5. Frozen future technical allowlist

Exactly five paths:

1. `crates/brilliant-kernel-runtime/src/indices.rs`
2. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts`
3. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts`
4. `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1`
5. `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Every other Runtime source, Store/Session/Node/Contracts source, `src/**`, Cargo/package/tsconfig/toolchain file, public API and unrelated test/task/spec is protected.

## 6. Frozen fixture and structural evidence

The single fixture snapshot is:

- measures `400`, parts `16`, staves `16`, voices `12800`, events `102400`, notes `51200`, extensions `18`;
- Part-owned extensions `16`; unknown extensions `1`;
- canonical score bytes `15013904`;
- create-request bytes `15013932`, below request cap `67108864`.

The private seam must verify:

- `entities_visited=166833`;
- record counts `400/16/16/12800/102400/51200/18`;
- `topology_edges_visited=173250`;
- `reference_edges_built=19216`;
- `time_entries_built=102400`;
- `index_entries_built=474517`;
- `index_rebuild_entries=474517`;
- `full_document_materializations=1`;
- `canonical_encode_bytes=15013904`;
- a real owner lookup changes only the accepted owner-lookup counter by the exact expected delta.

All arithmetic and conversions must be checked. Overflow is failure, never wraparound or partial evidence.

## 7. Acceptance criteria for this planning candidate

- [x] Root cause, counter write map, single fixture owner, private seam and worker boundary are frozen.
- [x] Five technical paths and exact lifecycle/rollback ownership are enumerated without wildcard.
- [x] E0 activation, E1 Rust seam, E2 worker/contracts and E3 evidence freeze are independently reversible.
- [x] Parent projections retain S6.1 and pause S6.2/S6.3 at independent planning review.
- [x] Planning changes are docs-only relative to the exact base.
- [ ] A dedicated independent planning auditor returns PASS before `task.py start` or any implementation.

## 8. Exclusions

No production metric persistence, Node/FFI export, DTO, Store/Runtime/Session behavior change, second fixture, dependency, command/transaction/history/event/provider work, default runtime switch, performance qualification, archive, push or RKP-3 creation.
