# Implementation Plan — RKP-4 History, Snapshots, Events and Replay

## 0. Activation boundary — C0

Do not execute this plan from planning approval alone. The operator first needs
an explicit owner reply to the question that names `task.py start` and private
RKP-4 implementation.

After approval:

1. verify exact HEAD is the reviewed RKP-4 planning candidate, worktree is
   clean, RKP-3 is accepted/archived, and TypeScript remains default;
2. run `python .\.trellis\scripts\task.py start 09-04-rkp-4-history-snapshots-events-replay`;
3. record the authorization source/scope and activation commit in this task and
   the parent; set only RKP-4 implementation active;
4. assert no other planning/implementation child is active;
5. commit `chore(rkp-4): activate private history runtime implementation`.

C0 authorizes C1-C8 only. It does not authorize acceptance, archive, RKP-5,
qualification, runtime cutover, cleanup, push, or product work.

## 1. Exact implementation allowlist

```text
crates/brilliant-kernel-contracts/src/codec.rs
crates/brilliant-kernel-contracts/src/command.rs
crates/brilliant-kernel-contracts/src/lib.rs
crates/brilliant-kernel-contracts/src/session.rs
crates/brilliant-kernel-runtime/src/lib.rs
crates/brilliant-kernel-runtime/src/runtime.rs
crates/brilliant-kernel-runtime/src/transaction.rs
crates/brilliant-kernel-runtime/src/history.rs                 (new)
crates/brilliant-kernel-runtime/src/session_projection.rs      (new)
crates/brilliant-kernel-runtime/src/selectors.rs               (new)
crates/brilliant-kernel-runtime/src/checkpoint.rs              (new)
crates/brilliant-kernel-session/src/lib.rs
crates/brilliant-kernel-session/src/session.rs
crates/brilliant-kernel-node/src/boundary.rs
crates/brilliant-kernel-node/src/lib.rs
src/core-kernel/native/rust-kernel-smoke.ts
test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts  (successor-only)
test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts (successor-only)
test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts (successor-only)
test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts (successor-only)
test/core-kernel/rust-migration/rkp-4-fixtures.ts                (new)
test/core-kernel/rust-migration/rkp-4-history-events.test.ts    (new)
test/core-kernel/rust-migration/rkp-4-read-selectors.test.ts    (new)
test/core-kernel/rust-migration/rkp-4-replay-oracle.test.ts     (new)
test/core-kernel/rust-migration/rkp-4-workspace-contracts.test.ts (new)
.trellis/spec/core-kernel/backend/rust-runtime-transition.md
.trellis/tasks/09-04-rkp-4-history-snapshots-events-replay/**
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json
.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md
.trellis/workspace/ATOM/**
```

No Cargo/npm manifest or lockfile change is planned. If implementation proves
another production or test path necessary, stop and amend/review the allowlist
before editing it.

## 2. Contracts and RED state invariants — C1

### Actions

1. Add behavioral RED Rust/Node contract tests for exact history, read/select,
   checkpoint, event, operation and replay DTO shapes and failure precedence.
2. Add exact Stage-4 tagged codecs while reusing the existing strict JSON,
   property/depth/dense-array/safe-number and 64 MiB helpers.
3. Define internal history/event/checkpoint/read DTOs with no public product
   export and no JS/Rust handle/function/path/raw-error field.
4. Add `HistoryStateV1` and `SessionProjectionStateV1` constructors and
   invariant checks with initial sequence/identity/event values.
5. Add checked history/event arithmetic and `try_reserve` helpers; prove the
   max-safe boundary fails before mutation.
6. Freeze exact constants 512, 33,554,432 and retained checkpoint count 1.
7. Update workspace contracts to assert exactly five eventual Node exports,
   unchanged seven crates/dependencies and unchanged 28/51/8/34/9 inventories.

### Focused gate

```powershell
cargo +1.97.1 fmt --all -- --check
cargo +1.97.1 test -p brilliant-kernel-contracts -p brilliant-kernel-runtime --locked
cargo +1.97.1 clippy -p brilliant-kernel-contracts -p brilliant-kernel-runtime --all-targets --locked -- -D warnings
npm.cmd run typecheck
```

