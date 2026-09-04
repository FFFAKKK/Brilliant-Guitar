# Implementation Plan — RKP-3 Transaction Overlay, ChangeSet and 28 Core Commands

## 0. Current gate

```text
task status: planning
task.py start: not run
production implementation authorized: false
planning base: 6d0956c970f4414cb61e0f3d7148672a6e635032
branch: codex/rkp-3-transaction-overlay-changeset-planning
default runtime: TypeScript
RKP-4 / qualification / cutover / push authorized: false
```

This plan may be executed only after the final planning artifacts are reviewed
and the owner explicitly approves implementation. Inline mode will load the
relevant Trellis specs through `trellis-before-dev`; it does not require
sub-agent JSONL manifests.

## 1. Activation and immutable entry gate — C0

### Preconditions

1. Planning candidate is one exact commit and worktree is clean.
2. HEAD descends from exact accepted RKP-2 base `6d0956c...`.
3. Task parent is `08-15-core-rust-runtime-performance-remediation` exactly
   once and the parent has no other current planning/implementation child.
4. RKP-2 is accepted/archived and its source worktree remains clean.
5. Frozen oracle/manifest hashes equal the base.
6. Seven crates and Cargo dependency graph equal the base.
7. TypeScript is still default and RKP-4+ flags are false.
8. Changed paths relative to base are planning allowlist only.
9. PRD, design, implementation plan and research self-audit pass.
10. Explicit implementation authorization is recorded.

### Actions after authorization

```powershell
python .\.trellis\scripts\task.py start 09-04-rkp-3-transaction-overlay-changeset-core-commands
```

Then load `trellis-before-dev`, freeze exact planning/base hashes in
`operator-handoff.md`, set task/parent lifecycle fields to C0, and commit only
activation coordination files.

### Gate

```powershell
python .\.trellis\scripts\task.py current --source
python .\.trellis\scripts\task.py validate 09-04-rkp-3-transaction-overlay-changeset-core-commands
git diff --check
git status --short --branch
```

### Commit / rollback

`chore(rkp-3): activate reviewed transaction stage`

Revert C0 and run the Trellis finish/clear flow. No production path has changed.

## 2. Strict contracts and checked revision — C1

### Files

```text
crates/brilliant-core-types/src/scalar.rs
crates/brilliant-kernel-contracts/src/lib.rs
crates/brilliant-kernel-contracts/src/command.rs
crates/brilliant-kernel-contracts/src/codec.rs
test/core-kernel/rust-migration/rkp-3-transaction-fixtures.ts
test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts
```

### Actions

1. Add `DocumentVersionV1::checked_next()` with initial, regular, max-safe and
   overflow tests; add no public integer constructor.
2. Define exact closed target/anchor/range/command DTOs for all 28 IDs.
3. Define the private Stage-3 command failure subset, private local-invariant/
   ChangeSet-cap cases, affected addresses, metrics and result union.
4. Extend strict field inventory and implement `decode_stage3_submit_request`
   without weakening create decode.
5. Preserve exact route precedence: shape, version, ID, target kind, target,
   payload.
6. Encode Stage-3 results through the existing 64 MiB capped writer.
7. Add literal contract tests for exact 28 order/target kinds, exact DTO keys,
   unchanged 22 bridge failures, seven crates, and manifest/lock zero delta.

### Focused gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-core-types -p brilliant-kernel-contracts --locked
cargo +1.97.1 clippy -p brilliant-core-types -p brilliant-kernel-contracts --all-targets --locked -- -D warnings
npm.cmd run typecheck
```

### Commit / rollback

`feat(rkp-3): add strict command contracts and checked revisions`

Revert C1. C0 remains coordination-only.

## 3. Typed ChangeSet and transaction overlay — C2

### Files

```text
crates/brilliant-kernel-runtime/src/lib.rs
crates/brilliant-kernel-runtime/src/change_set.rs
crates/brilliant-kernel-runtime/src/overlay.rs
crates/brilliant-kernel-runtime/src/records.rs
crates/brilliant-kernel-runtime/src/topology.rs
crates/brilliant-kernel-runtime/src/indices.rs
crates/brilliant-kernel-runtime/src/time_index.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Implement the exact 11-operation stable ChangeSet vocabulary and detached
   entity bundles from `design.md`.
2. Implement stable address/order/anchor, typed values, preconditions, and
   reverse-safe inverse construction.
3. Implement overlay entity state, touched record/order/reference/time views,
   first-observed affected dedupe, and batch segments.
