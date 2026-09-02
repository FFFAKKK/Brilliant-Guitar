# RKP-2 Stage 6 Tracked-byte and EOL Portability Prerequisite — PRD

## Decision

Create one independent prerequisite before resuming RKP-2 Stage 6 S6.2. The prerequisite makes tracked bytes reproducible across Windows Git checkout settings and makes five Rust source-shape assertions independent of CRLF/LF. It does not resume S6.2, run the large opt-in evidence workload, or change Rust product behavior.

The task remains `planning`. `task_start_run=false` and `production_implementation_authorized=false` until this planning candidate passes a dedicated independent review and the user separately authorizes implementation.

## Goal

Remove the deterministic E2 blocker found at S6.2 candidate `c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b` while preserving all accepted RKP-2 runtime, storage, index, codec, public API, fixture, workload and lifecycle semantics.

Success means a fresh checkout of the accepted prerequisite commit produces identical bytes and SHA-256 values for every frozen workload input under both `core.autocrlf=true` and `core.autocrlf=false`, and the Rust workspace test suite no longer depends on the host checkout line-ending convention.

## Confirmed evidence

- Authority base: `55cb575c606646e8449359b0c46d5c905b3bb3c6` (`docs(rkp-2): close Stage 6 L6 terminal projection`).
- Blocked S6.2 planning authority: `02ef4af24bc3708e8e31d052f9cd69e81b955797`.
- S6.2 activation: `5c709b80ff5a7a9836a46f665685d37a5694630c`.
- S6.2 E1 candidate: `c3c4d198a33ec3a78d3fc3e33cdae30657d9b62b`, tree `b6687e879a5814a68ee523bf02b9a40839e6c3f3`.
- Dedicated implementation/blocker audit task: `01a060d4-9bdb-7b71-b8be-868ff5685d9e`.
- Audit verdict: `RETURN`, P0/P1/P2=`0/2/1`.
- Under the exact `C:\Users\ATOM\.cargo\bin\cargo.exe` and E-drive output roots, `cargo +1.97.1 fmt --all -- --check` and `cargo +1.97.1 check --workspace --all-targets --locked` passed, while `cargo +1.97.1 test --workspace --all-targets --locked` failed exactly four source-shape tests.
- `core.autocrlf=true`; `runtime.rs`, `store.rs`, `indices.rs` and all five workload inputs were `i/lf w/crlf attr/` at the clean authority checkout because `.gitattributes` did not cover them.
- Five `#[cfg(test)]` source-shape checks use `include_str!` followed by LF-specific delimiters or substrings. Four non-ignored tests fail on CRLF; the fifth is inside the ignored scale test and must be corrected at the same owner boundary.
- In-memory CRLF-to-LF normalization makes all five source-shape checks use the same semantic text without changing production code.
- The S6.2 E1 worker logic is not the cause of the Cargo failure. It remains a reusable logical patch, but its exact commit and raw working-tree hashes are not an accepted evidence source.
- E3 execution count remains zero and `implementation-evidence.md` does not exist.

## Requirements

### EOL and tracked-byte ownership

- **EOL-R001**: `.gitattributes` is the sole repository checkout-policy owner for the seven affected paths listed in this PRD.
- **EOL-R002**: Each affected path must have an explicit `text eol=lf` rule. No wildcard rule may change unrelated repository paths.
- **EOL-R003**: For the five S6.2 workload inputs, `raw SHA-256` means SHA-256 over the checked-out file bytes after Git attributes are applied. Those bytes must equal binary-safe `git cat-file blob <HEAD>:<path>` stdout bytes.
- **EOL-R004**: A fresh checkout with `core.autocrlf=true` and another with `core.autocrlf=false` must yield identical byte length and SHA-256 for all seven affected paths.
- **EOL-R005**: `git ls-files --eol` must report `i/lf w/lf attr/text eol=lf` for all seven paths in both fresh checkouts.
- **EOL-R006**: Both fresh checkouts must remain clean; the verification procedure must not rely on manual line-ending rewrites, `git add --renormalize`, or post-checkout mutation.

