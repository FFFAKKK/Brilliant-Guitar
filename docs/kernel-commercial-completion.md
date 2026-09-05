# Commercial kernel completion

## Scope and working authority

On 2026-09-05 the owner requested autonomous project assessment, planning,
implementation, self-review and local Git commits until the kernel meets a
commercial standard. The owner also permits skipping Trellis. This branch uses
this document and reproducible commits instead of creating new Trellis tasks.
The main session implements and checks; research agents are read-only.

Baseline: `902eacd` (RKP-4 audited candidate), isolated branch
`codex/kernel-commercial-completion`. The original `codex/learning` checkout
and other in-flight worktrees are preserved. Inherited task authorization and
status fields describe their original work, not this continuation. Existing
technical contracts, frozen fixtures and public compatibility remain binding.
An old planning document's claim about absent implementation is not a current
code inventory. No commercial-completion claim exists at this baseline.

## Current product and kernel assessment

- The opened `codex/learning` checkout is an older TypeScript baseline. It is
  divergent from the latest kernel line (34 versus 416 exclusive commits).
- Pure Core V1 and CVN-0..6 are recorded as accepted. RKP-0..3 have accepted
  predecessor evidence; RKP-4 has implemented transactions, history, cached
  reads, selectors, dirty identity, checkpoints, events and semantic replay.
- Rust remains a private native path. TypeScript is still the product runtime.
- Rust lacks complete accepted diagnostic/support classification, incremental
  validation, the full versioned extension protocol and composed session.
- The previous official CVN-7 run was incomplete (`EVIDENCE_INVALID`), with
  410/411 worker results and a stress-submit timeout. It is not a performance
  PASS. RKP-4 tests are also not final qualification evidence.
- Physical project persistence/recovery, editor UI, rendering, playback and
  instrument products are separate modules. Kernel completion covers their
  stable data/command/session seams, not a claim that those products exist.

## Completion criteria

1. Preserve `brilliant-score-1`, 28 commands, the 51 application runtime
   exports, CVN-2 SDK 8 runtime/34 type exports and its nine ABI fields.
2. Preserve exact arithmetic, diagnostic paths/order, failure precedence,
   schema compatibility and opaque unknown extension data. Invalid data and
   valid-but-unsupported data remain distinguishable.
3. A rejected operation changes no document, indices, version, history, dirty
   identity or events. Batch is atomic; undo/redo use stored inverse/forward
   effects; replay is deterministic and isolated.
4. Incremental validation equals the independent full semantic validator on
   accepted, rejected, generated and long command sequences. Local edits do
   not scan/clone/validate/materialize the whole document. Dependency scopes
   and fallback rules are explicit.
5. Instrument extensions share one versioned protocol and one semantic write
   boundary. Catalog, Inventory, capabilities, preparation, migration and
   read-only degradation are deterministic and tested with distinct synthetic
   consumers. No instrument obtains privileged mutable storage access.
6. Exactly one production engine owns runtime state after a reversible default
   switch. No permanent TypeScript/Rust selector or duplicate transaction owner.
7. Reproducible release-build public-boundary measurements satisfy the frozen
   Windows x64 Qualification V2 budgets below. Report all unsupported or
   untested platforms and resource failures explicitly.
8. Full regression, strict typecheck, Rust tests/fmt/clippy and the declared
   MSRV pass. Audit material defects with behavioral reproducers; tests alone
   do not establish architectural correctness. Record residual risks honestly.

| Public operation | Budget |
| --- | --- |
| Representative submit/undo/redo | p95 <= 8 ms; p99 <= 16 ms |
| Single edit, 102,400 Events | p95 <= 16 ms; p99 <= 33 ms |
| Cached selector/read | p95 <= 1 ms |
| Batch of 100 | p95 <= 100 ms |
| Replay of 100 | p95 <= 500 ms |
| Complete 10,000 stress submits / replay | each <= 180 s |
| Representative / stress peak RSS | <= 1 GiB / <= 2 GiB |

