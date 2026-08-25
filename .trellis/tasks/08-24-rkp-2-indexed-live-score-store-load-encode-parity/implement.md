# Implementation Plan — RKP-2 Indexed LiveScoreStore, Load/Encode and Index Parity

## 0. Planning stop gate

This candidate is docs-only. Do not run `task.py start`, edit production/tests/Cargo, create RKP-3, switch the default runtime, run official qualification, archive or push during planning.

The independent planning audit must report P0/P1/P2=`0/0/0`. User implementation authorization is a later explicit decision.

## 1. Activation preflight and Commit 0

### Entry

All conditions are required:

1. this exact planning candidate passed independent read-only audit;
2. RKP-1 post-archive workspace/authority repair was implemented, independently audited P0/P1/P2=`0/0/0`, accepted and archived;
3. the operator creates a final RKP-2 implementation branch from that accepted repair line and incorporates this planning commit without losing either parent child reference;
4. `git merge-base --is-ancestor 94387b339b5e4d9ce6b7f97597a1b56edd051f01 HEAD` succeeds;
5. archived RKP-1, archived post-archive repair and this RKP-2 task all exist at the final base;
6. RKP-1 focused workspace test, full Rust gates, TypeScript typecheck/build/full baseline and clean status pass;
7. `task_start_run=false` and `production_implementation_authorized=false` remain until the user authorizes the operator.

### Action after authorization

- record exact `implementation_base_commit` and accepted repair commit/archive path in `task.json`;
- run `python .\.trellis\scripts\task.py start 08-24-rkp-2-indexed-live-score-store-load-encode-parity`;
- set only this child as the parent's current/active implementation child;
- set task status `in_progress`, start/production authorization true, candidate readiness false;
- preserve TypeScript default and all public inventory counts.

### Owned files

- RKP-2 `task.json`, `operator-handoff.md`, `review-candidate.md`;
- Rust parent `task.json`.

### Commit

`chore(rkp-2): activate indexed live score store implementation`

### Rollback

Revert Commit 0 to the accepted planning HEAD. No production file has moved.

## 2. Stage 1 — Dependency and executable contract skeleton

### Input

Approved `design.md` sections 1, 2, 13 and 14.

### Files

```text
Cargo.toml
Cargo.lock
crates/brilliant-kernel-runtime/Cargo.toml
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
test/core-kernel/rust-migration/rkp-2-store-fixtures.ts
```

### Actions

1. Pin workspace `slotmap = "=1.1.1"` and add the Runtime-only workspace dependency.
2. Leave default `std` on and do not enable `serde` or `unstable`.
3. Add workspace-law tests for seven crates, dependency direction, exact pin/features, exact two Node exports, 22 failures, TypeScript default and protected public inventories.
4. Add deterministic fixture helpers only; do not add store code yet.
5. Prove Node/Contracts/Foundation do not import slotmap and RuntimeHandle text does not enter DTO/FFI crates.

### Focused gate

```powershell
cargo +1.97.1 metadata --format-version 1 --locked
npm.cmd run build
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js
```

Tests that depend on future store modules remain explicitly skipped or absent; no permanently red commit is created.

### Commit and rollback

`build(rkp-2): pin typed generational store dependency`

Revert Stage 1 to remove only the dependency and contract skeleton.

## 3. Stage 2 — Foundation exact time and full load validation

### Input

`design.md` sections 6 and 7 plus current TypeScript `validate-score-semantics.ts` as a semantic source, not a new public Rust diagnostic surface.

### Files

```text
crates/brilliant-score-foundation/src/lib.rs
crates/brilliant-score-foundation/src/codec.rs
crates/brilliant-score-foundation/src/fraction.rs
crates/brilliant-score-foundation/src/validation.rs
crates/brilliant-kernel-contracts/src/codec.rs
```

### Actions