4. Keep a handler-supplied TypeScript-compatible prepared-effect counter
   separate from primitive ChangeSet operation count.
5. Restrict read/builder APIs; prove they expose neither Store/Handle nor full
   export/traversal.
6. Implement checked 256 MiB logical accounting with published weights, shared
   arena, ID interning and Rust-test-only boundary hooks.
7. Prove every owned field is charged and accepted 64 MiB create/command
   boundary fixtures fit. Stop and replan if the proof fails.
8. Test repeated writes, insert-then-edit/remove, tombstones, copy-on-first-
   write orders, inverse order, and drop-with-base-unchanged.

### Focused gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-kernel-runtime change_set --locked
cargo +1.97.1 test -p brilliant-kernel-runtime overlay --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): add typed changesets and transaction overlay`

Revert C2; contracts remain unused by production Session/Node.

## 4. Prepared store/index adoption — C3

### Files

```text
crates/brilliant-kernel-runtime/src/transaction.rs
crates/brilliant-kernel-runtime/src/runtime.rs
crates/brilliant-kernel-runtime/src/store.rs
crates/brilliant-kernel-runtime/src/topology.rs
crates/brilliant-kernel-runtime/src/indices.rs
crates/brilliant-kernel-runtime/src/time_index.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Add typed detach/count/reserve/adopt helpers for every bundle and order.
2. Build entity/owner/reference/extension/time deltas against stable IDs and
   temporary insertion tokens.
3. Complete invariant checks, replacement vectors, version check and every
   `try_reserve` before live element mutation.
4. Implement `CommitPlan::adopt` without an expected `Result`: insert/bind
   handles, swap records/orders, update indices, remove slots last, then write
   version and committed metrics.
5. Force reservation/local-preflight failures and prove canonical export,
   version, index projection and committed metrics unchanged.
6. Test an impossible boundary panic: the session must become poisoned instead
   of returning a normal command rejection.
7. Apply forward/inverse/forward for every change class and rebuild indices
   independently after each leg.

### Focused gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-kernel-runtime transaction --locked
cargo +1.97.1 test -p brilliant-kernel-runtime store --locked
cargo +1.97.1 test -p brilliant-kernel-runtime indices --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): adopt prepared store and index deltas atomically`

Revert C3 before C2. No Session/Node submit exists yet.

## 5. First six local commands — C4

### Files

```text
crates/brilliant-kernel-session/src/lib.rs
crates/brilliant-kernel-session/src/session.rs
crates/brilliant-kernel-session/src/commands/mod.rs
crates/brilliant-kernel-session/src/commands/catalog.rs
crates/brilliant-kernel-session/src/commands/local.rs
crates/brilliant-kernel-runtime/src/runtime.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Add the literal ordered catalog and closed dispatch; compare it mechanically
   to Contracts and the TypeScript catalog.
2. Add the Session transaction coordinator: one overlay lifetime, handler
   dispatch, and no-op/reject/commit result mapping.
3. Port metadata, WrittenPitch, NoteValue, Notes Event insert, Rest Event
   insert, and Event remove against restricted APIs.
4. Preserve caller IDs, event/note order, target/anchor failures, no-op values,
   affected order, references, and owning Voice time index.
5. Assert local edit global-work counters are zero and unrelated Part/Voice
   visits are zero.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-session local --locked
cargo +1.97.1 test -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-session -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): port local scalar and event commands`

Revert C4; C1-C3 remain private primitives.

## 6. Measure aggregate commands — C5

### Files

```text
crates/brilliant-kernel-session/src/commands/measure.rs
crates/brilliant-kernel-session/src/commands/mod.rs
crates/brilliant-kernel-runtime/src/overlay.rs
crates/brilliant-kernel-runtime/src/transaction.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Port insert/remove/move/set-definition in TypeScript adapter order.
2. Enforce one content entry per current Part for insert, global duplicate-ID
   checks, stable anchors and caller-supplied IDs.
3. Detach/reinsert complete Measure bundles, including each Part content and
   Voice/Event/Note descendant.
4. Preserve accepted normalization of Part content orders to global Measure
   order when source orders differ.
5. Test first/last/middle insert/remove/move, shuffled source order,
   self/missing anchors, no-op alignment, batch visibility and exact inverse.
6. Keep final whole-score semantic diagnostic behavior explicitly unclaimed;
   use the private local-invariant rejection until RKP-5 owns diagnostics.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-session measure --locked