Use five fresh-process warmups and twenty measured samples with nearest-rank
percentiles, the frozen timed regions, and explicit evidence validity. Do not
relax thresholds or exclude native-boundary cost to obtain a passing result.

## Ordered execution and rollback

- [x] Establish fresh Rust, TypeScript and real-native baseline evidence.
- [ ] S1: close exact arithmetic and full diagnostic/profile parity gaps;
  implement tested Core dependency closures and pre-adoption incremental validation.
- [ ] S2: implement versioned Extension Protocol, deterministic preparation,
  validation completeness and equal-consumer session composition/migration;
  extend dependency closures to declared extension reads and references.
- [ ] S3: complete public behavioral differential coverage, seeded long
  sequences, hostile boundaries, resource limits and release performance.
- [ ] S4: switch the production facade in one reversible commit only after
  parity/performance gates pass; run the public regression on Rust default.
- [ ] S5: run fresh full qualification, self-review the resulting implementation,
  remove the obsolete executable transaction engine separately while retaining
  compatibility APIs/golden fixtures, and verify the final cleaned commit and
  packaged artifact. Repeat affected qualification if cleanup changes runtime
  dependencies, packaging or execution. Record the exact final evidence.

Each slice starts with a compiling behavioral regression, then implementation,
targeted/full checks and a local scoped commit. Revert slices in reverse order;
the default-switch commit is independently reversible. Later scope changes
are documented here before implementation. Never edit frozen oracle bytes to
hide a candidate mismatch, and do not mass-rewrite historical task records.

## Evidence ledger

### S1.1 — exact arithmetic and index ordering

The inherited Rust arithmetic accepted `M/2 + 1/2` and comparison of `M/2`
with itself, where `M=9007199254740991`. TypeScript rejects the unsafe
intermediate in both cases. Compiling Rust regressions failed on both before
repair; a real-native pickup import likewise incorrectly published a Session.
The repair enforces the same intermediate limits before reduction/cancellation.

Internal time-index comparisons use total mathematical ordering instead of
introducing additional public arithmetic failures. A second native regression
proved that reusing the public overflow check inside index construction rejects
a valid Voice starting at `1/M` with a `1/M` tuplet. Numeric `Ord` and the index
now preserve that legal input; the prior derived lexicographic fraction order
is also removed.

Historical RKP-3/RKP-4 scope checks now compare their fixed reviewed commits,
and RKP-0 archive cleanliness checks only its own paths. Current frozen fixture,
public surface and generated-output assertions remain active. These changes
allow later authorized work without altering the historical allowlists.

Verified on the repaired working tree:

- `cargo +1.97.1 test --workspace --locked --offline`: 162 passed, 1 ignored.
- Rust 1.97.1 fmt and workspace/all-target clippy `-D warnings`: passed.
- `cargo +1.88.0 check --workspace --locked --offline`: passed.
- Fresh Windows x64 native build; three real-native arithmetic regressions pass.
- `npm test`: 652 passed, 2 skipped, 0 failed (77.212 seconds).
- TypeScript strict compilation and `git diff --check`: passed.

These are compatibility and regression results, not final qualification. Local
build/test logs live under ignored `target/` and are not release artifacts.

### S1.2 — finite JSON values and exact floating-point round trips

Public probes on the arithmetic-repaired native build showed TypeScript creates a
Session for each of `tempo.bpm=120.5`, an unknown extension payload containing
`0.125`, and an unknown extension payload containing `1e100`; Rust rejected all
three with `codec.number-out-of-range`. Compiling native regressions reproduced
these failures. `FiniteNumber` now represents finite data values in tempo and
opaque JSON; exact integer fields retain `SafeInteger`. Opaque payload keys such
as `numerator` and `schemaVersion` are never interpreted as score schema fields.

A seeded 2,048-bit-pattern sample then exposed a second defect: the inherited
JSON parser changed `-9.084938291167941e+48` to `-9.08493829116794e+48`. Enabling
the existing pinned serde_json `float_roundtrip` feature resolves this observed
loss without changing package versions or the lockfile. Every finite sampled
value now survives a real-native round trip exactly. Safe integer serialization
is unchanged; negative zero is normalized as in JSON. Runtime extension logical
budgets use Foundation's actual numeric JSON wire length, including exponents.