### Commit / rollback

`feat(rkp-4): define history read event and replay contracts`

Revert C1. C0 remains coordination-only.

## 3. Vector/cursor history and stored-effect undo/redo — C2

### Actions

1. Add RED tests for multi-step history, no-op/rejection preservation, empty
   cases, branch-tail truncation and non-reused sequence identities.
2. Refactor the accepted RKP-3 commit entry point to receive the detached Core
   semantic envelope and append its returned `ChangeSetV1` only after every
   reservation/preflight succeeds.
3. Promote the cfg-test stored operation application seam into a private
   production `prepare_stored_effect_adoption` path; expose no ChangeSet over
   Node.
4. Implement undo inverse and redo forward preflight/adoption across all RKP-3
   change classes, stable affected addresses and batch segments.
5. Reserve version/identity/history capacity before the first live write;
   preserve cursor/vector/store/indices/version on every expected failure.
6. Append content identity for every effective submit/undo/redo version and
   retain removed-tail version identities.
7. Inject precondition, allocation, invariant and adoption-panic failures;
   assert expected zero delta and unexpected permanent handle poison.
8. Keep RKP-5 validation hooks explicit but inactive; tests use only the
   RKP-3-safe semantic command subset and make no support claim.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime history --locked
cargo +1.97.1 test -p brilliant-kernel-runtime stored_effect --locked
cargo +1.97.1 test -p brilliant-kernel-session history --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime -p brilliant-kernel-session --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-4): add atomic vector cursor history`

Revert C2; C1 leaves unused private DTO/state primitives.

## 4. Dirty identity and deterministic native events — C3

### Actions

1. Add RED tests for initial/edit/save/delayed-save/undo/redo/branch/deep-equal
   dirty behavior and all checkpoint validation failures.
2. Implement append-only document-version-to-content-identity lookup and exact
   `markPersisted` precedence without document equality, hashing or I/O.
3. Add RED tests for zero/one/two events, document-before-dirty order, Core
   command identity, affected addresses, batch unit and every zero-event path.
4. Compute post-transition dirty and event count before mutation, reserve the
   full safe event interval, then commit state and sequence together.
5. Reuse selected history entry command/affected data for undo/redo events.
6. Add exact event overflow and projection-state corruption hooks; prove store,
   history, dirty, caches/checkpoint and subscribers remain unchanged.
7. Keep returned native events detached and data-only; no callback registry is
   added to Rust.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime dirty --locked
cargo +1.97.1 test -p brilliant-kernel-runtime event --locked
cargo +1.97.1 test -p brilliant-kernel-session event --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime -p brilliant-kernel-session --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-4): track persisted identity and native events`

Revert C3 before C2.

## 5. Cached full read and index-backed selectors — C4

### Actions

1. Add RED tests for one materialization per revision, known-revision cache hit,
   cache-missing full response, old snapshot stability, mutation invalidation,
   no-op/checkpoint cache preservation and response-limit failure isolation.
2. Add Runtime's current-revision immutable snapshot cache; assemble snapshot,
   history and dirty under one session acquisition.
3. Update legacy read to report real history/dirty while always returning a
   complete document; add the cache-aware Stage-4 read result form.
4. Add direct metadata/entity/ownership/range/history/dirty routes against live
   records, topology, ownership and time indices.
5. Route document-entity selection through explicit snapshot materialization;
   prove every other selector reports zero full snapshot materializations and
   bounded visited-record counters.
6. Add all accepted address/range failure cases, seven entity kinds, detached
   aliases, unknown extension preservation and repeated projection equality.
7. Ensure failed materialization/encoding never installs a partial cache or
   mutates the session.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime snapshot --locked
