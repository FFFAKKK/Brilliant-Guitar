# File, test, ownership and re-entry map

## Prerequisite implementation ownership

### Technical files

| File | Permitted change | Forbidden change |
|---|---|---|
| `.gitattributes` | seven exact `text eol=lf` rules | wildcard or unrelated path policy |
| `crates/brilliant-kernel-runtime/src/runtime.rs` | LF-normalize the one existing source-shape inspection in `#[cfg(test)]` | runtime struct or method behavior |
| `crates/brilliant-kernel-runtime/src/store.rs` | LF-normalize the one existing source-shape inspection in `#[cfg(test)]` | store/model/index behavior |
| `crates/brilliant-kernel-runtime/src/indices.rs` | LF-normalize three existing source-shape inspections and add small LF/CRLF parity coverage | index construction/query/metrics behavior |

### Coordination/evidence files

- this task directory;
- RKP-2 parent task/handoff/review projection only when lifecycle stage changes;
- Rust remediation parent `task.json`;
- `rust-runtime-transition.md` only for a durable path-specific raw-byte/EOL rule after the implementation proves it.

## Protected paths

The implementation must show zero semantic diff for:

- `src/**`;
- every Rust product line outside the three existing test modules;
- all Cargo manifests, `Cargo.lock`, `rust-toolchain.toml` and crate dependencies/features;
- package manifests/lock and tsconfig;
- `cvn-7-qualification-score.ts` content;
- S6.2 worker, worker-test and process-wrapper content;
- public types, exports, schemas, commands and extension contracts;
- the diagnostic S6.2 worktree and branch.

## Test ownership

### Pre-fix RED

Exactly four non-ignored failures are expected:

1. `runtime_owns_only_the_live_store_and_revision_zero`;
2. `every_typed_record_resolves_once_without_retaining_the_document_tree`;
3. `indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open`;
4. `indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity`.

An additional failure invalidates the assumed root cause.

### Post-fix GREEN

- all four pass;
- the small LF/CRLF parity coverage passes;
- the existing ignored scale test remains ignored and unexecuted;
- full Rust workspace tests pass;
- no Node baseline tuple or manifest change.

## Re-entry ownership

This prerequisite ends after its own implementation audit and lifecycle closeout. The successor S6.2 planning task alone owns:

- replaying the E1 sentinel logic;
- new planning/implementation workload hashes;
- strict source-before-evidence enforcement;
- evidence absence at the source commit;
- exact source-to-evidence diff;
- archived request/result/sentinel non-reuse;
- E2 native addon build/copy and Node checks;
- exactly one E3 large request.

## Re-entry gates

S6.2 may be replanned only when:

1. the prerequisite implementation receives an independent `0/0/0` review;
2. acceptance and archive are explicitly authorized and recorded;
3. the prerequisite is integrated into `codex/rkp-2-indexed-live-score-store-implementation`;
4. that integration receives an independent verification;
5. the RKP-2 authority branch is clean and names no concurrent implementation child;
6. the new S6.2 branch starts from the exact integration head;
7. the old S6.2 attempt remains preserved as diagnostic evidence only.

Directly resuming E2 from `c3c4d198...` is forbidden.
