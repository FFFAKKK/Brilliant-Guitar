# Rust microkernel publication failure recovery

Date: 2026-09-20

## Scope

This slice adds deterministic fault injection at the Rust microkernel
publication boundary. It changes no production contract and does not touch
Agent, Workbench, plugin-platform, Score Port, Projection architecture or
desktop application-service code.

The new hooks exist only under `cfg(test)`. They force the Store commit plan to
fail its reservation after command preparation, history/checkpoint/event
preflight and result/event allocation have completed, but before Store adoption
or any session-state publication.

## Failure matrix

The focused matrix covers:

| Path | Injected failure | Recovery proof |
| --- | --- | --- |
| typed submit | Store commit reservation | repeat the same metadata mutation |
| Candidate Batch submit | final-state plan reservation | repeat the same promoted Batch |
| typed undo and redo | stored-operation reservation | retry each history direction |
| Candidate undo and redo | final-state replay reservation | retry each history direction |
| submit preflight | event interval overflow | restore the valid sequence and retry |
| branched submit preflight | history sequence overflow | restore the valid sequence and retry |
| submit preflight | checkpoint counter overflow | restore the schedule and retry |
| checkpoint maintenance | materialization failure | committed mutation remains due and the next read retries |

The last row retains the existing operational-checkpoint contract: checkpoint
materialization is post-commit maintenance, so its failure must not roll back a
successful mutation. All other rows fail before publication and therefore must
be semantic zero-delta.

## Zero-delta fingerprint

Every new pre-publication failure compares one fingerprint before and after the
attempt. It includes:

- exported document and document version;
- projected undo/redo depths, retained entry count, cursor and next history
  sequence;
- dirty identity result;
- committed Stage 3 metrics;
- checkpoint counters, due state and retained checkpoint identity;
- version-identity length, cached snapshot version and next event sequence.

A weak reference additionally proves that the existing cached snapshot remains
owned across the failed attempt. After the successful retry, the old snapshot
is released and live indices equal a clean rebuild.

Container capacity is intentionally not transaction state. A successful
preflight `try_reserve` may retain allocator capacity even when a later
reservation fails; it may not publish an entry, advance a cursor or sequence,
truncate redo, change identity, mutate the document or accumulate committed
metrics.

## Publication ordering

The exercised ordering is:

1. checkpoint counter preflight;
2. history sequence and entry-capacity preflight;
3. event interval and version-identity-capacity preflight;
4. affected/event result allocation;
5. Store or final-state plan reserve;
6. Store adoption and version/metrics update;
7. history, session projection and checkpoint-schedule publication;
8. best-effort checkpoint materialization.

The injected reserve failure at step 5 proves that steps 6 and 7 are not
partially executed. Checkpoint materialization at step 8 is deliberately a
different failure class and remains retryable maintenance.

## Verification

Focused fault matrix:

```text
cargo test -p brilliant-kernel-runtime \
  runtime::tests::failure_recovery \
  --all-features --locked --offline -- --nocapture

6 passed; 0 failed
```

Runtime all-features:

```text
cargo test -p brilliant-kernel-runtime --all-features --locked --offline

398 passed; 0 failed; 2 ignored
```

Workspace all-features and strict lint:

```text
cargo test --workspace --all-features --locked --offline

667 passed; 0 failed; 2 ignored

cargo clippy --workspace --all-targets --all-features \
  --locked --offline -- -D warnings

passed
```

The modified Rust files pass an independent `rustfmt --check` and
`git diff --check`. Repository-wide `cargo fmt --all -- --check` remains blocked
only by the pre-existing, unmodified import wrapping at
`crates/brilliant-kernel-session/src/session.rs:389`.

This is deterministic in-process allocation and counter fault coverage. It does
not simulate process termination, power loss, durable journal corruption,
allocator aborts or persistence-service failures. Those require a separate
crash-recovery and durable-storage qualification slice.
