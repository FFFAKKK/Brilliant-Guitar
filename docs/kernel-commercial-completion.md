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

## Initial product and kernel assessment at the branch baseline

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

## Current verified position

The branch remains in S1, Core compatibility and final-state admission. The Rust
reference semantic/profile assessment is implemented and differentially checked;
metadata, pitch, sequence/measure time and hierarchy/reference dependency gates
are implemented on the typed transaction path. Candidate input codecs and a
private occurrence prototype now cover reads, resolution, field/reference writes,
Part/Staff/Voice/Event insertion, moves/hiding and fallible retained collection
growth. Candidate execution is still test-only, not the native default route.

The next integration work is the admission operation journal, final candidate
diagnostics, complete command closure, cumulative resource accounting and strong
Store adoption/history. The versioned extension execution/composition work in S2,
consolidated release qualification in S3/S5 and reversible Rust default switch in
S4 remain open. The current source tree is a kernel library/native workspace;
editor UI, rendering, playback and physical project persistence are separate
product work, not completed deliverables of this branch.

Latest checks: 210 Rust tests passed, 1 ignored (29 candidate tests); strict
clippy, fmt and Rust 1.88.0 check passed. The most recent full real-native/TS
regression is 705 passed, 2 skipped. These are regression evidence, not commercial
qualification or a percentage-complete estimate.

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

### S1.3b/S1.4 — full Rust semantic and feature reference assessment

Foundation now provides `assess_score_semantics` and `assess_score_profile`,
closed diagnostic DTOs, a finite-data feature profile including K1 defaults,
and small pure musical rules. The semantic walker borrows captured JSON through
local cursors; it does not copy a second document tree or weaken store types.
Its caller still owns the appropriate decode/shape contract and capture caps.
Required structural reads return `InvalidCandidateShape` if that precondition
is broken. A semantic success is not, by itself, a persisted-shape decoder.

The implementation matches all 56 fixed TypeScript cases and a further 576
TypeScript-generated cases: 256 interacting fault combinations, 315 pitch and
transposition combinations, and five direct-validator boundary cases. Full
semantic and profile outputs match code, message key, paths, details and order.
Default and custom profiles are covered. The original 56-case file is unchanged.
The generated corpus has a fixed seed and is checked against the live TypeScript
reference; Rust tests read its independently produced expected values.

The reference report uses V2's 4,096 aggregate transaction diagnostic budget.
Exactly 4,096 diagnostics remain complete; diagnostic 4,097 returns an explicit
`DiagnosticLimit` mechanism failure and publishes no partial report. Both
semantic-invalid and valid-but-unsupported cases have inclusive/successor tests.
The future session composition must also account for diagnostics from all
levels against the aggregate budget, rather than granting every level a fresh
budget. Input preservation is asserted across success and failure.

The RKP-4 fixture check now freezes every fixture present at its planning commit
by its original path, permitting later stages to add new independent corpora.
Its original byte hashes, manifests and qualification inputs remain unchanged.

Validation at this slice:

- Rust workspace: 170 passed, 1 ignored.
- fmt, workspace/all-target clippy `-D warnings`, Rust 1.88.0 workspace check:
  passed; fresh Windows x64 native module rebuilt.
- TypeScript strict compilation and full regression: 660 passed, 2 skipped,
  0 failed (77.263 seconds). `git diff --check` passes.

This completes the reference assessment implementation, not transaction/session
integration, incremental validation or commercial qualification. No new native
endpoint or default runtime switch is introduced by this slice.

### Confirmed transaction-admission defect at `773df2b`

A real-native probe using `core.document.set-metadata` with `tempo.bpm=0`
reproduces a missing pre-adoption semantic gate: TypeScript returns
`command.semantic-invalid`; the current private Rust Stage 4 path commits it,
stores zero tempo and increments the document version to one. The ignored
reproducer and captured response are under
`target/probe-stage4-semantic-admission.cjs` and
`target/stage4-semantic-admission-probe.json`.

S1.5 must turn this into a behavioral regression and introduce validation over
the final overlay before any live adoption. Cover metadata, pitch/transposition,
duration/measure bounds and hierarchy/reference dependencies with actual work
counters, then stored-operation undo/redo and batch final-state behavior. The
new full reference remains independent of the incremental scheduler and serves
as its differential oracle; local edits must not call the full JSON walker.

### S1.5a — final metadata admission and batch replay repair

The transaction commit plan now checks the final metadata tempo before live
adoption. It uses the same pure tempo rule as both Foundation validators and
does not materialize a document or invoke the full reference walker. Metadata
with zero/negative tempo returns the TypeScript-compatible
`command.semantic-invalid` diagnostic. Stored undo/redo effects pass through
the same commit plan. Batch intermediate values are permitted: zero followed
by 121.5 succeeds, whereas 130 followed by zero rejects the whole transaction.

