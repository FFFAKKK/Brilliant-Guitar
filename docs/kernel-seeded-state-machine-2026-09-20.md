# Rust microkernel seeded state machine

Date: 2026-09-20

## Scope

This slice adds deterministic property-style coverage for the Rust microkernel
transaction and history paths. It changes no production contract and does not
touch Agent, Workbench, plugin-platform, Score Port, Projection architecture or
desktop application-service code.

Four fixed xorshift seeds execute 512 actions each. The 2,048-action corpus
mixes:

- typed `KernelEffectV1` pitch and document-metadata mutations;
- exact typed no-ops against the current value;
- Candidate Batch insert/remove net-zero histories;
- Candidate Batches with pitch before or after representation promotion;
- a Batch that performs an effective prefix and then rejects on a missing
  target;
- undo and redo at both available and empty history boundaries.

No random dependency or nondeterministic entropy source is introduced. Any
failure reports its exact seed and step.

## Independent model

The test maintains a separate model containing canonical document snapshots,
the currently reachable history branch and its cursor. The model applies only
the public meaning of each generated action:

- pitch and title Effects update one field;
- insert/remove net-zero Batch leaves document data equal but adds one history
  entry;
- rejected Batch and typed no-op change no runtime state;
- undo and redo move only the model cursor;
- a commit after undo truncates the model's redo branch.

After every action, the runtime must equal the model as both the typed document
and canonical score bytes. History depth, dirty state, version-identity length
and internal history entry/cursor counts are checked independently.

## Atomicity and affected invariants

The state fingerprint for rejection and no-op includes:

- document and document version;
- history projection;
- committed metrics;
- checkpoint schedule and retained identity;
- session event/identity projection state.

The failing Batch must preserve the full fingerprint even though its prefix has
already changed pitch and inserted a Part inside the candidate.

For committed typed Effects, `affected` must be exactly the edited Note or
Document. Every commit must contain unique `(kind, id)` addresses, and the
`DocumentCommitted` event must reproduce the result's affected list exactly.
Undo and redo must reproduce the exact list stored on their selected journal
entry.

## Replay proof

At the end of each seed, only the final reachable branch is retained. A fresh
runtime executes every command on that branch and compares every resulting
snapshot with the independent model. It then undoes the complete branch to the
initial document and redoes it to the final document, comparing canonical bytes
at every cursor position. Live indices are periodically and finally compared
with a clean rebuild.

## Verification

Focused state machine:

```text
cargo test -p brilliant-kernel-runtime \
  seeded_effect_batch_history_state_machine_matches_independent_model \
  --locked --offline -- --nocapture

1 passed; 0 failed; finished in 3.77s
```

Strict runtime lint:

```text
cargo clippy -p brilliant-kernel-runtime --all-targets --all-features \
  --locked --offline -- -D warnings

passed
```

Full workspace verification:

```text
cargo test --workspace --all-features --locked --offline

661 passed; 0 failed; 2 ignored

cargo clippy --workspace --all-targets --all-features \
  --locked --offline -- -D warnings

passed
```

The modified Rust files pass an independent `rustfmt --check`. The repository
wide `cargo fmt --all -- --check` remains blocked only by the pre-existing,
unmodified import wrapping at `crates/brilliant-kernel-session/src/session.rs:389`.

The fixed corpus is intended for stable continuous regression. It does not
replace expanded seed fuzzing, allocation/IO failure injection, process-crash
recovery or release-build percentile and peak-memory qualification.
