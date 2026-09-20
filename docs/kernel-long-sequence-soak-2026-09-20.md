# Rust microkernel long-sequence soak

Date: 2026-09-20

## Scope

This slice adds deterministic long-sequence coverage to the Rust microkernel.
It does not change Projection, Agent, Workbench, plugin-platform, Score Port or
desktop application-service code.

The exercised sequence combines:

- Core metadata submits;
- undo, redo and replacement branches;
- automatic operational checkpoints;
- persisted-version markers;
- cached Stage 4 snapshot reads;
- periodic clean index rebuild comparisons.

The default regression crosses two checkpoint intervals. A separate ignored
test runs 10,000 primary submits and is invoked explicitly for soak evidence so
ordinary workspace tests do not inherit its runtime.

## Pinned invariants

The tests inspect private state only under `cfg(test)` and pin these properties:

1. Every published document version has exactly one content-identity entry.
2. A mutation releases the prior cached snapshot document.
3. A successful operational checkpoint replaces the previously retained
   checkpoint document; only the latest document remains strongly referenced by
   checkpoint state.
4. Undo/redo preserve index equality with a clean rebuild.
5. A new submit after undo truncates the redo branch and leaves no redo depth.
6. History storage capacity does not continue increasing merely because a
   lower-cursor branch replaces discarded redo entries.
7. Persisted markers do not interfere with operational checkpoint ownership.

## Retention boundary

This evidence deliberately does not claim that complete session memory is
constant. Two structures are linear by current public semantics:

- the undo journal retains one entry per reachable history step;
- the version-to-content-identity table retains one `u64` per published
  document version so a delayed persistence acknowledgement can name an older
  version correctly.

The soak instead proves that caches, replaced operational checkpoints, discarded
redo branches and derived indices do not add an independent unbounded owner.
Changing the two intentional linear structures requires a separate history or
persistence contract decision, not an incidental resource optimization.

## Verification

Focused default regression:

```text
cargo test -p brilliant-kernel-runtime \
  repeated_history_branches_bound_caches_and_preserve_indices \
  --locked --offline -- --nocapture

1 passed; 0 failed
```

Explicit release soak:

```text
cargo test -p brilliant-kernel-runtime \
  ten_thousand_submit_history_checkpoint_soak \
  --locked --offline -- --ignored --nocapture

1 passed; 0 failed; finished in 4.59s
```

Workspace verification:

```text
cargo test --workspace --all-features --locked --offline

660 passed; 0 failed; 2 ignored

cargo clippy --workspace --all-targets --all-features \
  --locked --offline -- -D warnings

passed
```

The elapsed value is from an unoptimized debug test run on the development
machine. It is not a p50/p95/p99 or peak-memory qualification result.