The new private `semanticRulesEvaluated` metric counts actual tempo rule
evaluations, including failed attempts. Title/author-only changes and unchanged
tempo schedule zero evaluations; a changed tempo schedules one. Native tests
exercise 1, 64 and 512 parts with constant rule work and no order copies. These
tests do not establish latency qualification or repair the older global-work
metric instrumentation; scan/materialization counters still need the complete
entry-point accounting specified in the plan above.

The regressions also preserve an already-persisted undo position, an existing
redo branch, dirty identity, snapshot cache identity and the next event sequence
after rejection. Stage 3, Stage 4 and detached replay use the admission gate.
Replay rejection retains its successful prefix and reports the failing top-level
index. Diagnostic responses preserve exact code/message/path/details, remain
frozen, and use the closed semantic decoder plus Rust stable-path constraints.
Exactly 4,096 diagnostics are accepted at the native response boundary; empty,
4,097, unknown-code, unsupported-code, invalid-message, negative/overlong-path
and extra-field reports are rejected as `bridge.internal`.

The valid-batch replay regression exposed a separate existing defect: replay
used the captured **batch-child** decoder for its top-level entries. A dedicated
top-level captured decoder now permits a batch there; the existing child decoder
continues to reject nested batches. Both live submit and replay retain identical
nested-child failures and leave rejected batch effects unapplied.

Seven real-native/adapter regressions cover this slice. Final validation:

- Rust workspace: 170 passed, 1 ignored; fmt, all-target clippy `-D warnings`
  and Rust 1.88.0 workspace check passed. Windows x64 native module rebuilt.
- TypeScript strict build and full regression: 667 passed, 2 skipped, 0 failed
  (78.818 seconds). `git diff --check` passed.
- Self-review traced preparation/reservation through adoption and checked the
  failed-operation metrics and diagnostic adapter. It found and repaired the
  generic decoder's negative-path-index allowance at the native boundary.

This is the metadata dependency family only; full incremental semantic/profile
admission remains incomplete.

### Confirmed derived-pitch defect at `712455f`

A real-native probe changes `part-1`'s instrument transposition to
`{ diatonicSteps: 100, chromaticSemitones: 0 }`. TypeScript rejects the resulting
note with `semantic.sounding-pitch-invalid` and detail
`derived-pitch-octave-out-of-range`; the private Rust runtime currently commits
it at document version one. Reproducer: `target/probe-pitch-admission.cjs`;
captured results: `target/pitch-admission-probe.json` (both ignored artifacts).

The next slice must close pitch dependencies for both changed notes and changed
part instruments, evaluate final batch state, preserve full-validator diagnostic
order/paths after hierarchy moves, and bound work to affected parts/notes. It
must not treat the successful metadata gate as complete semantic admission.

### S1.5b — final pitch dependencies and shared diagnostic budget

The commit plan now supplies final surviving Note records and Part instrument
records to incremental assessment. Changed/new notes use their final
note/event/voice/Part ownership chain. A new or changed Part transposition
expands only its own final measure contents, voices, events and notes; unchanged
transposition does not expand the Part. Aggregate inserts already register all
descendant notes. Same-ID deletion/reinsertion uses final records and ownership,
not the collector's historical removed-ID set. Plain owner-local reordering and
staff-reference changes introduce no additional pitch dependencies.

Written and sounding pitch rules reuse Foundation's independently tested pure
rules, with written failure suppressing sounding evaluation. A note reached by
both a Part dependency and an explicit note edit is assessed once. Metadata and
pitch errors aggregate before rejection. IDs are sorted for deterministic
evaluation; public diagnostics use final numeric Part/content/voice/event/note
positions, never lexical ID/path order or HashMap iteration. Required positions
are grouped by sibling list and resolved with a borrowed visitor once per list,
stopping after the final wanted ID. No full DTO or full validator is used.

The added private `semanticDependencyReads` metric increments at scalar/owner
dependency reads, order lookups and each visited order entry, on both accepted
and rejected operations. A valid one-note edit performs two musical rules and
five dependency reads across the tested document sizes (including a 1,024-note
chord and 64 unrelated Parts). Part-wide checks scale with that Part's notes.
Large diagnostics have a linear grouped path lookup rather than one sibling
scan per error. Dedicated transposition reads detach only its two integers;
ordinary note edits do not copy the Part's instrument display name.

V2 fixes the 4,096 aggregate diagnostic cap but does not name a Core overflow
code. This slice defines the private native Core mapping as
`command.resource-limit-exceeded`, `limitKind: diagnostics`, `limit: 4096`,
`actual: 4097`. It is a mechanism failure with no partial diagnostic report and
zero adoption. It does not borrow the old TS module-only `module-issues` name.
The native decoder accepts exactly those numeric bounds for this new kind.
The original public TS Core API is unchanged; final facade integration must
carry this explicit mechanism contract forward.

