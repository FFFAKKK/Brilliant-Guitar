# File, Test and Rollback Matrix

## Production ownership

| Area | Planned files | Evidence | Rollback |
|---|---|---|---|
| exact DTO/codec | Contracts `codec.rs`, `command.rs`, `session.rs`, `lib.rs` | exact-shape/cap/failure tests | revert C1 |
| history/stored effects | Runtime `history.rs`, `runtime.rs`, `transaction.rs`, `lib.rs`; Session `session.rs` | Rust state/property tests plus real Node trace | revert C2 |
| dirty/events | Runtime `session_projection.rs`, `runtime.rs`; Session `session.rs` | identity/event matrix and overflow injection | revert C3 |
| snapshot/selectors | Runtime `selectors.rs`, `session_projection.rs`; Session `session.rs` | cache/materialization/index counters and TS parity | revert C4 |
| operational checkpoint | Runtime `checkpoint.rs`, `runtime.rs`; Session `session.rs` | 511/512, byte threshold, failure/retry | revert C5 |
| Node/adapter/subscribers | Node `boundary.rs`, `lib.rs`; private `rust-kernel-smoke.ts` | real addon, hostile boundary, callback matrix | revert C6 |
| replay/oracle | Contracts/Session/Node plus RKP-4 tests | fresh replay and immutable rows 57-61 | revert C7 |
| spec/evidence | transition spec and RKP-4/parent task files | validation/hash/allowlist/full gate | revert C8 |

## Test files

| Test | Primary responsibility |
|---|---|
| `rkp-4-history-events.test.ts` | submit/undo/redo/tail/dirty/event/subscriber behavior through real addon |
| `rkp-4-read-selectors.test.ts` | cache handshake, frozen old snapshots, six selector families, index/materialization counters |
| `rkp-4-replay-oracle.test.ts` | fresh semantic replay, first rejection and immutable oracle rows 57-61 |
| `rkp-4-workspace-contracts.test.ts` | base/allowlist, five exports, dependencies, protected inventories/hashes, lifecycle flags |
| predecessor RKP-1/2/3 tests | unchanged bridge/store/transaction behavior with only necessary successor assertions |
| Rust unit/property tests | internal invariants, allocation/precondition/counter/checkpoint/panic hooks unavailable at public boundary |

## Mandatory RED-before-GREEN cases

- history tail is incorrectly truncated by a no-op/reject;
- history sequence is reused after branching;
- undo partially applies before a failing precondition;
- delayed save marks the wrong current revision clean;
- deep-equal branch is incorrectly clean;
- same-revision read materializes/serializes a full snapshot unnecessarily;
- non-document selector exports the whole document;
- event overflow advances document/history;
- subscriber rejection becomes unhandled or stops later handlers;
- threshold checkpoint failure rejects/rolls back an accepted command;
- replay applies a stored ChangeSet or reaches a live subscriber;
- legacy Stage-3 submit bypasses history.

## Protected paths and values

Mechanically compare to planning base:

- all non-allowlisted `src/**` and `test/**` paths;
- Cargo/npm manifests and lockfiles;
- immutable oracle manifest/scenarios and Qualification V2 contract bytes;
- `src/core-kernel/index.ts` and accepted 28/51/8/34/9 inventories;
- schema `brilliant-score-1` and TypeScript default runtime selection;
- RKP-5+, product/UI/persistence/plugin paths;
- generated `target`, `dist`, DLL/`.node`, logs and temporary files.

## Rollback order

```text
C8 evidence/spec
<- C7 replay/oracle
<- C6 Node/adapter/subscribers
<- C5 operational checkpoint
<- C4 snapshot/selectors
<- C3 dirty/events
<- C2 history/undo/redo
<- C1 contracts/state
<- C0 activation bookkeeping
```

At every intermediate rollback point, product behavior remains on TypeScript.
Complete rollback returns to accepted RKP-3 without a schema, dependency,
public-surface or default-runtime change.
