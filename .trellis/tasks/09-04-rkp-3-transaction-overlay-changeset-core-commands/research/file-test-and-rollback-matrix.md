# RKP-3 File, Test and Rollback Matrix

## 1. Planning ownership

The planning candidate may change only these paths:

| Path | Responsibility |
|---|---|
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/task.json` | task metadata, parent, branch, lifecycle flags |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/prd.md` | requirements and acceptance contract |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/design.md` | implementation-level architecture |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/implement.md` | staged execution and verification plan |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/implement.jsonl` | later implementation context; generated/curated only by Trellis flow |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/check.jsonl` | later check context; generated/curated only by Trellis flow |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/authority-and-runtime-gap.md` | live source/authority audit |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/changeset-overlay-and-capacity-decision.md` | core transaction decision record |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/file-test-and-rollback-matrix.md` | this literal ownership matrix |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/planning-self-audit.md` | planning validation results and open findings |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json` | unique RKP-3 child/current-planning projection |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md` | dated Stage-3 planning projection |

Every production source, test, package/config file, frozen oracle fixture, and
active spec is zero-delta during planning.

## 2. Future implementation allowlist

The implementation review starts from an exact approved planning commit. The
following is the maximum literal technical allowlist; an implementation commit
may use a subset but may not add an unlisted path without reopening planning.

### 2.1 Core Types and command contracts

| Path | Stage | Responsibility |
|---|---:|---|
| `crates/brilliant-core-types/src/scalar.rs` | 1 | checked `DocumentVersionV1` increment bounded by JS safe integer |
| `crates/brilliant-kernel-contracts/src/lib.rs` | 1 | private Stage-3 contract exports only |
| `crates/brilliant-kernel-contracts/src/command.rs` | 1 | exact 28 envelope/target/anchor/range/failure/result DTOs |
| `crates/brilliant-kernel-contracts/src/codec.rs` | 1 | strict command request decode and capped Stage-3 response encode |

### 2.2 Runtime transaction engine

| Path | Stage | Responsibility |
|---|---:|---|
| `crates/brilliant-kernel-runtime/src/lib.rs` | 2-4 | private module/export wiring |
| `crates/brilliant-kernel-runtime/src/change_set.rs` | 2 | stable addresses, typed ops, inverse/order/segment/logical-byte rules |
| `crates/brilliant-kernel-runtime/src/overlay.rs` | 2-4 | touched-state overlay and restricted read/builder APIs |
| `crates/brilliant-kernel-runtime/src/transaction.rs` | 3-4 | preflight, capacity plan, CommitPlan, adoption, metrics |
| `crates/brilliant-kernel-runtime/src/runtime.rs` | 3-8 | submit coordinator, checked version, stage result, read current version |
| `crates/brilliant-kernel-runtime/src/store.rs` | 3-7 | narrow record/bundle detach, reserve, adopt, local invariant seams |
| `crates/brilliant-kernel-runtime/src/records.rs` | 2-3 | typed record value/bundle conversion helpers |
| `crates/brilliant-kernel-runtime/src/topology.rs` | 2-7 | touched order lookup/replacement/adoption helpers |
| `crates/brilliant-kernel-runtime/src/indices.rs` | 3-7 | planned entity/owner/reference/extension index deltas and counters |
| `crates/brilliant-kernel-runtime/src/time_index.rs` | 3-7 | affected Voice time-index rebuild/delta helpers |

### 2.3 Session command ownership