The RKP-1 manifest test now asserts the precision feature. Historical RKP-2
part-owner byte preservation and RKP-3/RKP-4 dependency freezes compare their
fixed accepted/audited endpoints. Current seven-crate, dependency-pin, owner
shape, public-surface and immutable oracle checks remain enforced.

Verified on this slice:

- Four real-native regressions pass: finite import/round trip, metadata
  commit/undo/redo/replay, seeded exact values, and unchanged integer/non-finite
  rejection. MIN_VALUE and MAX_VALUE are covered as tempo and payload data.
- Rust workspace plus final Foundation regression: 164 passed, 1 ignored.
- Rust fmt, all-target clippy `-D warnings`, and Rust 1.88.0 workspace check pass.
- Fresh Windows x64 native build; `npm test`: 656 passed, 2 skipped, 0 failed
  (77.857 seconds), including strict TypeScript compilation.

### Planning review and next bounded slices

The owner requested an independent GPT-6 planning review on 2026-09-05. Its
useful corrections are incorporated below; this is planning evidence, not a
code-audit or qualification PASS.

1. **S1.3 input/diagnostic contract.** Build an entry-point/input-class matrix
   for public decode, direct semantic/profile validation, command capture and
   private Rust admission. Preserve their different error layers. Capture
   empty IDs, invalid numeric components, simultaneous faults and exact order.
   Borrow bounded captured candidate data before converting to strong store
   types; avoid a second mutable document model or weakening store invariants.
2. **S1.4 full semantic/profile.** Differentially cover all 31 semantic and 11
   unsupported codes, details, paths and ordering, including custom profiles.
   Invalid semantics suppress support classification. Use small pure rules;
   full traversal and incremental scheduling remain independently testable.
3. **S1.5 Core incremental admission.** Derive dependencies from actual change
   operations and validate the final overlay before submit/batch/undo/redo
   adoption. Count actual scans/materialization/validation at their entry
   points; existing zero-valued plan metrics cannot prove new work is local.
   Demonstrate work scaling and closed-over references/path relocation.
4. **S2.1-2.4.** Separate versioned protocol/catalog/inventory preparation,
   declarative rules and generic gateway, WASM capture/hash/ABI/execution,
   migration and a second structurally different consumer. Extend the Core
   dependency scheduler with declared extension reads/references and rerun full
   equivalence. Prove engine limits before relying on fuel/memory/stack caps.
5. **Continuous adversarial evidence.** Add long sequences, resource boundaries
   and rejection atomicity with each slice; S3 consolidates their full matrix.
   Final evidence names the exact cleaned commit, release artifact and supported
   execution environment. Kernel qualification does not qualify the excluded
   editor, physical persistence or other operating systems.

### S1.3a — independent entry-point and diagnostic oracle

The new `assessment-oracle.ts` corpus captures public document decode, strict
component decode, direct semantic validation, custom/default profile validation
and CommandBus creation separately. Its stored JSON expected results are
generated exclusively from the TypeScript implementation, with a shared base
document and explicit patches for each case. Tests never regenerate the file.
The corpus reaches all 31 semantic and all 11 unsupported diagnostic codes;
this establishes coverage, not Rust parity or exhaustive combinations.

Key pinned distinctions include fractional meter/staff/transposition/schema
components passing public decode but failing strict component decode, empty ID
reaching semantic validation, invalid semantics suppressing profile diagnostics,
ordered simultaneous errors, first duplicate measure reference authority,
input-order coverage diagnostics, later errors after invalid event duration,
extreme arithmetic and custom profile acceptance. Both planners confirmed the
default `ScoreComponentDecodeContext` allows finite numeric components; only its
explicit strict mode requires safe integers. The method name `integer` alone
does not establish an entry point's behavior.

Strict TypeScript compilation and all three corpus checks pass. Production code
is unchanged by this corpus slice. Rust must consume these independent expected
results while implementing the candidate view and complete validator next;
the existing private create rejection is not yet the public diagnostic result.