### Rust test-only repair

- **EOL-R007**: Only the five existing `#[cfg(test)]` source-shape checks may normalize `include_str!` text before structural inspection.
- **EOL-R008**: Normalization must map CRLF to LF in memory and leave LF input semantically unchanged.
- **EOL-R009**: No production `LiveScoreStore`, `KernelRuntime`, index, lookup, export, metric, public type, crate feature or compiled non-test behavior may change.
- **EOL-R010**: The corrected assertions must still reject the same forbidden retained-document fields, scan-based lookups and runtime-handle leakage. The repair must not weaken, delete, ignore or replace the assertions with unconditional success.

### S6.2 succession boundary

- **EOL-R011**: This prerequisite must not modify the S6.2 E1 worker, worker test, process wrapper, fixture or Workspace Law semantics. The paths may receive only `.gitattributes` checkout policy.
- **EOL-R012**: The current S6.2 E1 candidate `c3c4d198...` remains unaccepted and must not be labeled `S6_2_EVIDENCE_SOURCE_HEAD`.
- **EOL-R013**: After this prerequisite is independently audited, accepted, archived and integrated into the RKP-2 authority branch, S6.2 must be replanned from that new base.
- **EOL-R014**: The successor S6.2 plan owns the separate audit P1 concerning evidence provenance: strict source-before-evidence ordering, exact source-to-evidence diff and mechanical rejection of archived request/sentinel reuse.
- **EOL-R015**: Successor S6.2 must replay the E1 logical patch on the new LF base and recompute the five planning and implementation hashes; it must not reuse the old `d519...`, `841e...`, `b96e...` values as accepted hashes.

### Lifecycle and scope

- **EOL-R016**: The prerequisite is the sole current planning owner for the EOL/raw-byte blocker. S6.2 remains an external unaccepted attempt and is not a concurrent implementation child.
- **EOL-R017**: TypeScript remains the default runtime. S6.2 completion, S6.3, qualification, runtime cutover, RKP-3, acceptance, archive, integration and push are not authorized by this planning task.
- **EOL-R018**: No build or temporary output may be written to C:. Cargo target, TEMP/TMP and fresh-checkout verification roots must be explicit E-drive paths.

### Proof completeness

- **EOL-R019**: Product-region zero delta must be proven with the exact Rust-aware terminal test-module boundary and six-function reconstruction contract in `design.md`; prefix equality or hunk-start checks alone are invalid.
- **EOL-R020**: The four inherited Node failures must be frozen individually by title, true `3 + 1` cause, and deterministic primary assertion signature; equal titles/counts without equal signatures are insufficient.
- **EOL-R021**: An assertion hidden after a known first failure may not be assumed green. Its relevant four-file inputs are controlled by exact candidate reconstruction and the exact seven-line `.gitattributes` diff, and the dedicated implementation auditor must verify both controls with the signatures.

## Exact affected paths

### Future technical implementation allowlist

1. `.gitattributes`
2. `crates/brilliant-kernel-runtime/src/runtime.rs`
3. `crates/brilliant-kernel-runtime/src/store.rs`
4. `crates/brilliant-kernel-runtime/src/indices.rs`

The three Rust files may change only inside their existing `#[cfg(test)]` modules. The `.gitattributes` diff may add only seven exact path rules.

### Seven paths governed by `text eol=lf`

