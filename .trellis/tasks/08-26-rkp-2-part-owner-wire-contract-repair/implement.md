# Implementation Plan — RKP-2 Part Owner Wire Contract Repair

## 1. Preconditions

Do not implement until a dedicated independent planning review returns PASS for the exact planning commit and the user separately authorizes implementation.

At activation time mechanically prove:

- planning commit and branch are exact; worktree and index are clean;
- `ce673a2ad62348fa73458d493a45f9c005bf0288` is an ancestor;
- child status is `planning`, `task_start_run=false`, `production_implementation_authorized=false` before `task.py start`;
- RKP-2 Stage 6 remains started/authorized but paused after S6.0; S6.1/S6.2/S6.3 are false;
- TypeScript remains default and protected paths have zero delta.

## 2. R0 — activation and lifecycle only

Ownership:

- child `task.json`, `operator-handoff.md`, `review-candidate.md`;
- RKP-2 `task.json`, `operator-handoff.md`, `review-candidate.md`;
- Rust parent `task.json`.

Actions:

1. Record the exact independent planning PASS and auditor identity.
2. Run `python .\.trellis\scripts\task.py start 08-26-rkp-2-part-owner-wire-contract-repair`.
3. Set child `status=in_progress`, `task_start_run=true`, and production/user implementation authorization true only for this six-path repair.
4. Keep `implementation_candidate_ready=false`, implementation review pending, archive/push/cutover/RKP-3/measurement false.
5. Keep RKP-2 Stage 6 operationally paused; do not resume S6.1.

Gate: child/RKP-2/Rust-parent Trellis, JSON/JSONL, unique parent reference, literal staged paths, `git diff --check`.

Rollback: revert only R0 to the accepted planning commit.

## 3. R1 — Foundation DTO serde repair and direct mapping tests

Technical ownership:

- `crates/brilliant-score-foundation/src/dto.rs`
- `crates/brilliant-score-foundation/src/codec.rs`

RED first:

1. Public Part owner with `partId` fails at the Foundation decoder on the base.
2. Base serialization of a constructed Part owner would use `part_id`.
3. Exact score owner succeeds through direct decode/encode. Score-extra rejection is not a Foundation RED because derived serde for an internally tagged unit variant does not close those fields.

GREEN:

1. Apply exactly the serde contract from `design.md`: enum `deny_unknown_fields`; field `#[serde(rename = "partId")]`; no alias.
2. Add direct tests for exact Part `partId` decode/encode and exact `Score` decode/encode.
3. Assert `part_id`, `partId+part_id`, and other Part extra fields reject.
4. Do not add a custom deserializer, alter the `Score` unit variant or assert direct Foundation rejection of score extras.
5. Assert nested extension payload and owner values remain detached/equal through canonical encode/decode/encode.

Focused gate:

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-score-foundation --locked
cargo +1.97.1 clippy -p brilliant-score-foundation --all-targets --locked -- -D warnings
```

Rollback: revert R1 only; R0 remains a truthful activated-but-blocked child.

## 4. R2 — Contracts, native parity and workspace-law proof

Technical ownership:

- `crates/brilliant-kernel-contracts/src/codec.rs`
- `test/core-kernel/rust-migration/rkp-2-store-fixtures.ts`
- `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts`
- `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts`

Actions:

1. Add a Contracts request fixture containing public `partId` and assert successful decode.
2. Freeze exact malformed owner bytes:
   - `part_id` only -> existing missing `partId` stable shape winner;
   - `partId+part_id` -> existing owner extra-field winner;
   - score plus `partId` or any other extra -> existing owner extra-field winner through the Contracts descriptor-first strict walk;
   - wrong-type/empty/unresolved Part IDs retain existing shape/semantic mapping.
3. Add deterministic fixture helpers containing score-owned and Part-owned unknown blocks, nested objects/arrays and nontrivial block order.
4. Through the real Windows addon, assert create/read success, only `partId` output, zero snake_case, repeated identical bytes and detached input/output aliases.
5. Assert malformed requests return payload only with zero handle.
6. Extend workspace-law to pin the exact serde attributes, forbid `alias`, enforce the six technical paths and preserve public counts.
7. Re-run the original S6.1 RED fixture and require GREEN.

Focused gates:

```powershell
cargo +1.97.1 test -p brilliant-score-foundation -p brilliant-kernel-contracts --locked
cargo +1.97.1 clippy -p brilliant-score-foundation -p brilliant-kernel-contracts --all-targets --locked -- -D warnings
npm.cmd run typecheck
npm.cmd run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js dist/test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.js
```

Rollback: revert R2 only. R1 remains directly testable Foundation Part mapping/exact-Score behavior; RKP-2 stays paused.

## 5. R3 — full gates, evidence and candidate freeze

Lifecycle/evidence ownership:

- child task artifacts including new `research/implementation-evidence.md`;
- RKP-2 task/handoff/review projection;
- Rust parent task projection.

Run from an exact clean technical HEAD:

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 check --workspace --all-targets --locked
cargo +1.97.1 test --workspace --all-targets --locked
cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
cargo +1.88.0 check --workspace --all-targets --locked
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
python .\.trellis\scripts\task.py validate 08-26-rkp-2-part-owner-wire-contract-repair
python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
```

Additionally:

- rebuild/load the Windows `.node` artifact with the existing deterministic DLL-to-`.node` process;
- run both `process.dlopen` and `require`, exact two exports and the `--expose-gc` native suite;
- run the accepted dynamic compiled-test runner and record manifest hash plus actual file/test/pass/skip/fail totals;
- parse every JSON/JSONL row, prove paths exist and are unique, and prove parent references child exactly once;
- prove implementation-base-to-candidate technical delta is a subset of exactly six literal paths;
- prove all other `crates/src/test`, Cargo/toolchain/rustfmt, package/tsconfig, specs/tasks and RKP-2 JSONLs have zero unapproved delta;
- prove `28/51/8/34/9`, `2`, `22`, `brilliant-score-1` and TypeScript default are unchanged.

After all gates pass, set child `implementation_candidate_ready=true`, keep implementation review pending, and write `READY FOR INDEPENDENT IMPLEMENTATION REVIEW`. Do not claim PASS.

Rollback: revert R3 to reopen evidence while preserving R0–R2 technical commits.

## 6. Review, closeout and RKP-2 resume

1. Dedicated read-only implementation audit of the exact R3 candidate.
2. Only after PASS and explicit owner authorization: record acceptance, natively archive the child, and integrate the accepted descendant into the original RKP-2 branch without rewriting `ce673a2`.
3. Verify active child removal/archive authority and parent projections.
4. Resume the preserved RKP-2 S6.1 only after the integrated repair head is exact and clean.

Planning approval does not authorize any of these later lifecycle actions.

## 7. Commit boundaries

Suggested independently reversible subjects:

1. `chore(rkp-2): activate part owner wire repair`
2. `fix(rkp-2): restore public part owner wire key`
3. `test(rkp-2): prove part owner native round trip`
4. `docs(rkp-2): prepare part owner repair review`

Do not squash the four stages before independent implementation review.