GPT-6's read-only closure review confirmed the current trigger set, final
surviving-record selection, owner-local move behavior and shared undo/redo
adoption point. Its key corrections—same-ID reinsertion, grouped path positions
and a separate overflow mechanism—are covered by the new regressions. Nine
native test cases include 128 seeded TS runtime comparisons, changed-note and
changed-instrument failures, final batch repair/removal, Part/Voice moves with
288 ordered diagnostics, same-ID relocation between differently transposing
Parts, stored undo/redo/replay, work scaling and both pure-pitch and mixed
metadata/pitch 4,096/4,097 boundaries.

The existing private read-boundary contract test now names the two additional
read operations exactly and checks their immutable receiver / stable-value
signatures. Its prohibitions on physical handles, mutable store, whole-document
types and nondeterministic sources remain in force. No frozen fixture bytes,
ChangeOp variants or public application exports are changed.

Validation at this slice:

- Rust workspace: 170 passed, 1 ignored. fmt, all-target clippy `-D warnings`
  and Rust 1.88.0 workspace check passed; fresh Windows x64 native build.
- TypeScript strict build and full regression: 676 passed, 2 skipped, 0 failed
  (78.007 seconds). The earlier single failure was the private read-method
  allowlist; its explicit signature-preserving update passed targeted and full
  reruns. `git diff --check` passed.

Meter/duration/hierarchy and reference diagnostic parity, complete profile
admission, protocol composition and final qualification still remain; this is
not complete S1 or qualification.

### Confirmed next dependency family: sequence time and measure bounds

On a four-quarter-note 4/4 fixture, each of these independently produces a
TypeScript `command.semantic-invalid` report while the current private native
runtime commits at document version one:

- Change the first event's duration to a whole note: three later events receive
  `semantic.sequence-exceeds-measure` diagnostics.
- Change the voice sequence start to 1/4: the last event exceeds the measure.
- Change the measure definition to 3/4: the last event exceeds the new bound.

The ignored reproducer `target/probe-time-admission.cjs` and captured
`target/time-admission-probe.json` preserve exact commands and ordered expected
diagnostics. The next closure must include changed events/orders/starts and
every affected voice for a changed measure definition, using final overlay
state. Full arithmetic overflow and duration failure precedence, start/pickup
bounds, final paths, and shared metadata/pitch/time diagnostic ordering must
match the independent full walker before adoption.

### S1.5c — final sequence time and measure-bound dependencies

The three confirmed time defects above are now rejected before adoption.
`FinalValidationDeltaV1` borrows the prepared final records, touched voice IDs
and reference delta. Event duration/order and voice-start changes seed their
final voices. Changed/new measure definitions resolve base referrers through
the existing target index and combine them with one scan of the changed
reference delta. Final overlay references determine which Part/measure links
survive. New voices are included, removed owners are omitted, and same-ID
replacement uses the final owner and time values. No additional native read
method, whole-document DTO or full semantic walker is introduced.

Time checks share Foundation's pure measure and note-duration rules. Canonical
fraction failure precedes sign failure. Invalid effective measure duration is
reported once per affected voice. A bad individual duration leaves the prior
position available for later events, whereas an addition or comparison overflow
stops subsequent cumulative time checks. Out-of-bounds positions continue to
report later overruns. Own-duration overflow retains its `reason`; cumulative
arithmetic overflow does not. Batch repair, undo, redo and replay use the same
final-state gate.

The former pitch-only report collector is now a shared bounded collector for
metadata, measure, voice-start, pitch and event-time locations. Final numeric
positions are still grouped by sibling list, borrowed once per list and stopped
after the last requested ID. Stable evaluation ranks merge rule families in
reference order, including pitch before duration/overrun within each event.
The 4,096 limit applies to the combined report; diagnostic 4,097 returns the
existing private `diagnostics` mechanism failure without a partial report or
state adoption.

Work is deliberately the complete affected final voice, including an unchanged
prefix. Every dependency lookup, visited order/referrer entry and arithmetic
rule is counted. A four-event local duration change performs 15 rules and 13
dependency reads with either one or 64 Parts. A last-event edit in a 1,024-event
voice performs 3,075 rules and 2,053 reads. Changed-measure work scales with its
final referring voices; unrelated Parts do not enlarge a local event edit.
These are scope measurements, not an affected-suffix optimisation or release
performance qualification. The older global-work counters still require their
separate instrumentation audit.