cargo +1.97.1 test -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-session -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): port measure aggregate commands`

Revert C5; first-six commands remain private and functional.

## 7. Part, Staff, Voice and reference commands — C6

### Files

```text
crates/brilliant-kernel-session/src/commands/hierarchy.rs
crates/brilliant-kernel-session/src/commands/mod.rs
crates/brilliant-kernel-runtime/src/overlay.rs
crates/brilliant-kernel-runtime/src/transaction.rs
crates/brilliant-kernel-runtime/src/indices.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Port all 15 hierarchy handlers in exact catalog order.
2. Implement Part bundle insert/remove with Staff/content descendants and
   part-owned unknown ExtensionBlocks in original document order.
3. Implement typed Staff/Voice order insert/remove/move and scalar definitions.
4. Resolve default/event Staff references through owner/entity indices; reject
   cross-Part and removal conflicts deterministically.
5. Rebuild only affected Voice time/reference indices and preserve unrelated
   identity/order.
6. Test aggregate inverse, stale handle invalidation, anchor owner/self rules,
   effective Staff assignment no-op, inserted-then-targeted batch children, and
   unknown extension preservation.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-session hierarchy --locked
cargo +1.97.1 test -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-session -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): port part staff and voice commands`

Revert C6; C4-C5 remain.

## 8. Indexed range and atomic batch — C7

### Files

```text
crates/brilliant-kernel-session/src/commands/range.rs
crates/brilliant-kernel-session/src/commands/mod.rs
crates/brilliant-kernel-session/src/session.rs
crates/brilliant-kernel-runtime/src/overlay.rs
crates/brilliant-kernel-runtime/src/transaction.rs
crates/brilliant-kernel-runtime/src/time_index.rs
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
```

### Actions

1. Port inclusive, reversible Measure/PartMeasure/VoiceEvent selection through
   entity/owner indices and one local order vector per endpoint.
2. Port range delete as ordered Measure-bundle/Event removals.
3. Port exact written-pitch transposition with checked arithmetic and first
   failing Note in semantic order.
4. Implement dense 1..100 batch, child-local nested detection, sequential raw
   child decode, shared overlay, lowest child failure, effect/affected/
   ChangeSet caps, child segments, all-no-op, and one adoption/version.
5. Test reversed/missing/wrong-owner endpoints, zero transpose, all four
   transform failures, child insert-then-edit/remove, 100/101, aggregate caps,
   every child failure index, and base equality after rejection.
6. Prove range work scales with selected interval plus descendants rather than
   a stable-ID scan of the full document.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-session range --locked
cargo +1.97.1 test -p brilliant-kernel-session batch --locked
cargo +1.97.1 test -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-session -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-3): port indexed range and atomic batch commands`

Revert C7; 25 non-range/batch handlers remain.

## 9. Private native submit seam — C8

### Files

```text
crates/brilliant-kernel-node/src/lib.rs
crates/brilliant-kernel-node/src/boundary.rs
crates/brilliant-kernel-session/src/session.rs
src/core-kernel/native/rust-kernel-smoke.ts
test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts
test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts
test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts
```

### Actions

1. Add exact value-only
   `submitKernelStage3V1(handle, requestBytes) -> Buffer` export.
2. Reuse existing handle validation, owner/thread/busy/reentrant/poison and panic
   boundaries; acquire the session exactly once around submit.
3. Preserve request/response 64 MiB caps and no raw error leakage.
4. Update private TypeScript capture/encode/decode/freeze with exact Stage-3
   result keys; generalize read snapshot version from literal zero to a safe
   nonnegative integer while history/dirty placeholders stay unchanged.
5. Keep opaque handles empty/frozen and submit responses detached/frozen with no
   document or ChangeSet.
6. Narrow predecessor test edits to required create/read subset assertions;
   RKP-3 test owns the exact three-export successor law.
7. Build/load the real addon and test wrong kind, unknown/stale, other thread,
   busy/reentrant, poison, raw duplicate JSON, cap, malformed response, hostile
   JS input, repeated read, and committed version.

### Native build and focused gate

```powershell
cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked
$rkp3NativeSource = 'target\x86_64-pc-windows-msvc\debug\brilliant_kernel_node.dll'
$rkp3NodeTarget = 'target\rkp-1-node\brilliant_kernel_node.node'
if (-not (Test-Path -LiteralPath $rkp3NativeSource -PathType Leaf)) { throw 'missing RKP-3 native DLL' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rkp3NodeTarget) | Out-Null
Copy-Item -LiteralPath $rkp3NativeSource -Destination $rkp3NodeTarget
if (-not (Test-Path -LiteralPath $rkp3NodeTarget -PathType Leaf)) { throw 'missing RKP-3 .node copy' }
npm.cmd run typecheck
npm.cmd run build
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js dist/test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.js dist/test/core-kernel/rust-migration/rkp-3-native-transaction.test.js
```