cargo +1.97.1 test -p brilliant-kernel-runtime selector --locked
cargo +1.97.1 test -p brilliant-kernel-session read --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime -p brilliant-kernel-session --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-4): add cached reads and indexed selectors`

Revert C4; history/dirty/events remain private Rust behavior.

## 6. Latest-only operational checkpoint — C5

### Actions

1. Add RED threshold tests for entry counts 511/512 and logical bytes
   33,554,431/33,554,432, including checked addition overflow.
2. Count only newly appended effective submit entries/ChangeSet bytes;
   demonstrate undo/redo and tail truncation do not falsify scheduling.
3. Mark due during commit, but export/materialize only after the interactive
   critical section at the already accepted revision.
4. Retain exactly one completed checkpoint containing detached document,
   revision, cursor and content identity; replace/reset only after full success.
5. Inject allocation/materialization failures and prove commit/event success,
   old-checkpoint retention, due/counter retention, no public event, stable
   private maintenance status and later retry.
6. Separate interactive and maintenance metrics so threshold work is visible
   and non-threshold local operations retain four zero global counters.
7. Prove `markPersisted` never reads or mutates the operational checkpoint.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-runtime checkpoint --locked
cargo +1.97.1 test -p brilliant-kernel-session checkpoint --locked
cargo +1.97.1 clippy -p brilliant-kernel-runtime -p brilliant-kernel-session --all-targets --locked -- -D warnings
```

### Commit / rollback

`feat(rkp-4): add bounded operational checkpoints`

Revert C5; C1-C4 remain.

## 7. Real Node operation seam and JS subscriptions — C6

### Actions

1. Add the exact `operateKernelStage4V1` export over the existing opaque-handle
   lookup, owner-thread, busy/reentrant, mutex, panic and poison boundary.
2. Route six exact operation variants and preserve 64 MiB request/response
   limits and all predecessor bridge failures.
3. Make `submitKernelStage3V1` delegate to unified history-aware submit and
   update only necessary successor assertions; make legacy read return real
   history/dirty data.
4. Extend the private TypeScript adapter with Stage-4 capture/decode/deep-freeze
   and known-revision JS snapshot reuse. Do not add a public Core export or
   runtime selector.
5. Implement adapter-local ordered subscriptions, per-event subscriber
   snapshots, independent duplicates and idempotent unsubscribe.
6. Isolate sync throws, async rejection and custom rejecting thenables with no
   `unhandledRejection`; continue later handlers.
7. Permit callback reads/selectors and reject all four callback writes locally
   with `event.reentrant-write` before native invocation.
8. Build and load the real add-on; test exact five exports, malformed values,
   raw duplicate JSON, caps, wrong/stale/cross-thread/busy/poisoned handles,
   detachment/freeze and mixed predecessor/successor calls.

### Native build and focused gate

```powershell
cargo +1.97.1 build --manifest-path Cargo.toml --package brilliant-kernel-node --target x86_64-pc-windows-msvc --locked
$rkp4NativeSource = 'target\x86_64-pc-windows-msvc\debug\brilliant_kernel_node.dll'
$rkp4NodeTarget = 'target\rkp-1-node\brilliant_kernel_node.node'
if (-not (Test-Path -LiteralPath $rkp4NativeSource -PathType Leaf)) { throw 'missing RKP-4 native DLL' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $rkp4NodeTarget) | Out-Null
Copy-Item -LiteralPath $rkp4NativeSource -Destination $rkp4NodeTarget
if (-not (Test-Path -LiteralPath $rkp4NodeTarget -PathType Leaf)) { throw 'missing RKP-4 .node copy' }
npm.cmd run typecheck
npm.cmd run build
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.js dist/test/core-kernel/rust-migration/rkp-3-native-transaction.test.js dist/test/core-kernel/rust-migration/rkp-4-history-events.test.js dist/test/core-kernel/rust-migration/rkp-4-read-selectors.test.js
```

If `node_modules` is absent, use the existing offline lockfile install path. A
network install requires a separate scoped permission and must leave manifests
and lockfiles unchanged.

### Commit / rollback

`feat(rkp-4): expose private history session evidence seam`

Revert C6 to restore the three-export Node surface; native Stage-4 logic remains
unreachable from product TypeScript.

## 8. Native semantic replay and oracle rows 57-61 — C7

### Actions

1. Add `replayKernelStage4V1` as the fifth and final private Node export; it
   accepts no handle and constructs one fresh session per call.
2. Strictly capture the initial document and dense command array before session
   execution; preserve depth/property/byte caps and getter/Proxy safety.