GPT-6's read-only dependency review identified the missing measure trigger and
the exact overflow/continuation distinctions. Ten real-native time tests cover
these rules, pickup/start bounds, final dependency insertion/removal, same-ID
event/measure replacement, stored history and replay, numeric event ordering,
4,096/4,097 aggregate limits, and 160 seeded comparisons with the independent
TS command runtime. Accepted seeded candidates also compare final documents;
rejections preserve cache identity, history and emitted events.

The new gate exposed three old private Rust tests whose successful transaction
inputs were musically invalid: two whole notes in 4/4, a whole note beginning
at 1/4, and a quarter note in a 1/8 pickup. Only those local test inputs were
adjusted to retain their original index/transaction purposes. Frozen fixtures
were not changed. Earlier pitch tests now include the time-rule counts for
removal/reinsertion while retaining exact constant local-pitch work assertions.

Validation at this slice:

- Rust workspace: 170 passed, 1 ignored; fmt, all-target clippy `-D warnings`
  and Rust 1.88.0 workspace check passed. Fresh Windows x64 native build.
- Full TypeScript regression: 686 passed, 2 skipped, 0 failed (142.313 seconds).
  After strengthening the pickup and accepted-document assertions, strict build
  and the 19 time/pitch tests passed again. This wall time is ordinary test-run
  evidence, not the frozen release qualification timing.
- Scoped self-review checked final reference resolution, arithmetic stop state,
  grouped diagnostic ranks, resource-failure atomicity and unchanged public
  interfaces. `git diff --check` passed.

S1 remains incomplete: hierarchy/reference diagnostics and admission at create
and public composition still need closure, followed by the planned protocol,
performance, default switch and final-artifact qualification work.

### Confirmed next gaps: hierarchy fields and required collections

The ignored `target/probe-hierarchy-admission.cjs` and captured
`target/hierarchy-admission-probe.json` reproduce these remaining differences:

- Set the existing staff's `lineCount` to zero: TS reports
  `semantic.staff-line-count-invalid`; private native commits at version one.
- Remove the final Part, measure or voice: TS reports the corresponding
  `semantic.part-required`, `semantic.measure-required` or
  `semantic.voice-required`; native returns `stage3.local-invariant-rejected`.
- Removing the referenced final staff already returns
  `command.reference-conflict` on both paths; preserve that earlier command
  failure precedence while closing final structural semantics.

The next slice must distinguish safe final-candidate musical diagnostics from
mechanism invariants, aggregate them with the completed metadata/pitch/time
families and preserve temporary-invalid/final-valid batch behavior.

### S1.5d — final hierarchy, cardinality and staff membership

The confirmed staff-line and required-collection defects above are repaired.
CommitPlan now checks final semantic state before structural adoption checks.
Changed Staff records validate line count. Touched surviving measure, Part,
staff, voice and notes orders validate their required cardinality. Empty event
sequences and rest content remain valid. Removed owners have no surviving
obligation; temporary empty containers can be repaired within a batch.

Voice defaults and explicit event staff assignments use final Part membership.
Changed reference addresses are combined with indexed base referrers for staff
identity changes, covering unchanged referring records and same-ID replacement.
Future staff targets can be inserted by later batch children. Removing a staff
with a current live reference still fails immediately with reference-conflict;
target and anchor resolution retain their earlier command precedence.

GPT-6's read-only review identified the distinction between deferred assignment
membership and immediate referenced-staff removal. A subsequent live codec
probe refined its broad cardinality recommendation: nested Part components may
contain empty voice arrays, but measure-insert envelopes require nonempty
contents and voices. Tests pin those different failure categories explicitly.
The private CommitPlan gate also rejects empty notes and untouched dangling
references when command preparation is bypassed, including stored operations.

The shared bounded diagnostic collector now orders hierarchy, metadata, pitch
and time reports in the independent reference walker's numeric traversal order.
The combined 4,096/4,097 cap remains atomic. One borrowed, typed event-content
discriminant query extends the private CoreBaseRead contract to 12 methods;
production uses an indexed slot and does not detach an event/chord to test
notes cardinality. Public exports, command schema and 11 ChangeOps are unchanged.
A valid local staff-line edit evaluates one rule with zero semantic dependency
reads for both one and 64 Parts. This is scoped work evidence, not qualification.

Nine new real-native tests cover exact reports, batch repair, inserted nested
shapes, membership, identity replacement, undo/redo/replay, cache/history/event
atomicity, aggregate limits and local work. Older private tests now expect the
correct semantic codes instead of mechanism failures. The aggregate-Part
extension inverse test retains a valid second Part so it tests ownership without
depending on an invalid empty final document; frozen fixtures are unchanged.

Validation at this slice:

- Rust workspace: 171 passed, 1 ignored; fmt, all-target clippy `-D warnings`
  and Rust 1.88.0 workspace check passed. Fresh Windows x64 native build.