1. `crates/brilliant-kernel-runtime/src/runtime.rs`
2. `crates/brilliant-kernel-runtime/src/store.rs`
3. `crates/brilliant-kernel-runtime/src/indices.rs`
4. `test/core-kernel/fixtures/cvn-7-qualification-score.ts`
5. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.ts`
6. `test/core-kernel/rust-migration/rkp-2-scale-evidence-worker.test.ts`
7. `test/core-kernel/rust-migration/rkp-2-scale-evidence-process.ps1`

### Five source-shape normalization sites

1. `runtime.rs`: `KernelRuntime` declaration inspection.
2. `store.rs`: `LiveScoreStore` declaration inspection.
3. `indices.rs`: `Rkp2StoreMetrics` declaration inspection.
4. `indices.rs`: `LiveScoreStore` private query source inspection.
5. `indices.rs`: `NormalizedIndexProjection` declaration inspection.

## Acceptance criteria

- **EOL-AC01**: Dedicated planning audit returns P0/P1/P2=`0/0/0` for an exact docs-only planning HEAD.
- **EOL-AC02**: Implementation diff is exactly the four technical allowlist files plus approved task/spec/evidence coordination files.
- **EOL-AC03**: The Rust lexical boundary verifier proves a unique terminal test module, whitespace-only suffix, all old/new hunk ranges inside five named existing functions plus one named parity function, and exact reconstruction to the base after removing the six permitted edits.
- **EOL-AC04**: Seven explicit `.gitattributes` rules exist exactly once; no wildcard or unrelated EOL policy is added.
- **EOL-AC05**: Two new no-local/no-checkout verification clones on E:, checked out with `core.autocrlf=true` and `false`, both report `i/lf w/lf attr/text eol=lf`, clean status and identical bytes/SHA for all seven paths.
- **EOL-AC06**: For the five workload inputs, both working-tree hashes equal the corresponding Git blob-byte SHA at the implementation candidate HEAD.
- **EOL-AC07**: Rust 1.97.1 `fmt`, `check`, `test` and `clippy -D warnings` pass; Rust 1.88.0 MSRV `check` passes. The existing ignored large test remains ignored during this prerequisite.
- **EOL-AC08**: The four previously failing tests pass, and the ignored test's fifth source-shape check is directly covered by an LF/CRLF unit-level parity assertion without executing the large workload.
- **EOL-AC09**: Typecheck and build pass; focused/full Node exit, counts, titles, four primary assertion signatures and the 80-file manifest match the I0 baseline with no new failure, skip, cause or signature drift.
- **EOL-AC10**: Trellis validations, JSON/JSONL parsing, Markdown fences, path uniqueness, `git diff --check`, clean/staged-empty and protected-path checks pass.
- **EOL-AC11**: E3 execution count remains zero; no S6.2 `implementation-evidence.md` or qualification artifact is created.
- **EOL-AC12**: A separate dedicated implementation audit returns P0/P1/P2=`0/0/0` before acceptance or integration is considered.
- **EOL-AC13**: Rollback is a revert of the prerequisite implementation/coordination commits and restores the exact accepted base without touching the blocked S6.2 branch.
- **EOL-AC14**: The accepted integration handoff explicitly requires a new S6.2 planning task and dedicated planning audit; it never resumes E2 directly.
- **EOL-AC15**: The implementation evidence and independent review explicitly distinguish the three new-child path/projection failures from the one inherited pre-/post-RKP-1A property-cap blob failure.

## Out of scope

- Running S6.2 E3 or generating S6.2 evidence.
- Fixing S6.2 Workspace Law provenance in this prerequisite.
- Cherry-picking the whole `c3c4d198...` commit.
- Changing scale fixture size, timeout, RSS cap, process envelope or native bridge.
- Changing Rust product/runtime/store/index behavior.
- Broad repository-wide line-ending normalization.
- Changing package, Cargo, toolchain, public API, schema, command, codec or extension contracts.
- S6.3, qualification, default runtime cutover, RKP-3, acceptance, archive, integration or push.

## User benefit

This prerequisite removes a machine-dependent false failure. The same accepted commit will build and test from a clean checkout regardless of the developer's Windows `core.autocrlf` setting, and later performance evidence will be tied to reproducible bytes rather than accidental working-tree line endings.