3. Route every command through the same semantic submit pipeline, record each
   stage-owned result, stop after the first rejection, and export the final
   canonical document once.
4. Prove replay accepts no ChangeSet/history/event/snapshot/function input,
   never invokes undo/redo, never reaches live sessions/subscribers, and is
   repeatable across fresh calls.
5. Mechanically select immutable RKP-0 rows 57-61 and compare exact RKP-4-owned
   history, dirty, event, batch, undo/redo and replay projections.
6. Explicitly exclude support/classification, integrated rows 62/64, migration
   row 63 and final qualification from the result/claim.
7. Prove the existing oracle files and qualification contract are byte-stable.

### Focused gate

```powershell
cargo +1.97.1 test -p brilliant-kernel-session replay --locked
cargo +1.97.1 test -p brilliant-kernel-node replay --locked
npm.cmd run typecheck
npm.cmd run build
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-4-replay-oracle.test.js
```

### Commit / rollback

`feat(rkp-4): add isolated semantic replay parity`

Revert C7; interactive Stage-4 evidence remains.

## 9. Candidate evidence and bounded review — C8

### Actions

1. Complete sequence/cap/failure/property tests at the exact boundary values.
2. Run the full gate below at one exact candidate HEAD and record counts,
   commands, hashes, timings, cache/checkpoint/event/history counters, changed
   paths and native artifact hash in task evidence.
3. Verify exact allowlist subset, predecessor oracle/manifest/qualification
   hashes, Cargo/npm dependency zero delta, no generated artifacts, TypeScript
   default, and every later authorization false.
4. Update only the concise accepted Stage-4 transition section through the
   project spec workflow; do not rewrite TypeScript contracts.
5. Set `implementation_candidate_ready=true` only after every gate passes.
6. Conduct one bounded implementation review over base..candidate: history
   ownership/atomicity, no full-document hot-path work, cache correctness,
   selector index usage, event reservation/dispatch isolation, checkpoint
   failure semantics, replay semantic routing, FFI safety and lifecycle scope.
7. Any P0/P1/P2 finding gets the smallest repair and targeted rereview. A
   `0/0/0` result permits only an owner acceptance/archive decision.

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
node --expose-gc --test dist/test/core-kernel/rust-migration/rkp-4-workspace-contracts.test.js dist/test/core-kernel/rust-migration/rkp-4-history-events.test.js dist/test/core-kernel/rust-migration/rkp-4-read-selectors.test.js dist/test/core-kernel/rust-migration/rkp-4-replay-oracle.test.js
npm.cmd test

python .\.trellis\scripts\task.py validate 09-04-rkp-4-history-snapshots-events-replay
python .\.trellis\scripts\task.py validate 08-15-core-rust-runtime-performance-remediation
git diff --check
git status --short --branch
```

Also require:

- exact seven-crate list and manifest/lock dependency hashes equal base;
- exactly five Node exports and unchanged existing bridge failure inventory;
- public TypeScript inventories remain 28/51/8/34/9 and schema remains
  `brilliant-score-1`;
- immutable oracle/manifest/qualification bytes equal base;
- no history entry contains a document and no submit/undo/redo result contains
  a full document;
- non-threshold local submit/undo/redo first four global counters are zero;
- direct non-document selectors and same-revision read have zero snapshot
  materializations;
- no DLL/`.node`, `target`, `dist`, `node_modules`, log or temporary artifact is
  tracked;
- default runtime is TypeScript and acceptance/archive/RKP-5/qualification/
  cutover/push flags remain false.

### Commit / rollback

`test(rkp-4): qualify history snapshot event replay projections`

Revert C8 to remove evidence/spec/candidate status; C0-C7 remain an unaccepted
private implementation. Full rollback continues C7 to C0 in reverse.

## 10. Closeout boundary

After a separate owner acceptance instruction, use native Trellis archive flow,
record the exact audited technical commit and archive path, clear the parent's
current child, and retain TypeScript as default. Only then may RKP-5 planning be
proposed.

No remote push, default cutover, final qualification, TypeScript cleanup, or
product feature belongs to this task.