- Full TypeScript regression: 695 passed, 2 skipped, 0 failed (165.638 seconds).
  Strict build and the nine hierarchy tests also pass after strengthening the
  explicit semantic/envelope/reference-conflict assertions.
- Scoped self-review checked final surviving owners, base and overlay reference
  union, shared history rejection, codec precedence, deterministic diagnostic
  ordering and the exact private read surface. No public surface changes.

### Confirmed next gaps: candidate IDs and measure coverage

The ignored `target/probe-candidate-admission.cjs` and captured
`target/candidate-admission-probe.json` preserve exact inputs and reports:

- Duplicate existing measure insertion: TS returns one early `semantic.id-duplicate`
  at the requested insertion index; native returns local-invariant-rejected.
- Duplicate staff insertion: TS returns the final walker's `semantic.id-duplicate`
  at the later duplicate; native returns local-invariant-rejected.
- Empty inserted staff ID: TS reports `semantic.id-empty`; native rejects its envelope.
- Missing, unknown and duplicate Part measure contents: TS reports ordered
  coverage/reference diagnostics; native returns local-invariant-rejected.

The next design must preserve ordered candidate occurrences and batch behavior
without weakening unique live-store identities. Early HashMap deduplication
cannot recover those reports. The special early duplicate-measure command rule
must be kept distinct from general final-state duplicate-ID validation. Create
admission and public composition also remain open; S1 is not complete.

### S1.5e — early duplicate-measure preparation parity

The duplicate-existing-measure probe above is now repaired independently.
After document, anchor and supplied Part targets resolve, measure insertion
returns exactly one `semantic.id-duplicate` at the requested insertion position
in the current batch overlay. This precedes coverage and final musical checks;
a later batch child cannot repair this preparation failure. No duplicate is
inserted into the overlay or live store. General component/cross-kind duplicates
remain separate open candidate-admission work.

Four new native regressions compiled and failed before repair, then passed:
numeric insertion paths at 0/1/10/13; envelope/target/anchor/coverage precedence;
batch prefix ordering, child failure identity and isolated replay; rejection at
an undo position followed by redo and successful remove/reinsert identity reuse.
They compare complete reports against TS and pin events/cache/history/dirty
atomicity. The production change is confined to the existing early branch.

Validation: fresh native build; 171 Rust tests passed, 1 ignored; fmt, all-target
clippy `-D warnings`, Rust 1.88.0 check and strict TS build passed. Full npm
regression: 699 passed, 2 skipped, 0 failed (122.505 seconds). Self-review checked
that no early/general duplicate rules were conflated and no public surface or
live-store uniqueness rule changed. `git diff --check` passed.

### S1.6 — selected next candidate-admission design

GPT-6 reviewed both the representation and exact per-entrypoint codec rules.
The selected [implementation plan](kernel-candidate-admission-design.md) uses
transaction-private ordered occurrences, preserves the typed local-edit path,
and lowers only valid final candidates into the single runtime adoption owner.
It explicitly covers ambiguous targets, owner-local anchors, parent deletion
repair, net-zero batch history and a valid prefix before candidate mode.

The codec matrix distinguishes nonempty targets/direct Event/Note insertion
from nested component IDs and hierarchy references/anchors that accept empty
strings before later checks. Foundation keeps score admission views; Contracts
keeps command-specific policies. The existing StableId type and seven-crate DAG
remain intact. This is a reviewed implementation plan, not completed parity or
commercial qualification; prototype and differential evidence are still required.

### S1.6a — shared raw-ID component and command admission

Foundation's nine component definitions now share an `Id = StableId` parameter.
The default DTOs and live Runtime/Store signatures remain nonempty-ID types;
admission aliases use String and preserve empty IDs, duplicate children and
ordered repeated measure contents. ScoreDocument and extension owners are not
generalized. Direct Event/Note insertion, targets, range endpoints and direct
event anchors retain their strict ID types. This avoids copying a second Raw
DTO model and does not turn ordinary Runtime operations into JSON traversal.

Contracts provides private raw-ID submit, captured-child and captured-replay
entry points through the same parameterized decoder as typed commands. Batch
children remain captured until their own execution position. Existing request
size/depth/property/duplicate-key protections are shared. Native submit still
uses the typed entry point: occurrence resolution, candidate execution, final
semantic validation and lowering must be completed before activation.

An independent TS corpus covers all 28 commands with 504 cases: 176 decoded
candidates and 328 rejected shapes. It includes empty/non-string/prototype-like
IDs, direct-versus-nested numeric rules, raw anchors and references, duplicate
collections, null optionals, tagged variants and required arrays. Rust compares
decode outcomes and failures, plus serialized components/references/anchors to
prove raw values and order are retained. TypeScript tests reconstruct expected
results independently and compare the committed corpus; tests never regenerate it.