1. Introduce private/public-to-workspace exact Fraction operations required by Runtime.
2. Move/extend structural validation into one deterministic load validator.
3. Register document ID before every entity ID.
4. Cover metadata, measures, Parts, Staffs, coverage, Voices, Events, Notes, exact sequence arithmetic, pitch/transposition and extensions.
5. Preserve the five existing `FoundationDecodeFailure` shape/semantic categories and exact `StablePathV1`; add only pathless workspace-internal `InternalCapacity`, and do not add any stable failure variant.
6. After exact Score shape decode, checked-pre-count and fallibly reserve borrowed-key `HashSet`/`HashMap` validation scratch plus exact-size `Vec` worklists before semantic traversal; replace allocation-per-node `BTreeSet<String>`, forbid scratch iteration from determining diagnostics, and do not reserve Runtime store containers here.
7. Make `decode_score_document_value` consume the completed validator while preserving its signature and the existing Contracts call seam.
8. In the single allowlisted Contracts codec, exhaustively map `FoundationDecodeFailure::InternalCapacity` to `StableFailureV1::BridgeInternal`; change no DTO, code string, public count or other Contracts path.
9. Add direct tests for every failure class, multiple-error precedence and arithmetic overflow.
10. Freeze exact wire/path mapping: empty top-level measures/parts and empty notes are `invalid-value`; empty staves/voices and missing/duplicate coverage/reference are `invalid-reference`.
11. Add a private reserve-fault seam used only by Rust tests: semantic-invalid plus Foundation reserve fault must select `InternalCapacity`, and the Contracts mapper must encode exact existing `bridge.internal`.