| Path | Stage | Responsibility |
|---|---:|---|
| `crates/brilliant-kernel-session/src/lib.rs` | 4-7 | module wiring only |
| `crates/brilliant-kernel-session/src/session.rs` | 4-8 | fixed route, transaction lifetime, result mapping |
| `crates/brilliant-kernel-session/src/commands/mod.rs` | 4-7 | closed handler dispatcher and shared helpers |
| `crates/brilliant-kernel-session/src/commands/catalog.rs` | 4 | exact ordered 28-ID/target table |
| `crates/brilliant-kernel-session/src/commands/local.rs` | 4 | first six scalar/event handlers |
| `crates/brilliant-kernel-session/src/commands/measure.rs` | 5 | four Measure handlers and content normalization |
| `crates/brilliant-kernel-session/src/commands/hierarchy.rs` | 6 | Part/Staff/Voice/reference handlers |
| `crates/brilliant-kernel-session/src/commands/range.rs` | 7 | indexed range selection, transpose, batch coordination |

### 2.4 Private Node evidence seam

| Path | Stage | Responsibility |
|---|---:|---|
| `crates/brilliant-kernel-node/src/lib.rs` | 8 | add exact `submitKernelStage3V1` value-only export |
| `crates/brilliant-kernel-node/src/boundary.rs` | 8 | handle validation, bounded request/response, panic containment |
| `src/core-kernel/native/rust-kernel-smoke.ts` | 8 | strict/frozen private submit adapter and nonzero read versions |

### 2.5 Successor tests and evidence

| Path | Stage | Responsibility |
|---|---:|---|
| `test/core-kernel/rust-migration/rkp-1-node-bridge-smoke.test.ts` | 8 | preserve create/read subset without asserting obsolete total export count |
| `test/core-kernel/rust-migration/rkp-2-live-score-store-parity.test.ts` | 8 | preserve RKP-2 create/read semantics under successor export |
| `test/core-kernel/rust-migration/rkp-2-workspace-contracts.test.ts` | 8 | project exact successor export law without weakening archived RKP-2 source/hash laws |
| `test/core-kernel/rust-migration/rkp-3-transaction-fixtures.ts` | 1-9 | deterministic valid/no-op/failure/cap/scale inputs and oracle selectors |
| `test/core-kernel/rust-migration/rkp-3-workspace-contracts.test.ts` | 1-9 | exact crate/path/dependency/export/catalog/default-runtime/protected laws |
| `test/core-kernel/rust-migration/rkp-3-native-transaction.test.ts` | 4-9 | real add-on command, inverse class, batch, cap, panic/handle, counter tests |
| `test/core-kernel/rust-migration/rkp-3-oracle-projection.test.ts` | 8-9 | immutable 28 accepted + 28 rejected + two batch projections |
| `.trellis/spec/core-kernel/backend/rust-runtime-transition.md` | 9 | concise accepted RKP-3 contract only after implementation checks pass |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/research/implementation-evidence.md` | 9 | exact commands/results/counters/candidate facts |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/review-candidate.md` | 9 | independent review target and literal diff |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/operator-handoff.md` | 0,9 | activation/stop/rollback/closeout contract |
| `.trellis/tasks/09-04-rkp-3-transaction-overlay-changeset-core-commands/task.json` | 0,9 | lifecycle status only |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json` | 0,9 | one active child and accepted/archived projection |
| `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md` | 0,9 | dated Stage-3 implementation projection |

`Cargo.toml`, `Cargo.lock`, every crate `Cargo.toml`, package manifests, and
toolchain files are explicitly zero-delta. All required dependencies already
exist in the seven-crate workspace.

The three predecessor tests may change only where an exact-two-export assertion
would reject the reviewed RKP-3 successor. They may not weaken handle, create,
read, cap, codec, RKP-2 path/hash, or canonical-store assertions.

## 3. Explicitly protected paths

- frozen oracle/manifest/qualification JSON under
  `test/core-kernel/rust-migration/fixtures/`;
- all TypeScript Core command/domain/runtime behavior outside the single
  private native adapter;
- application/runtime public barrel exports and package entry points;
- `Cargo.toml`, `Cargo.lock`, all crate manifests, `rust-toolchain.toml`, and
  `rustfmt.toml`;
- `crates/brilliant-score-foundation/**` and
  `crates/brilliant-extension-protocol/**`;