The corpus exposed additional existing shape drift. Explicit null in optional
staff/pickup/tuplet fields was treated as absence; invalid clef lines were accepted
by command payload decoding; serde's internally tagged unit variants silently
discarded extra fields. The latter persisted even after adding deny_unknown_fields
to the rest enum and required an exact empty-struct variant decoder. Contracts
also explicitly checks start/none/inherit-default payload variants. Both typed
and admission commands now preserve the corresponding TS envelope failures.

A compiling real-native negative-corpus regression failed on the previous addon
(`staffId: null` returned local-invariant-rejected instead of invalid-envelope).
After repair, all 328 invalid cases return the exact reference failure and retain
cache identity, history, dirty state and empty events. Rust tests separately pin
deferred child decoding, nested versus top-level replay, strict typed IDs and
shared resource failures. No frozen oracle, command count, public TS export,
ChangeOp or crate-dependency contract was changed.

Representation/codec verification is not candidate-execution parity. Next:
build transaction-private occurrence reads/indices over the existing typed
overlay prefix and new payloads, then close resolution, repair, adoption and
history semantics without whole-document fallback.

Validation at this slice: fresh Windows x64 native build; 175 Rust tests passed,
1 ignored; fmt, all-target clippy `-D warnings` and Rust 1.88.0 check passed.
Full TypeScript regression: 701 passed, 2 skipped, 0 failed (156.697 seconds).
Scoped self-review checked every generic ID field, strict direct-entry fields,
closed optional/tagged shapes, prefix-free decoding and unchanged native routing.
The next read-layer review mapped all required reads onto existing capabilities;
the concrete frozen-prefix/occurrence approach is recorded in the linked design.
`git diff --check` passed. These results establish this input slice, not S1 or
commercial completion.

### S1.6b — occurrence storage and resolution prototype

The Runtime now has a private `cfg(test)` occurrence module over its real typed
overlay. It preserves the entire earlier transaction prefix, consumes new Part
subtrees into independent arena occurrences, retains duplicate/empty IDs and
repeated/unknown/empty measure links, and resolves typed targets without global
ID deduplication. Hidden roots suppress unexpanded descendants and allow ID reuse
without resurrecting a hidden prefix node. Staff references use the prefix's
index plus new records, filtered by visible source occurrences.

The read-only GPT-6 source review identified a necessary anchor distinction:
Staff/Voice remote ambiguity is internal-error, whereas Event remote ambiguity
is anchor-wrong-owner. The prototype also preserves owner-local precedence,
move target failure before self-reference, insertion with a same-ID anchor,
and Voice content-occurrence ownership checks even at a start anchor.

Thirteen new tests use the real Store/overlay, including exact prefix ChangeSet
equality, deleted/rebuilt identity, parent repair, hidden-order positions,
duplicate content owners, failed preparation and drop isolation. A guarded
4098-Staff test forbids base aggregate detach and cloned order/time reads, proves
indexed scalar lookup has no sibling traversal, checks visitor short-circuiting,
and confirms one local order copy on first mutation with later reuse.

This is verified implementation groundwork, not production candidate parity.
Native submit still selects typed commands. The test-only gate will remain until
fallible allocation/resource accounting, candidate writes, final diagnostics,
valid lowering and complete command/history integration are implemented. There
are no experimental public exports or unused-code lint exemptions. The design
document records the remaining work and the limits of the local work counters.

Validation: 188 Rust tests passed, 1 ignored; fmt, all-target clippy `-D warnings`
and Rust 1.88.0 all-target workspace check passed. The new module is excluded from
production builds, so the previous native/TypeScript baseline (701 passed,
2 skipped) is unchanged and was not rerun for this prototype. Scoped self-review
checked prefix-only reads, no borrowed-order materialization in anchor lookup,
kind versus occurrence identity, hidden-source reference filtering, and retained
transaction ownership. S1 and commercial qualification remain open.

### S1.6c — shared candidate identity storage

The bounded GPT-6 resource review found that owned prefix ID copies would grow
with owner/order references, especially for long document or Part IDs. The
prototype now shares immutable prefix addresses across occurrence clones and
shares a prefix Part address with its content occurrences. New raw ID strings,
staff references and content links are pooled and shared with lookup keys; each
duplicate still has its own arena occurrence. The strong public StableId and live
Store representation are unchanged, and prefix reads do not eagerly pool a score.

Three additional tests check allocation sharing for long IDs (64 KiB document,
52 KiB Part, 88 KiB repeated raw ID), multiple roots and cross-kind/reference
reuse. They also prove hidden nodes/strings remain retained and ambiguous targets
become unique only through occurrence visibility, never string deduplication.
All previous occurrence/anchor/prefix-isolation tests still pass.

