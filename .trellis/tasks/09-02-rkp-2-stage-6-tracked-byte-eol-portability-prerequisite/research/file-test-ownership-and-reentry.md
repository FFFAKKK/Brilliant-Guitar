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

- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/task.json`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/implementation-evidence.md`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/review-candidate.md`;
- `.trellis/tasks/09-02-rkp-2-stage-6-tracked-byte-eol-portability-prerequisite/operator-handoff.md`;
- `.trellis/tasks/08-24-rkp-2-indexed-live-score-store-load-encode-parity/task.json`;
- `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json`.

The implementation candidate has exactly these six literal coordination paths and no optional directory-prefix authority. RKP-2 parent handoff/review files and `rust-runtime-transition.md` remain unchanged until a later accepted-closeout projection. The task meta, PRD, design and implementation plan must expose this identical set and count.

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
- no Node exit/count/title/manifest change;
- a fresh control lane reproduces I0, a rebuilt expected lane reproduces its pre-I1 record, the inherited Part Owner signature remains unchanged, and the other three signatures change only to their predeclared expected-transition values.

## Mechanical product-boundary proof

For `runtime.rs`, `store.rs` and `indices.rs`, the implementation verifier must locate the matched closing brace of the unique terminal `#[cfg(test)]` module with the Rust lexical states fixed in `design.md`, require a whitespace-only suffix, and contain both sides of every hunk inside the five named existing inspection functions plus the one named parity function. Removing those six edits in memory must reconstruct the base Git blob byte-for-byte. A prefix-only or line-start-only result is invalid.

The same exact reconstruction is the secondary guard for statements hidden after the first failure in the four historical Node tests. The primary guard is the title-level Node event capture plus independent control/expected/candidate signature comparison; neither guard may substitute for the other.

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