- RKP-0/RKP-1/RKP-2 archived task artifacts;
- CVN-7 qualification code/evidence and every non-RKP-3 test;
- Workbench/UI, persistence, playback, renderer, import/export, Guitar/Piano/
  Bass modules, Product Host, and plugin SDK;
- default runtime selection, qualification flags, cutover state, and remote
  branches.

## 4. Test matrix

| Layer | Required tests | Decisive assertion |
|---|---|---|
| Core Types | initial, next, max-safe, overflow | no representable version beyond JS safe integer |
| Strict codec | all 28, extra/missing/duplicate fields, tags, versions, numbers, depth/properties/bytes | deterministic stable failure; no session mutation |
| Catalog | literal order, unique IDs, target kinds, nested batch exclusion | exact 28 and no dynamic route |
| ChangeSet classes | scalar, insert/remove, order insert/remove/move/replace, extension insert/replace/remove, reference update | forward/inverse preconditions and reverse-safe round trips |
| Overlay | staged lookup, tombstone, insert then edit/remove, repeated write, touched-order copy | later operations see staged state; base unchanged before adopt |
| Atomicity | each Phase-A failure, forced reserve failure, local invariant fault | canonical document/version/index/committed metrics unchanged |
| Commit | insert/delete/move/scalar/reference bundles | store, topology, handles, all indices and time data move together |
| No-op | every scalar/move and all-no-op batch | no op/adoption/version delta |
| Batch | empty, nested, 100, 101, mixed, later-child target, lowest child failure, caps | one overlay, one adoption, zero-delta reject |
| Range | three kinds, reversed endpoints, missing/owner mismatch, delete, zero/valid/invalid transpose | index/topology selection only and accepted order/failure |
| Oracle | exact 28/28 partition plus atomic/rejected batch | canonical document/version/failure projection equality |
| Complexity | local scalar/event/voice, Measure aggregate, range interval, batch | first four global counters zero; work bounded to declared closure |
| Node | real native build/load, three exports, opaque handle, wrong/stale/busy/poisoned, caps, panic | detached frozen DTO, no full document in submit response, no raw error |
| Regression | RKP-1/RKP-2 focused, Rust workspace, TS typecheck/build/full suite | no predecessor or product behavior regression |
| Governance | task validate, JSON/JSONL parse, literal diff, protected zero delta, dependency lock | exact candidate reproducible from approved base |

## 5. Stage commit and rollback chain

```text
C0  chore(rkp-3): activate reviewed transaction stage
C1  feat(rkp-3): add strict command contracts and checked revisions
C2  feat(rkp-3): add typed changesets and transaction overlay
C3  feat(rkp-3): adopt prepared store and index deltas atomically
C4  feat(rkp-3): port local scalar and event commands
C5  feat(rkp-3): port measure aggregate commands
C6  feat(rkp-3): port part staff and voice commands
C7  feat(rkp-3): port indexed range and atomic batch commands
C8  feat(rkp-3): expose private native submit evidence seam
C9  test(rkp-3): qualify stage-owned transaction projections
```

Rollback is `C9 -> C0` in reverse. Each commit owns only the paths/rows assigned
above and must pass its focused gate before the next commit. No partial commit
is accepted, archived, made default, or used to authorize RKP-4.

If the work stops before acceptance, the accepted RKP-2 base remains intact
and TypeScript stays default. If an unexpected adoption panic occurs at
runtime, that session is poisoned and discarded; rollback-by-commit remains
the repository recovery path.

## 6. Lifecycle gates

1. Planning artifacts and Trellis validation.
2. Explicit owner approval to run `task.py start` and implement C0-C9.
3. Fresh implementation checks and candidate freeze.
4. Separate read-only implementation review with P0/P1/P2 counts.
5. Bounded repair/review loop if findings exist.
6. Separate owner acceptance/archive decision.
7. Only after accepted RKP-3 archive may RKP-4 planning be created.

No gate above authorizes qualification, default cutover, RKP-4 implementation,
or push.