### Focused gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-score-foundation -p brilliant-kernel-contracts --locked
cargo +1.97.1 clippy -p brilliant-score-foundation -p brilliant-kernel-contracts --all-targets --locked -- -D warnings
```

### Commit and rollback

`feat(rkp-2): complete score load validation and exact time arithmetic`

Reverting Stage 2 restores RKP-1 Foundation validation and Contracts capacity mapping without touching dependency/tests.

## 4. Stage 3 — Typed records, topology and atomic private import

### Files

```text
crates/brilliant-kernel-runtime/src/lib.rs
crates/brilliant-kernel-runtime/src/handles.rs
crates/brilliant-kernel-runtime/src/records.rs
crates/brilliant-kernel-runtime/src/topology.rs
crates/brilliant-kernel-runtime/src/store.rs
```

### Actions

1. Define seven private typed keys and `RuntimeEntityRef`.
2. Define scalar records, DocumentHeader, PartMeasureKey/record and ScoreTopology.
3. After Session receives the Contracts-returned, already validated DTO, independently checked-pre-count and fallibly reserve only Runtime record/topology/index containers before insertion.
4. Build the private store in canonical input order; publish no Runtime yet.
5. Add private lookup/ownership/topology APIs needed by Stage 4 and tests.
6. Prove global IDs include document root and no original ScoreDocument field remains in store.
7. Add private stale-handle remove/reinsert tests; no Node mutation hook.
8. Add a private Runtime reserve-fault test proving a semantic-valid DTO produces `LiveStoreBuildFailure::InternalCapacity` and zero Runtime construction.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime store --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit and rollback

`feat(rkp-2): add typed live score records and atomic import`

Revert Stage 3 to remove the unused private store while retaining accepted Foundation work.

## 5. Stage 4 — Derived indices, exact-time query and rebuild parity

### Files

```text
crates/brilliant-kernel-runtime/src/indices.rs
crates/brilliant-kernel-runtime/src/time_index.rs
crates/brilliant-kernel-runtime/src/store.rs
crates/brilliant-kernel-runtime/src/lib.rs
```

### Actions

1. Build Entity, Ownership, Part/Measure, VoiceTime, Extension and Core Reference indices during import.
2. Ensure all resolution is map/typed-handle based; no nested lookup-by-ID scan.
3. Implement exact-start and half-open overlap range queries using binary search.
4. Add `rebuild_indices_from_store` and stable normalized projection.
5. Require local handle/count/edge invariants before production builder finish and execute full rebuild parity in focused verification tests.
6. Add a test-only corruption case that proves mismatch detection.
7. Add structural counters and assert expected linear counts on minimal/representative fixtures.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime indices --locked
cargo +1.97.1 test -p brilliant-kernel-runtime time_index --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit and rollback

`feat(rkp-2): add deterministic score indices and parity rebuild`

Revert Stage 4 to the private unindexed store; no Session/Node behavior has changed.

## 6. Stage 5 — Deterministic export and Runtime/Session integration

### Files

```text
crates/brilliant-kernel-runtime/src/lib.rs
crates/brilliant-kernel-runtime/src/smoke_runtime.rs          # delete
crates/brilliant-kernel-runtime/src/runtime.rs
crates/brilliant-kernel-runtime/src/store.rs
crates/brilliant-kernel-session/src/session.rs
test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts
test/core-kernel/rust-migration/rkp-2-store-fixtures.ts
```

### Actions

1. Implement `export_document` by explicit topology traversal.
2. Complete semantic equality and encode/decode/encode proof in focused test/differential paths before candidate acceptance; normal production creation publishes after local invariant checks and does not run this round-trip.
3. Replace internal `SmokeRuntime` with `KernelRuntime` owning LiveScoreStore and revision zero.
4. Route Session create through fallible Runtime construction and map semantic/internal failures to the unchanged 22-variant contract.
5. Keep Node source untouched and use the existing two create/read exports.
6. Prove repeated read bytes, detached aliases, optional fields, array order and unknown extensions.
7. Run valid and invalid RKP-0/TS fixture subsets through native create/read.
8. Route real Runtime creation through a private Session coordinator/factory seam; in Session unit tests substitute `LiveStoreBuildFailure::InternalCapacity`, assert exact existing `bridge.internal` and no `KernelSession`, then rely on the unchanged RKP-1 Node publish-after-accepted-Session law rather than adding a Node export or production fault hook.
9. After deleting `smoke_runtime.rs`, perform the one-time successor projection in the context manifests: replace exactly its one row in `implement.jsonl` and its one row in `check.jsonl` with `runtime.rs`. Anchor the comparison to approved planning state `53646c92b81bc3ac160ec5d72b0d3f80c97b7eb0`, require its LF-normalized manifests to equal those at Stage 5 parent `4f5f45a5f5a97968ef5280524cd4e6ab8dbebda8`, and allow projection commit `bda15099f4932aced965eabc6b6e147accd9b5ce` to change only the designated row's `file` and `reason` fields. Preserve row counts `25/20`, valid per-line JSON, existing paths, per-file path uniqueness and every other row and field.
10. Before Stage 6 authorization, close the one-time projection in `design.md`, this implementation plan and `research/file-test-and-rollback-matrix.md`; make workspace-law mechanically prove the three commits exist, the approved state is an ancestor of the Stage 5 parent, and the Stage 5 parent is the direct parent of the projection. It must also enforce the exact ten-path coordination allowlist and SHA-256 content freezes for the five repaired authority/manifest files. The resulting docs-only candidate requires a dedicated targeted planning rereview and does not itself authorize Stage 6.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime -p brilliant-kernel-session --locked
npm.cmd run build
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js dist/test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.js
```

The operator uses the existing RKP-1 native build/load procedure. Exact two exports and no Node source delta are mandatory.

### Commit and rollback

`feat(rkp-2): integrate indexed live store load and deterministic export`

Revert Stage 5 to restore `SmokeRuntime`; Stages 1–4 remain non-default and unused. If the one-time successor-projection repair has already been committed, revert its authority-closure commit and manifest-projection commit together before restoring the pre-Stage-5 context; neither commit is a second Runtime owner.

## 6.1 Blocking child — cross-platform complete test runner

Stage 6 cannot start or freeze an implementation candidate while complete TypeScript discovery still depends on `node --test "dist/test/**/*.test.js"`. Child `08-25-rkp-2-cross-platform-full-test-runner-contract-repair` is the sole test-infrastructure owner and must complete these gates first:

1. its exact planning candidate passes dedicated independent planning review P0/P1/P2=`0/0/0`;
2. separate user authorization activates and implements its deterministic literal enumeration, BigInt `(dev,ino)` physical-alias gate, `full-test-manifest-v1`, programmatic `node:test` execution and event-type-plus-pass-`data.file` coverage/exit contract;
3. Node 20.20.2 and 24.15.0, PowerShell and `cmd.exe`/`npm.cmd` evidence pass without a shell glob, new dependency or fixed file/test total;
4. after real events exposed the impossible unique-file-terminal premise, content commit P `44832ad01d136368c1b61203e9207ca4a521241f` corrects only event coverage, anchor A `c69d7b76175e2b818f4d276504a39b741e6e1975` pins `eed4871a..P` as exact twenty paths, and merge `b4906ac64a44cc735de7b923818817300d5c70fd` explicitly integrates the dedicated planning PASS into the preserved Stage-2 line;
5. correction `b20016882c16906db350feade4811821d55dad93` accepts duplicate passes, rejects malformed/unknown/partial pass-file coverage, preserves any-nesting fail and proves independent manifest/run-files/seen equality;
6. proof `ce9598eca3ad4df30854b8cc9383f4034e2e55a3` formed the first candidate `15c84a1929d1365ebf466088e896fd5309a4fa57`; after its `0/1/1` review, bounded repairs `f77549ef429dd2611d7f6144c164511599da9129` and `139f1271b651af0c1b70e151ba9604ef154442d7` preserve first observed failure and lock existing fail-closed branches. Targeted rereview of `6dac686d7f7dcaa447330209c6da04e414b7615c` returned `0/1/0` only for the workspace-law oracle; state `dd63ff2677c063bb78686b28a73b92c0f22a9d1b` and test `adaea920c8f8e92282c8871923d0c9e7ea156eab` make its independent model consume one ordered signal sequence, select failure via `firstFailure ??=`, and lock both orders for stream/test/outcome/interrupted/reporter combinations. Production runner files remain byte-identical, and the final evidence commit keeps exact `P..candidate`, 4-technical + 11-active-lifecycle and stops at `READY FOR INDEPENDENT IMPLEMENTATION REREVIEW`;
7. independent implementation review passes, then owner acceptance and native archive occur as separate lifecycle actions into the exact thirteen-path archive including implementation evidence;
8. the bounded closeout replaces all twelve active-child coordination paths by all thirteen archived successors, proves no dual authority, pins implementation/archive commits and recomputes five hashes while both RKP-2 JSONLs remain unchanged; and
9. an explicit fast-forward/merge integration gate creates a new RKP-2 Stage 6 prerequisite base containing the accepted child and current RKP-2 ancestry.

RKP-2 consumes the accepted runner and printed manifest only; it must not copy enumeration/reporting logic or become a second owner. During child planning/candidate review, RKP-2 remains at technical 21 and coordination 22; only post-PASS closeout may project coordination 23 (historical 10 + archive 13). The accepted package target is `npm run build && node dist/test/test-infrastructure/run-compiled-tests.js`. `package-lock.json`, product/Rust/native/CVN/qualification code and individual test contents remain unchanged. Even after integration, Stage 6 requires a new explicit user authorization.

## 7. Stage 6 — Hostile/resource/scale evidence and candidate freeze

### Files

```text
test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
test/core-kernel/rust-migration/rkp-2-store-fixtures.ts
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/operator-handoff.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/review-candidate.md
.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/research/implementation-evidence.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
```

### Actions

1. Complete hostile semantic, cap-edge, stale-handle, index-corruption and unknown-extension tests.
2. Run representative and 102,400-event fixture workers with 180-second liveness guard and capture counters/elapsed/RSS as diagnostic evidence.
3. Record that RKP-7 product budgets remain unchanged and unclaimed.
4. Run full gates below at exact candidate HEAD.
5. Compare changed paths with the literal implementation allowlist and protected paths.
6. Set `implementation_candidate_ready=true` only after all gates; keep implementation review pending.