This removes the identified retained-copy amplification; it does not establish
the entire candidate memory bound. Temporary typed reads and independently read
prefix addresses still allocate. The design records separate compatibility
logical and retained-memory accounts, prefix/suffix string merging, retained
hidden nodes and the need for a derived envelope before resource enforcement.
No new limit or production routing change is introduced.

Validation: 191 Rust tests passed, 1 ignored (16 occurrence tests); fmt,
all-target clippy `-D warnings`, Rust 1.88.0 all-target workspace check and
`git diff --check` passed. Scoped self-review confirmed value-based prefix
identity, distinct duplicate arena occurrences, shared retained owner/ID copies
and unchanged frozen-prefix reads. Production remains excluded by `cfg(test)`;
candidate resource enforcement and commercial qualification are still open.

### S1.6d — candidate collection reservation and terminal failure

Candidate writes now reserve Vec/HashMap/HashSet capacity fallibly across all
eight retained collection sites. A failed reservation is terminal for the
candidate; later writes cannot resume partially prepared records. The borrowed
order-copy path restores that terminal state and discards partial copies. Move
bounds are checked before child removal. The typed prefix remains owned and
unmodified, with no live Store adoption on any failure path.

Three additional Rust tests inject failure at every reservation in a nested
Part insertion and parent removal, cover each partial order-copy failure, and
exercise genuine capacity and attempt-counter overflow. They compare complete
prefix ChangeSets and Store exports, assert no later mutation/reservation after
failure, and cover all eight reservation site categories. The existing 16 tests
continue to pin candidate representation, resolution and read scope.

Capacity failure maps to internal-error consistently with the current commit
preparer. No declared input/logical limit changes. These guards cover retained
write collections; they are not a process-wide OOM guarantee or a complete
resource bound. Arc/string construction and temporary/base reads remain part of
the pending memory analysis. Cumulative logical-budget merging and final
validation/lowering must still be completed before production activation.

Validation: 194 Rust tests passed, 1 ignored (19 candidate tests); fmt,
all-target clippy `-D warnings` and Rust 1.88.0 all-target workspace check passed.
Scoped self-review traced every retained collection insertion to its reservation,
verified terminal-state restoration in the borrowed visitor and kept capacity
failure distinct from declared-limit failure. Native routing remains unchanged
under the prototype's `cfg(test)` gate. S1/commercial qualification remain open.

### S1.6e — production StableId owner/history sharing

The resource analysis reproduced ID-copy amplification in the production typed
overlay: inserting a Part with a 64 KiB ID and 256 staves retained 258 distinct
parent-text buffers across Staff/Voice owners. The new Rust regression failed on
the existing String representation and passes with one buffer after StableId's
private storage changes to Arc<str>. This is a production repair; candidate
execution remains excluded from routing.

The bounded read-only GPT-6 review found no fixed StableId layout/native ABI
contract or raw-layout consumers. The public constructor, nonempty validation,
error text, borrowed string access, Debug and content-based Eq/Hash/Ord are kept.
Manual JSON serialization is unchanged, with no serde feature/dependency change.
Tests cover independently constructed equal IDs, supported constructor inputs,
clone lifetime/thread safety and exact Unicode/control-character wire roundtrips.
A fresh native addon matches the TS oracle for long-ID batch insertion/rename,
undo, rejected rename at an undo position, preserved redo history, redo and replay.

Sharing applies to clone chains, not independently decoded equal strings. The
initial conversion allocation and atomic clone/drop costs remain; this does not
establish the full retained-memory envelope or commercial performance. Candidate
logical accounting, command closure and final adoption remain open.

Validation: 198 Rust tests passed, 1 ignored; fmt, all-target clippy `-D warnings`
and Rust 1.88.0 all-target workspace check passed. The native addon was rebuilt
across the workspace and its copied binary hash verified. The first full TS run
found a new test's whole-document export token in the transaction-layer boundary
scan; that assertion was replaced with existing directed reads, preserving the
boundary check. Final full TypeScript regression: 702 passed, 2 skipped, 0 failed
(146.122 seconds). The repaired Rust owner regression and all 10 transaction
boundary tests also passed. Scoped self-review checked the private representation,
wire/value contracts, unchanged constructor signature and clone-sharing limits;
`git diff --check` passed. S1/commercial qualification remain open.

### S1.6f — occurrence-scoped candidate field writes

The private candidate prototype now supports all primary scalar fields, Part
instrument and raw Voice/Event staff-reference replacement. It shadows prefix
fields locally and updates added records by occurrence, keeping the complete
typed prefix and live Store unchanged. Duplicate raw IDs and same-ID rebuilds
cannot share field replacements. Same-value raw writes reserve nothing, while
changed-then-restored writes remain separate changes for future command journaling.