If `node_modules` is absent, run `npm.cmd ci --ignore-scripts --offline` first.
If the local cache is insufficient, request only dependency-install network
permission and keep package files byte-identical.

### Commit / rollback

`feat(rkp-3): expose private native submit evidence seam`

Revert C8 to restore create/read-only native ABI; the Rust transaction code
remains unreachable from the application default.

## 10. Oracle projection and candidate freeze — C9

### Files

```text
test/core-kernel/rust-migration/rkp-3-transaction-fixtures.ts
test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts
test/core-kernel/rust-migration/rkp-3-oracle-projection.test.ts
.trellis/spec/core-kernel/backend/rust-runtime-transition.md
.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/task.json
.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/operator-handoff.md
.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/review-candidate.md
.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/implementation-evidence.md
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md
```

### Actions

1. Parse the immutable 64-row oracle with its existing strict schema.
2. Select exactly 28 accepted submits, 28 missing-target rejections, atomic
   batch, and batch-child rejection.
3. Compare accepted canonical document/read version; rejected failure/version/
   byte-identical document; and exact ID coverage/order.
4. Explicitly exclude history/dirty/events/replay/support/plugin/migration
   observations from RKP-3 claims.
5. Complete hostile decoder, cap, inverse, index parity, counter and panic tests.
6. Run full gates at one exact candidate HEAD and record actual counts,
   commands, native hashes, fixture hashes, timings and counters.
7. Use `trellis-update-spec` only for the concise accepted RKP-3 transition
   contract; do not alter TypeScript behavior or later-stage specs.
8. Compare exact changed paths to the literal allowlist and all protected paths
   to base.
9. Set `implementation_candidate_ready=true` only after every gate passes;
   keep review/acceptance/archive false.

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
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.js dist/test/core-kernel/rust-migration/rkp-3-native-transaction.test.js dist/test/core-kernel/rust-migration/rkp-3-oracle-projection.test.js
npm.cmd test

python .\.trellis\scripts\task.py validate 09-04-rkp-3-transaction-overlay-changeset-core-commands
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
git status --short --branch
```

Also require:

- exact seven-crate list and Cargo manifest/lock hashes equal base;
- exact Node exports are three and existing 22 bridge failures unchanged;
- public TypeScript inventories remain 28/51/8/34/9;
- oracle/manifest/qualification fixture byte hashes equal base;
- submit result contains no document and explicit read is a separate call;
- local submit first four global counters are zero;
- no generated DLL/`.node`, target, dist or node_modules file is tracked;
- changed paths are exact allowlist subsets;
- TypeScript default, qualification, cutover, RKP-4 and push remain false.

### Commit / rollback

`test(rkp-3): qualify stage-owned transaction projections`

Revert C9 to remove evidence/spec/candidate status; C0-C8 remain an unaccepted
private implementation. Full rollback continues C8 to C0 in reverse.

## 11. Independent implementation review

The fresh read-only review receives exact approved base and candidate commits
and must inspect, not infer from green tests:

1. no full document/store/index clone or hidden global traversal;
2. stable IDs in ChangeSet and handles only in CommitPlan;
3. exact preconditions/inverse order for aggregate insert/remove/move;
4. no expected failure after first live mutation;
5. SlotMap generation/index/reference/time consistency;
6. batch later-child visibility, lowest failure and one adoption;
7. 28 handler semantics and exact failure/no-op order;
8. accounting completeness and cap compatibility proof;
9. Node mutex/panic/GC/byte/detachment safety;
10. honest stage-only oracle and counter claims;
11. predecessor laws, protected paths and dependency zero delta;
12. TypeScript default and every later gate false.

Any P0/P1/P2 finding returns a bounded repair and targeted rereview. A
P0/P1/P2 `0/0/0` result permits only an owner acceptance/archive decision.

## 12. Closeout boundary

After separate owner acceptance, archive this task with native Trellis flow,
update the parent to `rkp3_status=accepted_archived`, clear its current child,
and record the exact audited commit. RKP-4 planning can be proposed only after
that closeout.

No remote push, qualification run, default-runtime cutover, RKP-4 task start,
or public API claim is part of RKP-3.