### Complete gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 check --workspace --all-targets --locked
cargo +1.97.1 test --workspace --all-targets --locked
cargo +1.97.1 clippy --workspace --all-targets --locked -- -D warnings
cargo +1.88.0 check --workspace --all-targets --locked

npm.cmd run typecheck
npm.cmd run build
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js
node --test dist/test/core-kernel/rust-migration/rkp-1-workspace-contracts.test.js
node --test dist/test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.js dist/test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.js
npm.cmd test

python .\.trellis\scripts\task.py validate 08-24-rkp-2-indexed-live-score-store-load-encode-parity
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
git status --short --branch
```

Also verify:

- the accepted child runner prints a dynamic `full-test-manifest-v1`; its independently enumerated literal file set, actual `run({ files })` set and manifest-member `test:pass.data.file` seen set are equal, with actual file/test totals recorded rather than hard-coded;
- JSON/JSONL parsing and unique paths;
- parent child reference exactly once;
- exact dependency/features and seven crates;
- exact two Node exports, 22 failures and public 28/51/8/34/9 inventories;
- `git diff --name-only IMPLEMENTATION_BASE..HEAD -- src package.json package-lock.json tsconfig.json crates/brilliant-kernel-node crates/brilliant-core-types crates/brilliant-extension-protocol .trellis/spec` is empty;
- the Kernel Contracts delta is exactly the optional allowlisted `crates/brilliant-kernel-contracts/src/codec.rs` capacity mapping and no other Contracts path;
- implementation changed paths equal the literal allowlist subset actually required by the six stages;
- clean worktree and empty index after evidence commit.

### Commit and rollback

`test(rkp-2): qualify indexed store parity candidate`

Revert Stage 6 to remove only added evidence/status/final test expansions.

## 8. Independent implementation review

A separate read-only auditor receives:

- exact implementation base and candidate HEAD;
- all seven commit hashes;
- literal changed-path projection;
- Rust/Node/TypeScript gate evidence;
- representative/stress counter records;
- RKP-1 repair ancestry and archive proof.

Review focus:

1. no retained DTO tree or second state owner;
2. typed handles private and stale-safe;
3. explicit semantic order independent of SlotMap/HashMap iteration;
4. full validation order and unchanged 22 failures;
5. exact Fraction/time index correctness and O(log n + k) query;
6. no ID scans, normalized rebuild parity and effective corruption test;
7. atomic zero-session rejection and Node ownership unchanged;
8. deterministic/lossless encode and unknown extensions;
9. slotmap pin/features and protected path zero delta;
10. TypeScript default and RKP-3+ exclusions.

A return produces a bounded repair plan before code changes. A PASS allows owner acceptance/archive only; it does not activate RKP-3 automatically.

## 9. Acceptance and archive

After independent PASS and user acceptance:

1. record exact audited candidate and P0/P1/P2;
2. keep TypeScript default and official qualification state unchanged;
3. archive RKP-2 with native Trellis flow;
4. synchronize parent to `rkp2_status=accepted_archived`, no active child, next gate `rkp3-planning-creation`;
5. decide active-spec promotion as a separate docs-only authority step if needed;
6. create RKP-3 planning only in a later user-approved action.

No remote push is part of this task.
## Accepted full-runner archive projection

Dedicated implementation rereview accepted exact candidate 8d9a2a4a35c7707fad5398733eb43c08984bea2b at P0/P1/P2=0/0/0. Trellis native archive commit a1895f36090aafaa8865ffc21e1b6f15679e3be9 moved the child into the frozen 2026-08 archive destination with exactly thirteen artifacts, including research/implementation-evidence.md.

RKP-2 current coordination is now exactly historical ten plus archived thirteen = twenty-three. All twelve active-child paths are absent and mechanically forbidden; both RKP-2 JSONLs remain byte-identical. The accepted descendant is consumable only by fast-forward-only integration from eed4871a86191783d539b7d4097be3627e98e4a0. Stage 6 remains not started and not authorized, and TypeScript remains the default runtime.