Reference lookup now removes stale prefix edges and discovers newly referenced
IDs, including empty/unknown IDs. It excludes hidden sources/ancestors and provides
an owner-Part query for Staff removal. GPT-6 verified that the TS early conflict
check is scoped to the Staff's Part, even when other candidate Parts contain
invalid references to that raw ID. It also identified the Event effective-ID
no-op rule, which remains a command-preparation requirement rather than a raw
storage-write rule. None/inherit and an explicit string stay distinct.

Six new tests pin all field kinds, duplicate occurrences, prefix replacement
isolation, invalid-reference repair, cross-Part/removal visibility and faults at
every reservation in the three new replacement maps and reference-ID pool. The
guarded 4098-Staff test also exercises local writes with zero sibling traversal
and forbids base aggregate/order/time copying. Allocation failure terminates
further writes without changing the field whose reservation failed.

Validation: 204 Rust tests passed, 1 ignored (25 candidate tests); fmt,
all-target clippy `-D warnings`, Rust 1.88.0 all-target workspace check and
`git diff --check` passed. Scoped self-review checked every replacement branch,
prefix/new-record reference union, owner occurrence filtering, same-value writes
and reservation-before-field-mutation. This slice remains under `cfg(test)`, so
the freshly verified native/TS baseline (702 passed, 2 skipped) was not rerun.
Native routing and public exports are unchanged. The prototype does not yet
supply command effects/history, cumulative budgets, final semantic validation or
strong adoption. S1/commercial qualification remain open.

### S1.6g — candidate Staff/Voice/Event insertion

The candidate now inserts Staff, Voice and Event records beneath either prefix
or added owners, reusing borrowed anchor resolution and fallible local order
growth. Event subtree construction is shared with Part/Voice insertion. The
implementation retains empty/duplicate nested IDs, notes/rest distinctions,
raw staff references and repeated content occurrences without collapsing them.
Voice owner checks precede reservation even for same-ID Parts/start anchors.
Placement counts visible siblings and validates bounds before order mutation.

Four additional tests cover child ownership/order, same-ID/empty anchors, hidden
siblings, untouched repeated contents and faults at every reservation in a
three-component insertion sequence. The complete frozen prefix and live Store
remain unchanged on failure/drop. The prototype now has 29 tests.

The GPT-6 history review identified the next structural requirement: separate
the admission operation journal from the final strong Store adoption delta.
A repaired net-zero batch still has real operations/history/events; its strong
data delta can be empty. The selected private journal/remapping approach and
required integration evidence are recorded in the candidate design document.
No history representation or public result decoding changed in this slice.

Validation: 208 Rust tests passed, 1 ignored; fmt, all-target clippy `-D warnings`,
Rust 1.88.0 all-target workspace check and `git diff --check` passed. Scoped
self-review traced shared nested/direct Event construction, anchor-before-write
ordering, hidden-sibling positions and terminal reservation failure. Production
remains excluded by `cfg(test)`; the prior native/TS baseline is unchanged and
was not rerun. Command/journal/validation/adoption integration remains open.

### S1.6h — result-only affected IDs and net-zero reference behavior

The live TS oracle confirms that an insert-invalid-Part/remove-Part batch is
committed even though its final document is unchanged. Submit/undo/redo advance
versions 1/2/3, retain empty/deleted affected addresses and emit commit plus dirty
events. Dirty is true/false/true because existing identity follows the history
sequence, not document byte equality. The new regression pins exact affected
order, deduplication, events and detached replay for the pending admission journal.

A compiling transport regression failed because the native adapter used nonempty
target validation for the affected list. Contracts now separates result IDs from
input IDs while sharing the tagged address shape. Result, history and event
affected lists accept raw strings, including empty; command and selector targets
still use StableId. Conversion from a stable ID or pooled candidate Arc reuses
its text allocation, and result clones retain sharing. Raw/stable representations
compare by content. No dependency, operation kind, wire field or application
runtime export was added.

Two Rust tests cover all seven result/input address kinds, exact JSON shape,
malformed values, cross-representation equality and long-ID clone sharing.
Three TS tests pin the reference net-zero behavior, repaired response capture
and real-native nonempty input targets. The response test substitutes affected
lists into a valid native transport response; native candidate submit is still
pending and is not claimed as passing.

Validation: 210 Rust tests passed, 1 ignored; fmt, all-target clippy `-D warnings`
and Rust 1.88.0 all-target workspace check passed. The Windows x64 native addon
was rebuilt and its copied binary hash verified; the three focused TS tests
passed on that addon. Full TS regression: 705 passed, 2 skipped, 0 failed (80.015
seconds). `git diff --check` passed. Scoped self-review preserved
strict target/live identity types, closed affected shape/capture limits and shared
text conversion. Candidate journal/validation/adoption and qualification remain open.
