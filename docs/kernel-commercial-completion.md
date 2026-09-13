# Commercial kernel completion

## Scope and working authority

**2026-09-13 architecture clarification, before the first repair:** the usable Native V2 integration was
a Rust-owned Store/transaction/history with a TS host executor, not a completed
TS-independent transaction/validation path. `createNativeContributionExecutorV2`
dispatched assessment to TS `runModulePipeline`, which also ran TS Core semantic
and profile checks. Ordinary module preparation, transformation and validation
remain synchronous JS callbacks; optional Wasm bindings do not remove the host
plugin-assessment dependency. The accepted Architecture Reset V2 sections 8.3, 11.3 and
12.4 instead require transaction-time declarative/bounded-Wasm validation under
Kernel Session ownership and data-only preparation. This is an outstanding
architectural boundary, not merely a performance-tuning item. Product design and
bounded first-party integration can proceed, but functional tests do not prove
commercial performance or untrusted-plugin execution control. See the current
assessment and product capability map in
`docs/handoff-kernel-to-product-2026-09-13.md`. This clarification records the
owner's follow-up discussion; it does not silently approve a permanent departure
from that target or resume unrestricted implementation.

**Execution resumed by the owner (2026-09-13):** continue kernel completion,
starting with the verified Native transaction/assessment boundary. Work remains
main-session only, with existing contracts and bounded verification; unrelated
frontend planning files are not part of this implementation. The first change
moves integrated Core assessment authority into Rust while retaining the
remaining plugin-executor migration explicitly as unfinished work.

**Next bounded repair (2026-09-13):** Rust now derives the expected compatible
plugin-assessment roster from the candidate, installed assembly and captured
cross-plugin reads. It rejects missing, duplicate, reordered or foreign rows,
malformed diagnostics and issue-cap violations, and independently checks
candidate availability before adoption or history movement. The host still
executes and aggregates callbacks; protocol coverage does not authenticate the
truth of a plugin's semantic result. This does not finish transaction-time
declarative/Wasm scheduling, detached migration or incremental validation.
Current verification and limits are recorded in
`docs/evidence/kernel-native-module-assessment-2026-09-13.json`.

**Bounded execution composition (2026-09-13):** a separate trusted-host
Wasm-only installer requires bindings for every installed contribution before
selecting the backend, including currently dormant contributions. It forbids
plugin JS fallback across editing and detached migration. Invalid native
executor handles also reject in the existing mixed installer. Six-family real
guest tests retain the transaction/history/replay/migration contracts with no
SDK JS callbacks. TS host scheduling and projection still remain; per-callback
fuel does not constitute a transaction-wide execution budget. Rust source and
artifacts are unchanged in this slice. See
`docs/evidence/kernel-wasm-only-2026-09-13.json` and
`docs/kernel-wasm-executor-v1.md` for verification and remaining boundaries.

**Native operation budget (2026-09-13):** the Wasm artifact's integrated
creation/operation/migration boundaries now establish a Rust-owned shared fuel
and call account (100 million fuel, 4096 calls). Nested synchronous calls inherit
it; guest failures are sticky and checked after the host returns, so swallowing
exhaustion cannot authorize a commit. Independent operations recover a fresh
account. This supersedes the preceding per-callback-only limitation for the
same-artifact Native path; TS scheduling, host-copy/compilation cost, aggregate
memory/byte accounting, other embeddings and performance qualification remain
unfinished. Evidence: `docs/evidence/kernel-wasm-operation-budget-2026-09-13.json`.

**Cumulative guest transfer admission (2026-09-13):** the same operation account
now caps guest input plus output at 128 MiB. It checks input before guest start
and output before host materialization, preserving per-call byte limits and
sticky refusal/recovery. This closes repeated low-fuel/high-output guest traffic
within that Native scope. It does not bound process RSS, count all intermediate
copies or the separate aggregate host assessment transport. Peak memory, host
cost, real-workload capacity and release qualification remain open. See
`docs/evidence/kernel-wasm-transfer-budget-2026-09-13.json`.

**Measured workload and snapshot reuse (2026-09-13):** the integrated Native read
path now reuses Stage 4 known-version snapshots without retransmitting unchanged
documents or freezing the cached graph again. Reads still consult Rust for live
history/dirty/availability; older artifacts retain a one-time negotiated full-read
path. At 256 bars, twelve replies fell from 2,540,700 to 4,116 bytes in the bounded
diagnostic workload. The same measurement exposed an unresolved capacity issue:
the test Wasm guest exhausts per-callback fuel during preparation at 64/256 bars.
No budget was raised and no capacity PASS is claimed. See
`docs/kernel-native-workload-2026-09-13.md` for reproduction, memory evidence limits
and the staged V2 binary location while the old artifact remains in use.

**Guest decoding capacity, partial repair (2026-09-13):** an opt-in, data-only
Rust scoped-callback codec now permits borrowed or typed Core input and decodes
normal callback requests in one pass. The reference guest uses it without
reducing the complete V1 view or changing any execution budget. In the identical
workload, 64-bar plugin edits now commit six of six times and can read actual
Core notes; 256-bar preparation still exhausts fuel. This supersedes only the
64-bar part of the preceding finding. The seven-crate graph and default/ABI
surfaces are unchanged; the exact workspace feature check now includes this
optional protocol codec. Commercial readiness remains approximately 65%.
The next capacity requirement is an explicit versioned selective-read/ScoreSlice
contract with compatibility, candidate visibility and resource-accounting proof.
See `docs/kernel-wasm-guest-capacity-2026-09-13.md`.

**Historical pause at the owner's request (2026-09-12):** finish the current
cross-plugin explicit-read task, record its evidence and local commits, then
stop and report. That pause was followed by the explicit restart above.
The broad commercial objective remains incomplete; the pause was not
commercial acceptance or a technical blocker.

The owner's subsequent repository-management request authorizes integrating the
validated `f9ec44b` kernel baseline into master and freezing the legacy TS engine.
It does not resume unbounded feature work or turn the integration into a default
backend cutover. TS SDK/native adapters and shared validation services remain
active dependencies; old TS transaction development is frozen. See
`docs/archive/typescript-kernel.md` and `docs/repository-maintenance.md`.

On 2026-09-05 the owner requested autonomous project assessment, planning,
implementation, self-review and local Git commits until the kernel meets a
commercial standard. The owner also permits skipping Trellis. This branch uses
this document and reproducible commits instead of creating new Trellis tasks.
Following the owner's stop, cost review and 2026-09-12 restart, work proceeds in
bounded slices with the main session implementing, checking and committing
directly. No GPT-6 audit agents or unbounded automatic continuation are used.
Existing plans and Git checkpoints replace unnecessary Trellis task creation.
The original completion objective remains an unfinished roadmap, not a claim
that every bounded session must keep running until commercial qualification.

The owner clarified that this is a microkernel: foundational score editing,
transactions, identity, integrity and safe extension composition define its
functional boundary. Guitar techniques, repeat structures and other domain
features may belong to layered plugins. Their absence from Core fields is not
by itself a kernel defect. Plugin-owned semantics must still participate in the
same write, validation and history boundary. Two-layer dependency compatibility
must be demonstrated with a concrete consumer before adding new framework APIs.

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

S1.14 implements Core final-state admission in the existing Rust native session.
All 27 leaf commands and Batch now execute after entering occurrence storage;
ordinary representable commands retain the typed overlay. The first temporary
state that cannot obey live Store identity/coverage rules preserves all earlier
operations and their shared accounting before changing representation once.
Later children can repair that state. Final diagnostics belong to the complete
transaction, and a rejection publishes no document/history/version/event change.

The native path includes command preparation and error precedence, ordered
public effects/affected entities, cumulative Batch limits, shared string/history
accounting, final semantic assessment and real Store adoption. Combined retained
history supports Undo/Redo without re-running command preparation. Checkpoint
byte scheduling and semantic command replay use the same admission seam.
Effective net-zero commits retain their operation facts and advance history;
true no-op and rejected commands preserve redo. Final preparation and later
publication failures retain the actual measured work.

Lossless UTF-16 text/IDs, exact arithmetic, all semantic/profile diagnostic
families, cached reads/selectors and typed incremental dependency validation
remain implemented. Occurrence final assessment intentionally uses the shared
complete Foundation rules; this functional integration does not claim that
candidate assessment has become incremental or commercially qualified.

The kernel is **not functionally complete**. S2.1a supplies strict extension
requirement validation and an explicit TS wire decoder, checked against 144 real
TS observations. S2.1b adds authenticated SDK metadata capture, a Rust host
catalog projection, canonical inventory/cache and availability reads from actual
Store headers. These former 18 work-in-progress files are committed at 960bda9;
527534c also integrates master's clean build and repository-local test scratch
fixes. They were metadata groundwork. S2.2a now adds a separate private Native V2
artifact and the actual SDK-to-Rust module command journey: mixed pitch and
extension effects, module assessment, availability guards, shared stored history,
events and public replay. Both Score-owned and Part-owned consumers are tested
against the existing TS implementation. The opted-in factory creates no TS
command runtime or history. See [the V2 implementation boundary](kernel-native-integrated-v2.md).
Standalone Core commands, cross-domain Batch and candidate history assessment
are now wired in that integrated session. Detached extension migration is also
wired through a separate V2 function. Bounded Wasm execution and authentic
contribution binding are now connected. Explicit cross-plugin block reads also
work through TS, Native and Wasm, with an independent two-plugin index/summary
consumer. S2 remains incomplete: dependency-aware degraded assembly and precise
dependency closures need work. Module callback views and assessment currently
use complete projections; incremental equivalence and full resource/portability
qualification are not claimed.
See [the S2 plan](kernel-extension-completion-plan.md). The product default remains
TypeScript; this is the existing private native implementation route, not the
S4 product cutover. Editor, rendering, playback and physical project persistence
remain separate product modules.

The preceding S2.1a verification had 493 Rust tests passed, one ignored. Strict clippy passed;
Rust 1.88.0 all-target check and TypeScript build passed. The new 28-scenario real
native/TS corpus passes every leaf and a retained typed-prefix transition through
submit, Undo and Redo, comparing full documents, history/dirty identity, affected
entities, returned events and subscribed delivery. These are regression results,
not release qualification. The S1.14 ledger below records final artifact evidence.

The final full S1.14 TS/native run passed 759 tests, failed zero and skipped two
(49.679 seconds). The preceding run exposed one historical source-location guard;
it now checks the actual unified admission path instead of the predecessor's
Session-local Batch helper. The frozen JSON timing guard passed both S1.14 full
runs, but its earlier two full-run failures remain unexplained and open for
commercial qualification. No threshold, workload or native behavioral fixture
was relaxed. P3B's latest run has qualification=false.

## Functional completion before commercial optimization

The owner's current priority is complete kernel behavior before commercial
optimization. Correctness, atomic rejection and compatibility remain necessary
while filling functions; private test primitives alone do not close a route.

| Kernel responsibility | Current position | Remaining closure |
| --- | --- | --- |
| Score model, exact arithmetic, UTF-16 storage/codecs | Implemented and exercised through native boundaries | Preserve compatibility through composition |
| 27 leaf commands and Batch | Typed and occurrence admission both integrated into native sessions | Broader adversarial and long-sequence consolidation in S3 |
| Final diagnostics and Store adoption | Core and applicable plugin rules assess candidates before atomic adoption | Precise declared dependency closures and incremental equivalence |
| History, dirty identity, events, checkpoint and replay | Core, module and mixed Batch effects share stored history and events | Long-sequence/resource qualification |
| Extensions | Catalog/inventory, capability checks, execution, migration, Wasm binding and explicit cross-plugin reads are wired | Dependency-aware degraded assembly and complete resource/platform qualification |
| Session/application surface | Core native session works; TypeScript remains product default | Composed consumers, then qualified reversible Rust cutover |
| Commercial acceptance | Incomplete | Hostile/resource and long-sequence evidence, performance, final qualification and obsolete-engine cleanup |

Complete S2 functions next. S3 consolidates behavioral/resource/performance
qualification; S4 changes the default only after those gates, and S5 verifies the
final cleaned release artifact. No percentage-complete estimate substitutes for
these explicit missing capabilities.

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

### S1.7 — Staff structural journal and indexed candidate references

Stored Staff insertion/removal now covers both original prefix Staff and new
Staff, including delete/recreate with the same raw ID. Staff definitions, moves,
references and whole-Part deletion compose with exact occurrence identities and
immutable insertion images. Part removal synthesizes an expected subtree from
recorded Staff births/deaths, fields and orders before checking the candidate.
It never adopts unrecorded candidate changes as history. Prefix and Added Staff
field preparation check the frozen/birth image plus recorded changes, including
before a no-op; genuine no-ops still consume no reservation and create no step.

Thirteen journal tests include Contracts-decoded Staff commands, exact unpaired
UTF-16, empty/duplicate temporary IDs, prefix deletion/rebirth, original/new Staff
inside deleted Parts, scoped/hidden reference conflicts, malformed stored
operations, the field-drift/no-op cases and every controlled recording/replay
reservation failure. A ten-case fixture generated solely by the TypeScript
CommandBus freezes submit/undo/redo observations. Rust compares visible entity
trees and replays from independently built strong boundary Stores.

That fixture exposed a legacy TS history defect: a duplicate Staff inserted into
a new Part then removed with its parent commits, but undo rejects with
`history.invariant-violation`. The fixture explicitly retains that observation;
the new Rust journal successfully reverses and reapplies the sequence by stored
identity. The production TS history defect remains open until replacement or a
separate repair. Document equality in this net-zero case is insufficient proof
of history correctness.

GPT-6 review found and the implementation repaired two issues: later recorded
Staff field changes could conceal unrecorded drift, and Staff removal scanned
the entire retained candidate arena for references. The first repair was checked
again for no-op reservation behavior. Candidate references now use raw-ID and
Part-occurrence buckets maintained by all insertion, replacement and bundle
replay paths. Four additional tests prove stale-edge removal, unique current
edges, raw-string/hidden restoration, reservation failure behavior and query
cost independence from 4,096 unrelated Events or 2,048 unrelated candidate
reference overrides.

The measured counter counts candidate edges actually inspected. Frozen prefix
lookup still has its existing overlay reference-order scan; `prefix_addresses`
counts returned addresses, not internal prefix work. Hidden sources within the
same queried bucket are still inspected and filtered. These prototype counters
are not commercial resource qualification or a claim of universal allocation
failure recovery. Candidate execution remains `cfg(test)`; final diagnostics,
effects/segments, cumulative accounting, full command coverage and strong Store
adoption/history remain required before native integration.

Validation: full Rust regression passed 316 tests with one existing ignored test;
all 84 candidate tests passed again after lint-only repairs. Rustfmt, all-target
clippy with `-D warnings`, Rust 1.88.0 all-target workspace check and scoped diff
checks passed. The complete TS/native suite passed 722 tests, skipped two and
failed zero in 170.783 seconds. The release addon SHA-256 remains
`65C88B68D6C930E392669A0C8E5BE866BF5305F701D759938FE96F117E402A4E`;
no native rebuild was needed for this test-only candidate slice. Logs are
`target/staff-journal-rust-final.log`, `staff-journal-candidate-final.log`,
`staff-journal-clippy.log`, `staff-journal-msrv.log` and `staff-journal-npm.log`.
GPT-6 scoped rereviews passed after the two reported findings and no-op regression
were repaired. This is regression evidence, not qualification or a Rust-default
cutover.

### S1.8 — final assessment, stable adoption and real suffix replay

The owner clarified that functional completion comes before commercial
optimization. This slice connects the existing occurrence/journal work to full
semantic diagnostics and actual Store adoption while keeping incomplete public
candidate routing disabled.

Foundation now runs the same semantic/profile rules over fallible node reads.
The occurrence view preserves diagnostic content/order without constructing a
whole Score DTO or JSON tree. Four new Foundation tests exercise virtual values,
UTF-16, missing/null/type checks and fallible iteration. Candidate tests compare
the virtual and JSON reports and prohibit aggregate/opaque payload detachment.
The 12-case TS-only submission oracle supplies independent exact diagnostics,
early child failure and repaired/net-zero outcomes.

The internal CoreBaseRead interface gains its 13th capability: a typed extension
header visitor. Store and frozen overlays preserve real order across independent
extension edits, Part bundles and generic extension order operations. Opaque
payloads are not copied for assessment. An independent review identified a
capacity/shape error conflation, now repaired with explicit unavailable,
invariant and capacity errors and allocation-fault tests. Temporary header
metadata is O(E+D); order replacement logs add L IDs and worst-case folding work
is O(E+(D+L)(E+D)), before string-comparison costs. This is not a zero-allocation
or final performance claim.

A semantic pass creates an owned stable final view. The sparse delta preserves
removed lifetimes separately from final values; hidden temporary raw IDs never
enter Store slots. Frozen prefix deltas borrow the existing arena and retain
extension changes. Shared preparation verifies the final projection, reserves
capacity and adopts records, topology, references and time indices. Actual
Recorder steps, plus prefix operations, determine version advancement even when
the document is unchanged. Three independent TS oracle successes now exercise
real adoption and fresh-boundary suffix inverse/forward adoption with versions
1/2/3 and normalized index rebuild parity. Eight oracle semantic failures also
exercise the finalization wrapper before identity sealing.

Additional adoption cases cover invalid-prefix repair, retained prefix extension
history, every scalar/reference family with event reordering, all-descendant
Part rebirth, cross-kind ID rebirth and empty/no-op distinction. Preflight tests
cover mismatched final projections, reservation failures, stale version/document
and extension-only order changes. The latter now work on typed and final-view
paths; extension simulation retains base handles rather than copying all opaque
payloads merely to track order.

A new cross-kind test found a production commit defect: old Event cleanup
deleted a new Staff binding with the same ID and caused an assertion after
adoption began. All six entity kinds now clear a global ID only when it still
points to that exact old kind/handle. Independent rereview passed. Typed and
candidate regressions verify old handle invalidation, new binding preservation
and index parity. A real-native TS comparison verifies submit/undo/redo state,
versions, history, dirty state and events for the Event/Staff rebirth sequence.

Validation: 349 Rust tests passed, one existing ignored test; all 99
candidate tests passed. Rustfmt, all-target clippy `-D warnings`, Rust 1.88.0
all-target check and diff checks passed. Full TS/native regression: 725 passed,
two skipped, zero failed in 45.997 seconds; P3B completed in 22.363 seconds.
The rebuilt/copied release addon SHA-256 is
`F5AE6D6C6C4E0F8879373F37DF095AAE4D26328100DDBD9E9BA85128B76F488D`.
Logs: `target/candidate-adoption-rust-final.log`, `candidate-adoption-clippy.log`,
`candidate-adoption-msrv.log`, `candidate-adoption-native-build.log` and
`candidate-adoption-npm.log`.

Remaining functional work is substantial: complete all candidate command/journal
forms, compose prefix and suffix into one private undo/redo transaction, preserve
effects/segments/affected ordering, complete resource accounting and implement S2
versioned extension/session execution. Final-view preparation reads and some
prefix work are not yet included in candidate traversal counters. The internal
vertical path is not public native completion; Rust default, debug performance,
release qualification and commercial acceptance remain open.

### S1.9 — combined stored history and current extension state

The typed ChangeSet and occurrence Journal now form one private history entry.
Redo replays prefix then suffix; undo replays suffix inverse, verifies its
retained start identities, seals a structurally readable intermediate and replays
the typed inverse. The existing 11-operation interpreter accepts a CoreBaseRead
boundary. Both paths assess final semantics once and produce one owned adoption
plan. No intermediate state is written to Store.

The structural seal checks nonempty/unique strong identities and readable owner
routes without rejecting repairable music semantics. Six local bundle readers
reconstruct actual state for typed removal preconditions, including Measure
content across Parts and owned extension positions. Suffix-inverse and
prefix-inverse deltas merge in execution order, preserving dead generations and
later fields/references/orders. A nonempty suffix inverse has two full document
scans (one structural, one semantic); prefix-only inverse has one. The semantic
validation count is one in both cases.

Nine combined tests now cover every typed operation kind, invalid intermediate
tempo and staff references, transient duplicate subtrees, real net-zero history,
empty/prefix-only entries, repeated cycles, Part/Measure subtrees and same-ID Part
rebirth with every generation compared against the previous one. Rejection after
a late inverse precondition or final semantic failure leaves Store, indices,
version and metrics unchanged. Four structural tests cover malformed IDs,
owner-local contents and all injected reservation failures; four adapter tests
compare actual bundles/fields/orders/extensions and absent-link reference behavior.

Integration and independent GPT-6 review found extension state defects in the
shared typed overlay. Standalone insert/replace/remove now update owner references
and their reverse lookup. Part detachment now projects current extension members,
payloads and global predecessors. Standalone removal also records the current
predecessor after earlier edits/reorders. The regression covers inserting a score
extension before a Part-owned extension and removing/replaying them in reverse,
as well as insertion before an original extension followed by its removal.
Retained payload reads avoid repeating header scans inside Part projection.
Generic order detachment continues to retain the underlying payload/reference
for subsequent replacement and reinsertion. Independent scoped rereview passed.

This is functional infrastructure completion within the current private Recorder
scope. It is not all-command candidate completion: arbitrary prefix-Part removal,
Voice/Event (including nested Notes)/Measure journal forms and remaining order/extension suffix forms
still need integration. Effects/segments/affected ordering, cumulative retained
resources, exact capacity error propagation, S2 extension/session composition,
Rust default activation and commercial qualification remain open. The current
Option-based bundle/extension read contracts can collapse an allocation failure
to an unavailable/precondition error; they still fail before Store adoption.
Traversal counters still omit some final-view and frozen-prefix work.

Validation: 371 Rust tests passed, one existing ignored test, including 120
candidate tests. Rustfmt, all-target clippy `-D warnings`, Rust 1.88.0 all-target
check and diff checks passed. Release addon SHA-256:
`4FF7616E097A44957884E05916AA542CF5CBE5165E0BF1F7FF6A576B4C5E97A4`.
Logs: `target/combined-history-rust-final.log`, `combined-history-clippy.log`,
`combined-history-msrv.log`, `combined-history-native-build.log` and
`combined-history-npm.log`. Full TS/native regression on that freshly rebuilt
release addon passed 725 tests, skipped two and failed zero in 46.548 seconds.
P3B completed in 22.914 seconds. The frozen workload, runner and thresholds
remained unchanged. This is regression evidence, not commercial qualification.

Next functional slice, reviewed by GPT-6: finish Event/Voice subtree recording,
replay and real combined adoption for the five existing structural commands.
Share the existing image/field/order/identity machinery, then extend verified
prefix-Part removal, Measure's cross-Part composite, range resolution and the
complete 28-command/Batch dispatch. Notes stay nested Event data; no extra Note
insertion/removal public API is needed. The detailed order and risks are recorded
in the candidate design document. Commercial optimization follows function closure.

### S1.10 — Voice/Event subtree history and shared expected state

Private Voice/Event insertion and removal now compose with scalar/reference
edits, list moves, nested deaths and same-ID rebirth over prefix and added owners.
Part, Voice and Event history share an immutable node table; operation tags must
match the bundle root kind. Notes remain nested Event data. No extra public Note
insertion/removal API was introduced, and public command routing is unchanged.

Expected subtree state comes from immutable birth images and owner routes, or
the frozen typed prefix, overlaid only with recorded field and order changes.
It is not recaptured from arbitrary current candidate data. The shared builder
replaces the old Staff-specific Part patching logic. Unchanged images and child
index arrays retain their Arc sharing. Changed preorder tables are checked by
logical JournalId order rather than requiring a different numeric index array.
Affected owner/node/order checks precede recording, including apparent no-ops;
valid field/reference/move no-ops still reserve nothing and record no step.

Voice removal follows the unique Part/content owner route without re-resolving
the global Measure. Event removal uses the actual owning Voice occurrence.
Removing the last Voice is allowed as an intermediate operation and must be
repaired before final assessment; an empty Event list can be a valid final state.
Descendant identities are retained before hiding and rebound from stored data
during replay. Combined adoption still validates final semantics once.

Sixteen new tests include real submit/inverse/forward Store adoption with a
nonempty typed prefix, index rebuild parity, nested edited deletion, rebirth,
stale descendant rejection and complete injected reservation-failure loops for
three nested lifecycles. Guards reject mismatched root tags, unrecorded fields
or children at affected boundaries, and replacement occurrences disguised with
identical raw IDs and values. Independent GPT-6 reviews found and verified the
root-tag and owner-field guards; the final scoped rereview passed.

Validation: 387 Rust tests passed, one existing ignored test, including 132
runtime candidate tests and four Foundation candidate tests. Rustfmt, all-target clippy `-D warnings`, Rust 1.88.0
all-target check and diff checks passed. Logs: `target/rhythm-journal-rust-final.log`,
`rhythm-journal-clippy.log`, `rhythm-journal-msrv.log` and the focused
`rhythm-journal-focused.log`. All code changes are under the test-only candidate;
the S1.9 release addon and its 725-pass native result remain the latest native
evidence, not a new run for this checkpoint.

Next functional work: general prefix-Part removal including owned extensions,
Measure's cross-Part composite, range resolution and complete 28-command/Batch
dispatch. Effects/segments/affected ordering, cumulative retained resources,
precise capacity errors and complete traversal accounting remain activation
gates. Repeated parent-order checks also need cost accounting. S2 versioned
extension/session composition, Rust default activation and commercial
qualification remain open. This checkpoint completes a private structural slice,
not the kernel as a whole.

### S1.11 — prefix-Part deletion and owned extension history

The private Recorder can now remove frozen-prefix Parts as well as its own
births. Its subtree payload includes affected opaque extension values and their
current global predecessors. Expected extension data comes independently from
the frozen prefix minus recorded deletion keys; arbitrary candidate extension
writes cannot become accepted history. Removing one Part updates the trusted
predecessors used when later removing another Part.

Part command preparation has a separate helper: resolve the target first, then
require the same global Measure/content coverage as TS. The minimum Part count
remains final semantics so later batch children can repair a deletion. Low-level
stored operations still represent transient repeated contents; they are not the
complete public command preparation surface.

The extension state layer ties existing owners to occurrence lifetimes. A same-ID
Part birth cannot inherit a deleted Part's extension data. Originally dangling
owners can be repaired by a new Part; a birth records only the pre-existing keys
it must preserve during inverse replay. Explicit Part removal still captures and
deletes those extensions. Undo restores payloads before undoing the birth, leaves
the preserved data available to the typed-prefix inverse, and resets its owner
binding for subsequent private replay cycles. Header, value, order, reference,
Part detach and final semantic reads use the same current extension state.

Extension deltas now merge in chronological order across prior suffix inverse,
typed prefix and current suffix. Later states and final order replace earlier
ones while every deletion key remains recorded through same-key restoration.
Only final preparation lowers this private state to Store adoption.

New tests exposed a shared production defect: standalone extension changes
updated headers but left generic order reads using a stale cached/base order.
Typed inverse replay could then reject a valid ReplaceOrderedChildren operation.
Extension order reads and generic write snapshots now use the current headers.
A direct regression covers interleaved standalone edits and generic order
replacement, detachment, reinsertion and moves, including wrong-document reads
and visitor short-circuiting. Other order kinds keep their existing path.

Nineteen new Rust tests cover those reads, delta composition, real combined
adoption, edited prefix extensions, interleaved owners, same-ID rebirth, final
semantic rejection, malformed stored payload/owner/anchor, unrecorded mutation,
all injected Part-record/replay reservation failures and repeated dangling-owner
replay. Index rebuild parity, versions and unchanged Store on failure are checked.
Independent GPT-6 reviews verified the journal, trusted extension expectations,
state layer and production order-read repair. Their owner-lifetime and dangling
reverse-reference findings were repaired and covered by regressions.

Validation: 406 Rust tests passed, one existing ignored test; 146 runtime and
four Foundation candidate tests passed. Rustfmt, strict all-target clippy,
Rust 1.88.0 all-target check and diff checks passed. The candidate-number split
is now explicit: earlier combined counts included the four Foundation tests.
Logs: `target/part-extensions-rust-final.log`, `part-extensions-clippy.log`,
`part-extensions-msrv.log`, `part-extensions-native-build.log` and
`part-extensions-npm.log`.

The rebuilt release addon SHA-256 is
`FA2DC2416E4D03EC8774CCB5F99479B43B02C9D7EEE711F7BA6DBFF47CB15AA3`.
Full TS/native regression on Node 24.15.0 passed 725 tests, skipped two and
failed zero in 49.693 seconds; P3B completed in 24.209 seconds. The initial full
run had two failures: the historical source assertion still required all orders
to reuse their first snapshot, and a duplicate-object timing ratio reached 3.271.
The assertion now pins the unchanged entity-order guard and the explicit
Extensions exception; the behavioral Rust regression covers the latter.
The frozen timing guard passed both an isolated repeat and the subsequent full
run on the same addon. No workload, runner or performance threshold changed.
The first result is retained in `target/part-extensions-npm-first.log`, and the
isolated result in `target/part-extensions-targeted-native.log`. This observation
remains part of future performance qualification, not a claim of timing stability.

Remaining functional sequence: Measure cross-Part composite and content
membership, range resolution, shared 28-command/Batch dispatch, then full
effects/segments/affected and resource/error accounting. S2 extension/session
execution and Rust activation remain open. The new suffix extension layer only
implements Part deletion/restoration; it is not the complete versioned extension
protocol. Repeated header scans and some allocations are not yet fully charged;
Option-based read failures can still lose precise capacity classification.
Commercial optimization and qualification follow complete functionality.

### S1.12 — Measure composite history and cross-Part command preparation

Measure insertion/removal now retains a leaf definition and separately owned
Content trees under each Part. A Content remains owned by its Part, rather than
becoming a child of the global Measure. Each root stores its own predecessor,
complete absent/present order and immutable image. The composite checks the full
Part order and independent content membership facts before replay; malformed
owner/root/anchor tables cannot silently omit a Part or substitute another lifetime.

Removal reconstructs expected images from the frozen typed prefix or immutable
journal births plus recorded field/order changes. It checks those images before
hiding all affected Content descendants and the Measure. Undo restores each
original Part order; final Store adoption and rebuilt indices distinguish a
same-ID birth from the deleted Measure/Voice/Event/Note lifetimes. Combined history
also restores typed-prefix changes to descendant fields and Content order.

Private command preparation follows the TS sequence: document, global anchor,
payload Part targets, then the special same-kind duplicate Measure definition
check with the requested insertion index. Exact coverage canonicalizes the
payload to Part order and normalizes Content order; inexact coverage preserves
payload order for final semantic diagnostics. Missing local anchors fail before
normalization. Removing the final Measure has no early count guard, so a later
batch child can repair it before the final semantic check.

Measure moves also inspect Part orders: a globally unchanged position still
records a change when local order needs repair. A fully unchanged move adds no
Reservation or history operation. Full order replacements store expected and
next JournalIds, validate the same unique occurrence set, and update the trusted
order history used by subsequent subtree removals. Internal replacement steps
can combine the final effect of a local move and reorder; they are not yet the
public effect-count/segment representation.

Regression coverage includes real preparation/adoption/undo/redo, differing Part
orders and nonempty trees, last-Measure final rejection and same-batch repair,
same-ID handle invalidation, empty transient IDs, repeated payload owners and
same-position splice order, later parent repair, malformed composites, unrecorded
field/order edits, repeated replay in one Candidate and every injected retained
collection Reservation failure in recording and both replay directions. Failed
attempts poison the candidate and leave Store and document version unchanged.

Independent GPT-6 reviews checked the composite against identity/order invariants
and command preparation against the TS adapters and effect preflights. Their
suggested repeated-owner replay regression is included. The only initial test
failure was a foreign-owner fixture reusing Staff IDs; the fixture now uses
distinct Staff IDs and matching references while retaining the rejection assertion.
The independent six-case TS CommandBus corpus matches actual Rust Store commits
and history: multi-Part insert/remove/move, globally unchanged local-order repair,
true no-op and last-Measure same-ID rebirth. The TS test regenerates the exact
fixture from real batch submission and history; the Rust test consumes commands
through the admission decoder and checks complete document and rebuilt-index parity.

Validation: 434 Rust tests passed, one existing ignored test. The 28 new runtime
tests bring candidate coverage to 174 runtime plus four Foundation tests. Strict
all-target clippy, fmt, Rust 1.88.0 all-target check and diff check passed. Logs:
`target/measure-rust-final.log`, `measure-clippy.log`, `measure-msrv.log`,
`measure-oracle-rust.log`, `measure-oracle-ts.log` and `measure-guards.log`.

Full TS/native regression passed 726 tests, skipped two and failed zero in 49.436
seconds on Node 24.15.0; the unchanged P3B journey completed in 23.948 seconds.
Log: `target/measure-npm.log`. The addon was not rebuilt for this test-only Rust
change; its verified SHA-256 remains
`FA2DC2416E4D03EC8774CCB5F99479B43B02C9D7EEE711F7BA6DBFF47CB15AA3`.
The new TS oracle regeneration test is part of that full run. These are current
regression results, not a candidate public activation or commercial qualification.

Next functional work: range resolution and the remaining shared 28-command/Batch
dispatch, then complete effects/segments/affected and resource/error accounting.
The special duplicate-definition preparation result still needs public diagnostic
packaging at that shared dispatch boundary. Temporary borrowed-order no-op
comparison and membership checks use repeated scans, including quadratic cases;
detailed allocation/traversal charging and precise capacity classification are
still activation gates. S2 versioned extension/session execution, public native
candidate activation, Rust default and commercial qualification remain open.
No production route is activated by this test-only slice.

### S1.13 — range selection, deletion and written-pitch transformation

The candidate Recorder now implements the two range commands over all three
selection forms. It resolves both endpoints before classifying duplicate,
missing and owner mismatch failures. Measure and Part/Measure ranges use global
Measure order even when local Content order differs; Voice/Event ranges use the
current Voice order. Reversed endpoints normalize the selected interval. Missing
or duplicated interior Content retains the TS distinction: InvalidRange for a
Measure range and RangeEndpointNotFound for a Part/Measure range.

Selection retains occurrences, verifies the related frozen-prefix/recorded
images and orders, and enumerates Measure -> Part -> Voice -> Event. Global
Voice/Event endpoint lookup follows actual owner routes, so repeated raw IDs
and hidden old lifetimes do not collapse through a strong Store index. Interior
Event/Note raw IDs remain unfiltered until command effect preparation requires
their uniqueness. Zero transpose and rest-only no-ops still resolve the range
and verify the selected state.

Range deletion fixes the selection before mutation. A Measure range records
the existing composite deletions without normalizing surviving Part contents;
the other ranges remove Events while retaining Voice/Content/Part structure.
Written-pitch transformation reuses the existing pure Rust arithmetic helper.
It computes every changed pitch before raw-target preflight and field recording,
so a later invalid pitch wins over an earlier ambiguous effect target and no
partial pitch history is emitted. Its private error retains a raw JsString Note
ID, including a transient empty ID. Inverse replay restores recorded old pitches.

An actual production discrepancy was reproduced before the fix. For global
Measures [A,B,C] and Part Contents [C,B,A], range deletion of B returned [A,C]
in native Rust while TS returned [C,A]. A reversed multi-Measure range had the
same defect. The typed helper's range flag previously changed effect counting
without suppressing normalization. It now explicitly preserves Part Content
order for range deletion; ordinary Measure removal still normalizes and counts
the reorder effect. Independent per-Part inverse anchors were already retained.
The original Rust and real-addon failures are recorded in
`target/range-rust-repro.log` and `range-native-repro.log`.

Four fresh-addon differential regressions now check both deletion forms,
reversed multi-delete and already ordered data through submission/undo/redo,
including exact document, history, dirty state, emitted events and affected
entities. Separately, eight scenarios generated solely by the real TS CommandBus
cover three range deletes, three transposes, reversed endpoints with local order
preservation, and rest/zero no-ops. Their Rust consumer decodes actual commands,
commits Store plans, and compares exact documents/history and rebuilt indices.

Further regressions cover endpoint error priorities, internally missing/repeated
contents, prefix order changes, Added/reborn identities, unrecorded state, raw
empty Note errors, transform-before-effect failure precedence, retained empty
Voices, transpose followed by deletion, repeated replay and every injected
Reservation failure. Real combined history also covers deleting all Measures
then rebuilding them within one batch, with old descendant handles invalidated,
and typed-prefix pitch/order changes followed by a range transpose.

Independent GPT-6 reviews cross-checked the range resolver against TS and the
command preparation/history wiring separately. No unresolved defect was found
within those reviewed paths. All 452 Rust tests passed with one existing ignored
test, including 191 runtime candidate tests and four Foundation candidate tests.
There are 18 new Rust regressions in this checkpoint. Strict all-target clippy,
fmt and Rust 1.88.0 all-target check passed. Logs: `target/range-rust-final.log`,
`range-clippy.log`, `range-msrv.log`, `range-focused.log` and `range-history.log`.

The freshly rebuilt addon SHA-256 is
`D31C1E3DB0D1E6C02DB2F45F6F74754E661A4168A93AED65D321428E94422645`.
The focused TS oracle/native checks passed all five tests (`range-native-focused.log`).
Full TS/native runs on Node 24.15.0 each passed 730 tests, failed one and skipped
two. The only failure was the existing duplicate-key JSON timing guard: adjacent
ratios 3.555/1.567 in the first run and 3.935/1.810 in the repeat. Between them,
one isolated run passed with 2.078/1.910. The workload, runner, addon and thresholds
were unchanged. No further repeat was used to seek a passing full result.

This is an unresolved full-suite performance failure, not a verified harmless
fluctuation or commercial PASS. The second full run took 50.141 seconds; P3B
completed in 24.376 seconds with qualification=false. Evidence:
`target/range-native-build.log`, `range-npm-first.log`, `range-timing-isolated.log`
and `range-npm-final.log`. Keep this gate open while filling remaining functions;
investigate and repair it before activation/qualification, without weakening the
frozen guard. The parser implementation was not modified in this checkpoint.

The next functional integration is specified in
[the complete dispatcher and production integration plan](kernel-candidate-dispatch-plan.md):
the complete 28-command candidate dispatcher,
batch ownership and public failure/effect/affected/resource accounting. Range
selection still materializes traversal lists and has repeated scans; complete
work/allocation accounting and error classification remain activation gates.
Raw transformation error packaging must be integrated without forcing empty IDs
through StableId. S2 versioned extensions/session composition, public candidate
activation, the Rust default switch and commercial qualification remain open.

### S1.14 — native admission, complete dispatch and combined session history

The existing native Stage 3, Stage 4 and captured command replay now use one
admission seam. Conversion consumes the decoded command without a JSON roundtrip;
raw empty/duplicate component identities stay representable until final semantic
assessment. Eligibility preserves the normal typed path and promotes once when
live-store identity or measure-coverage constraints cannot represent the input.
The frozen typed prefix retains its operations, interned strings, affected order
and cumulative budget. All 27 leaf commands execute after promotion.

Command preparation preserves target/owner/anchor and transform error precedence,
effective Staff no-op, Measure duplicate-definition diagnostics, deferred coverage
and Range affected order. Batch captures decode one child at a time, attributes
the first child failure precisely, and publishes only after whole-transaction
preparation. A shared ledger retains the existing effect/affected/byte limits,
ID/text interning, both history directions, opaque payloads and segment weights.
Candidate charging follows the typed primitive/affected order, including failures
at an intermediate byte boundary. Prepared effect limits precede effect errors
without overriding earlier no-op/reference/anchor/transform results.

Prepared Typed/Candidate values converge at one runtime publication boundary.
Stored combined history replays typed prefixes and candidate suffixes against
strong Store boundaries; it does not re-run command preparation. Explicit changed
facts preserve net-zero commits. Checkpoint bytes, retry, event reservation,
version/dirty projection, redo truncation and partial command replay retain their
existing semantics. Final assessment counts actual checks and traversal; physical
allocation failures remain distinct from declared logical resource limits.

Independent GPT-6 reviews covered codecs/session routing, runtime/history
publication, effect-limit precedence and shared accounting. Repairs included
retaining completed final-assessment work when later history preparation fails,
checking growth against expected coverage before allocation, preserving effect
versus budget precedence, and interleaving affected/primitive byte charges.
The publication regression injects history sequence exhaustion after successful
candidate preparation and checks exact unchanged document/history/dirty/version,
checkpoint and committed metrics, with redo still usable.

The predecessor RKP-3 source-location guard assigned Batch coordination to a
Session-local helper. S1.14 moves that private responsibility into runtime so
typed and occurrence transactions share one owner. The guard is an editable
successor implementation check, not one of the frozen oracle manifest/scenario/
qualification files. It is updated to check the actual unified admission path,
ordered child decoding and single final preparation/publication; the 28-command
catalog, handler isolation and native behavioral expectations remain unchanged.
No compatibility shim, dead helper or comment exists merely to satisfy its regex.

Verification: 490 Rust tests passed, one ignored; TypeScript build, strict clippy
and Rust 1.88.0 all-target check passed. The new native corpus covers 27 distinct
leaf commands and one retained-prefix/Part-deletion scenario, each comparing TS
submit/Undo/Redo, complete read DTO, history/dirty, affected entities and all events.
The legal CVN-4 fixture is outside the minimal feature profile; its support result
is checked against the actual TS profile assessor rather than assumed supported.

The first full run on the rebuilt release addon passed 758, failed the historical
source guard described above and skipped two. JSON timing ratios passed in that
run (unique 2.206/1.940; duplicate 2.019/1.983). P3B completed in 23.956 seconds,
peak RSS 1,712,447,488 bytes, qualification=false. Earlier S1.13 timing failures
remain unresolved; this pass does not diagnose them or establish qualification.
The functional native route is enabled on this private branch to complete S1;
performance gates continue to block product cutover and commercial qualification.
Evidence: `target/admission-rust.log`, `admission-clippy.log`,
`admission-msrv.log`, `admission-native-dispatch.log`, `admission-npm-full.log`.

After the source guard repair, the final full run passed 759 tests, failed zero
and skipped two in 49.679 seconds. All 112 compiled test files were covered;
manifest SHA-256:
`5e29ec3d6c604f2311c95101861277d614b2b4a08a6627f35451bbb403c22688`.
The same release addon was used for both full runs, SHA-256:
`77aa3144a332327ec381087e212935221744ca2d3562d3590f0b33da8396d82d`.
Final JSON adjacent ratios: unique 1.964/2.122, duplicate 2.064/2.072.
P3B wall time was 23.748 seconds, workload 23.415 seconds and peak RSS
1,758,158,848 bytes, qualification=false. Evidence: `target/admission-npm-final.log`
and `admission-release.log`. Fmt and `git diff --check` also passed.

S2 implementation follows [the extension/session plan](kernel-extension-completion-plan.md).
Extension execution/composition, full-kernel functional completion, Rust product
default and commercial qualification remain open.

### S2.1a — strict requirement data and TS wire compatibility

The internal extension descriptor/requirement validator now applies the actual
registry ID grammar to namespace, module and contribution: 1–128 ASCII units,
lowercase letters/digits with single internal dot/hyphen separators. It accepts
legal hyphenated IDs and rejects leading/trailing/adjacent separators. Schema
lists are nonempty, limited to 256, strictly increasing and positive JS safe
integers. Internal unsupported-protocol-version precedence is retained.

`decode_extension_runtime_requirement_v1` accepts captured lossless data with
exactly the six existing TS fields and `requiredForWrite: true`. It explicitly
maps external `requirementVersion` to the existing internal `protocolVersion`
field; old serde layout and public JS exports remain unchanged. Numbers reuse
the shared JS Number/SafeInteger conversion, including exponent spellings and
rounding. This decoder grants no catalog identity, callback binding or capability.

An explicit generator called the existing TS requirement decoder for 144 cases
(24 accepted, 120 rejected). Both TS and Rust compare the fixed complete results;
tests do not rewrite the fixture. Cases cover all three ID fields, exact shape,
wrong protocol field, strict boolean, UTF-16/surrogate rejection, version array
limits/order and raw number spellings including overflow, underflow and rounding.
Fixture SHA-256:
`8a77ee7859c85248a552b2a62eab16437d5ca0736d9b35c0790a9f0f725735b3`.

Verification: full Rust workspace 493 passed, one ignored; strict clippy,
Rust 1.88.0 all-target check, TypeScript build and the new TS oracle test passed.
Independent bounded GPT-6 review found no remaining defect in these data paths.
Evidence: `target/extension-requirement-workspace.log`,
`extension-requirement-clippy.log`, `extension-requirement-msrv.log`,
`extension-requirement-ts-build.log`, `extension-requirement-ts.log`.
The last full native regression remains S1.14's 759/0/2 on its recorded release
artifact; this new decoder is not yet connected to an integrated native session.

Catalog compilation, Inventory/availability and session assembly are the next
S2.1 work. The reviewed private bridge direction is documented in the S2 plan:
real SDK bindings and a WASM implementation share one executor interface and
one Rust transaction/history owner. Neither that bridge nor S2 execution is
implemented by this prerequisite slice. Full functionality remains incomplete.

### S2.1b — authenticated host metadata, inventory and availability groundwork

Checkpoint 960bda9 preserves the former 18-file working set. Merge 527534c brings
master's clean TS build and repository-local P3B scratch directory into this
branch. Master itself remains at the repository-consolidation commit eceec9f.

The internal SDK capture authenticates through the actual compiled catalog's
WeakMap, caches by genuine catalog identity and returns detached frozen metadata.
Copied branding, JSON identity claims, proxies and hostile patched primordials
do not grant authority. This projection contains owner/requirement data only;
it does not carry executable command/effect bindings.

Rust strictly decodes that projection, checks owner/namespace parity and preserves
omitted versus explicit-invalid inventory. Canonical inventory resolution reuses
identity only within the same HostCatalog instance. The actual SDK boundary of
64 modules includes two reserved Core modules: at most 62 Domain module owners
are accepted, and an individual Domain contribution cannot have zero requirements.
An empty Core-only catalog remains legal. Requirements remain bounded by 1024.

Availability reads real Store extension headers without reading payloads or
materializing the full document. Unknown namespaces do not manufacture missing
plugin facts; known incompatible schema wins before known missing contribution.
Facts retain TS sorting, UTF-16 identity and the 131072 fact cap. A broken Store
header read fails explicitly, preserving measured traversal and committed state.
The session read helper does not yet bind an integrated assembly or enforce a
write/history guard. Those are the next executable integration work.

Physical allocation failures propagate as Capacity rather than invalid input;
the existing public Option requirement decoder remains compatible. Local fault
injection covers both requirement reservations through host and inventory paths,
including cached inventory and recovery after failure. Availability result output
uses the existing bounded writer and preserves distinct logical-limit versus
internal-capacity failure behavior.

The fixed assembly corpus has 32 cases generated through the real TS SDK,
catalog, inventory and availability implementations. TS authenticates/captures
the catalog; Rust consumes the actual captured projection and compares complete
inventory/availability results and cache identity. This does not claim full
Catalog compilation failure-union or callback execution parity. Fixture SHA-256:
`4ca74f83ee8ad01b5aa474f888c9c2a151cfce7a4b23217452e3c9942fb5e13d`.

Fresh verification on code commit 527534c: Rust workspace 506 passed, zero
failed, one ignored; fmt, strict clippy and Rust 1.88.0 all-target check passed.
The rebuilt release addon passed the full TS/native suite: 768 passed, zero
failed, two skipped in 62.728 seconds. No frozen workload or threshold changed.
Logs are kept outside build caches in `.local-evidence/kernel-assembly-2026-09-12/`;
commit, counts, artifact hashes and log hashes are recorded in
`docs/evidence/kernel-assembly-2026-09-12.json`. This regression pass does not
resolve the historical timing-failure cause or establish commercial qualification.

At the S2.1b checkpoint, the next slice was a real SDK-to-Native integrated command journey: one module
command prepares Core pitch plus extension changes; Rust validates and adopts
once; no-op/rejection, ownership failure, Undo/Redo and events are compared with
TS. A separate private bridge preserves existing public exports and the old
five-entry addon. It must not create a second mutable document or history owner.
Module relation maintenance and two-layer plugin dependency behavior remain
explicit acceptance work, not capabilities inferred from metadata support.

### S2.2a — real SDK module commands through a private Native Rust session

Implementation commit `5d5b6eb` connects the existing public integrated factory,
real SDK bindings, gateway and replay to an opt-in V2 addon. Both Score-owned and
Part-owned commands prepare pitch and extension effects in the existing Rust
overlay and retain one stored history entry, affected set and event origin.
Callback errors, final validation failures, authority failures and history
reassessment rejection preserve document/history/version/events. See
[the implementation boundary](kernel-native-integrated-v2.md) for remaining scope.

Fresh validation: 508 Rust tests passed, zero failed, one ignored; all-feature
strict clippy, fmt and Rust 1.88.0 all-target/all-feature check passed. Both native
release artifacts were rebuilt. Full TS/native regression passed 782 tests,
zero failed, two skipped in 50.033 seconds; the focused real-SDK Native suite
passed 14 tests. The first full run's single source-contract failure was the
intentional new Cargo feature missing from the exact allowlist. That check now
allows exactly the private V2 feature while retaining defaults, pins and dependency
edges. Real addon tests verify V1 still has five exports and V2 adds exactly one.
No frozen behavior oracle or timing threshold was relaxed.

Evidence and hashes: `docs/evidence/kernel-integrated-native-2026-09-12.json`;
logs: `.local-evidence/kernel-integrated-native-2026-09-12/`, including the first
failed run. These results close the module-command journey, not S2, S3 or
commercial qualification. Standalone Core/Batch composition and candidate history
assessment in the new session remain next, followed by WASM, migration and real
layered-plugin relationship consumers. Master remains `eceec9f` and unchanged.

### S2.2b — Core admission and candidate history in the integrated Native session

The V2 session now uses the original 27 Core leaf handlers and pure-Core Batch
admission, with module assessment and response preflight before the original
commit. Core and module submissions share the Rust Store and history. Candidate
undo/redo previews stored operations through the structural boundary before
module assessment; rejection leaves the cursor unchanged. Core Batch retains
operation-fact commits even for a net-zero final document.

The independent command admission corpus is compared through the real SDK/native
factory, including successful history, complete reads and events. A temporary
raw-ID candidate with a typed prefix covers net-zero history and module rejection
followed by retry. This exposed and fixed nested overlay projection skipping new
events/notes when ancestor orders were untouched.

Cross-domain Batch containing module children remains next. WASM, migration,
layered-plugin relationship consumers and commercial qualification remain open.
Compatibility assessment currently replays and fully projects stored operations;
no incremental-cost or performance qualification claim is made for this path.

Implementation `febe3c6`: 509 Rust tests passed, 1 ignored; 785 TS/native tests
passed, 2 skipped, zero failed. The 17 focused Native tests include 504 admission
inputs across 28 Core command families. Strict all-feature Clippy, fmt and Rust
1.88 checks passed. The source route guard was updated for the extracted prepare
method while retaining the no-commit-during-prepare and one-commit-after-prepare
checks. No behavioral fixture or timing threshold changed. Evidence:
`docs/evidence/kernel-integrated-core-2026-09-12.json`.

### Mixed Batch prerequisite — actual occurrence SDK views

Implementation `d8b39c5` adds a detached document projector over actual occurrence
locators. It preserves duplicate/empty raw IDs, temporarily invalid musical
fields, typed-prefix edits and candidate suffix changes. Reading does not prove
semantic validity. V2 candidate history now uses this projector and still checks
the final candidate before returning the preview.

Six new tests cover distinct duplicate nodes, detached-view mutation, opaque
UTF-16/negative-zero values, deleted Part extension lifetimes, failed reservations
and inconsistent fields. The existing multi-error assessment test compares the
complete raw projection too. Fresh validation is 320 runtime tests passed,
1 ignored; 17 real integrated Native tests passed; strict Clippy, fmt, Rust 1.88
and the V2 release build passed. The previous full workspace/TS counts are not
claimed as freshly rerun here. Evidence:
`docs/evidence/kernel-candidate-sdk-view-2026-09-12.json`.

Mixed Batch remains incomplete: candidate history must first retain immutable
module extension effects and their owner lifetimes, then module children must be
wired into ordered dispatch with shared budgets and final assessment. No S2 or
commercial qualification milestone is closed by this prerequisite.

### Mixed Batch prerequisite — immutable extension history

Implementation `457d90e` records candidate extension insert/replace/remove with
immutable before/after images and occurrence owner lifetimes. A lazy ledger uses
recorded data, never arbitrary candidate payloads as expected history. Real Store
adoption and repeated replay tests cover net-zero edits, interleaved owned blocks,
Part death/rebirth, effect caps, reservation failures and payload/owner corruption.
Two existing dangling-owner roundtrips now also exercise the new ledger.

Fresh all-feature workspace validation: 525 passed, 1 ignored, zero failed. Focused
dangling tests, strict Clippy, fmt and Rust 1.88 checks passed after the final test
and annotation changes. No new Native/TS run; the V2 artifact is still d8b39c5.
Evidence: `docs/evidence/kernel-candidate-extension-history-2026-09-12.json`.
Module child dispatch, shared accounting and public mixed Batch remain to be wired;
this prerequisite does not close S2 or commercial qualification.

### S2.2c — real SDK mixed Core/module Batch

Implementation `3559713` wires module children into one occurrence candidate from
the start of a mixed Batch. Core handlers are reused; standalone and Batch module
commands share SDK preparation/transform decoding. The recorder owns the actual
pitch/extension effects, immutable inverse/forward and owner lifetimes. Module
segments retain source identity and share effect, affected and logical-byte
accounts with Core. No-op children create no segment; a nonempty effective
sequence with net-zero document change still commits one Batch history entry.

Real Native coverage is 23 tests, including 504 original Core admission inputs
and the same 504 inputs after a genuine module child. Additional journeys verify
invalid intermediate SDK reads repaired by later Core, both owner kinds, Part
death/rebirth, extension removal order, no-op, net-zero history and exact atomic
failures. Three Rust execution tests cover shared caps and source/affected charges.
Fresh checks: 528 Rust tests passed, 1 ignored; 791 TS/Native passed, 2 skipped,
zero failed; strict Clippy, fmt, Rust 1.88, typecheck and both native release builds
passed. An initial full run failed only the existing V1 JSON timing-ratio check
(4.008); the same binary passed isolation and an unmodified complete rerun. Both
attempts are retained in `docs/evidence/kernel-native-mixed-batch-2026-09-12.json`.

Mixed Batch wiring is complete; S2 is not. WASM execution, explicit migration,
layered relationship consumers, declared-read/incremental equivalence and full
platform/resource/performance qualification remain. Complete projections and
repeated compatibility validation are known costs, not qualified incremental work.

### S2.4a — detached explicit extension migration

Implementation `61f28cc` connects the existing public migration function to a
separate private Native V2 function. Rust rechecks initial semantics, catalog,
effect ownership, source/target versions and final Core state; the shared typed
transaction prepares the replacement without adopting into any existing session.
The authentic SDK helpers prepare payloads and validate compatible contributions;
the facade retains arbitrary-input capture/shape decoding and report presentation.
No command preparation, classifier, history entry or event is introduced.

Eight real Native tests cover both owner kinds, explicit upgrade/downgrade,
idempotence without callbacks, failure precedence and reports, other compatible
plugins, JSON primordial replacement, forged returned schema, malformed private
document failure shape, backend selection isolation and untouched existing state.
Migration reproduces the existing JSON-roundtrip normalization of negative zero;
not-required and normal editing continue to preserve it.

Fresh full checks: 528 Rust passed, 1 ignored; 799 TS/Native passed, 2 skipped,
zero failed. Both release artifacts, strict Clippy, fmt, Rust 1.88 and typecheck
passed. The private V2 export set explicitly grows from six to seven functions;
the V1 five-export and public 51/8/34/9 sets stay frozen. Evidence:
`docs/evidence/kernel-native-extension-migration-2026-09-12.json`.
S2 still needs concrete layered consumers, WASM, declared-read/incremental
equivalence and complete resource/platform/performance qualification.

### S2.4b — concrete layered relationships and scoped Batch authorization

`a7493f8` supplies an authentic SDK consumer with Part-owned note indices and a
Score-owned summary that reads those indices. An independent validator checks
Core references and pitches field by field. Five TS/Native tests prove ordered
repair, atomic rejection of stale layers, removal and owner death/rebirth,
history without re-preparation, checkpoint/branch/replay, clear/rebuild and
known-missing read-only reopening. Both namespaces belong to one contribution;
this does not implement cross-plugin reads or automatic dependency scheduling.

A live reproduction also found a scoped-gateway bypass: a foreign module
command was denied alone but committed inside Core Batch. `09fb674` applies
the existing module identity/capability check to every executable module child
before preparation and dispatches the detached authorized Batch. Four tests
cover zero-callback rejection, authorized mixed composition, trusted-host
cross-module composition, Proxy input stability and malformed/nested batches.

Fresh final TS/Native: 808 passed, 2 skipped, zero failed; focused tests 22 passed,
typecheck/build and diff check passed. Rust source is unchanged; native artifacts
and 528 passed/1 ignored Rust evidence are inherited from `61f28cc`, not rerun.
Evidence: `docs/evidence/kernel-native-layered-relationships-2026-09-12.json`.
Remaining: cross-plugin read/dependency contracts, WASM execution, declared-read
equivalence and resource/platform/performance qualification before default cutover.

### Gateway capture follow-up — stable authorization and execution identity

`0c397fc` closes three reproduced dynamic-input authorization bypasses after the
static Batch repair: Core-to-foreign replacement, retry after failed capture and
invalid-to-Batch replacement. All successful dispatches now use authorized,
detached input; failed strict capture ends at `registry.invalid-invocation`.
The 504 Core admission shapes match direct results/state through all three gateway
configurations (1,512 comparisons). Final TS/Native: 813 passed, 2 skipped, zero
failed; focused 22 passed and build/diff checks passed. No Rust source or artifact
changes and no repeat Cargo run. Full details and the explicit tightened gateway
failure boundary are recorded in `kernel-native-integrated-v2.md` and
`evidence/kernel-gateway-capture-2026-09-12.json`. Remaining S2/S3 requirements
above are unchanged; this is a prerequisite isolation repair, not qualification.

### S2.3a — bounded Wasm service using the existing execution seam

`04374dd` adds an opt-in session-layer Wasm executor with SHA-256 capture,
versioned exact ABI, import exclusion, fresh per-call instances and fuel,
memory/table/stack/buffer bounds. Seven-crate direction and default Node exports
remain unchanged; the normal Node dependency graph excludes the new executor.
Ten actual Wasm tests include an SDK-derived real session commit/history journey
and zero-adoption failure after an effective Batch prefix. The guest is explicitly
a protocol fixture, not a full business validator or SDK-to-Wasm compiler.

Fresh checks: Rust 538 passed/1 ignored; TS/Native 813 passed/2 skipped, zero failed;
strict Clippy, fmt, Rust 1.88 all targets/features and both release artifacts pass.
ABI/policy: `docs/kernel-wasm-executor-v1.md`. Evidence:
`docs/evidence/kernel-wasm-service-2026-09-12.json`.

Next implement authentic module-scoped artifact binding and host dispatch. The
existing aggregate callback seam must not let one untrusted guest assess other
modules. Public SDK/Node binding, ownership/lifetime/reentry tests, cross-plugin
read dependencies and full platform/resource/performance qualification remain.

### S2.3b — authentic contribution-scoped Wasm binding

`6feef80` completes the private host binding: a fully captured artifact roster
maps immutable compiled guests to authentic catalog contribution identities.
The six individual callbacks dispatch through that fixed binding in editing and
detached migration; unbound SDK callbacks remain compatible. Core semantics,
permissions, availability and aggregate assessment remain host-owned. The
Node-dependent installer lives outside pure Core in `src/native-host`.

An actual Rust-compiled dynamic guest proves two module identities, mixed
JS/Wasm validation, edits, atomic Batch rollback, migration, stored history,
replay/checkpoints, reentry, malformed/foreign output rejection and lifetime
after caller byte mutation or selector restoration. The earlier canned guest
remains explicitly limited to its protocol-seam tests. UTF-8 output decoding is
strict; guest codec support is not equated to arbitrary JS value compatibility.

Fresh final results: Rust 538 passed/1 ignored, TS/Native 822 passed/2 skipped,
zero failed; focused 12 passed, strict Clippy/fmt/MSRV and all three release
builds passed. The first full run caught host Node dependencies inside Core;
moving the installer outside Core fixed it without relaxing the boundary test.
Evidence: `docs/evidence/kernel-wasm-binding-2026-09-12.json`.

The private binding function is complete. Cross-plugin read/dependency
contracts, complete resource accounting and platform/performance qualification
remain required before commercial readiness/default product cutover. Public
plugin packaging/authoring tools are not silently added to the microkernel.

### Explicit cross-plugin reads — current task closed, execution paused

`ee4ff7f` adds startup read declarations against authentic reader/provider
identities. A derived catalog has independent immutable grants; the existing
catalog/session is unchanged. Granted blocks are copied from the current
candidate into a separate frozen dependency view. Own extension views and all
write/gateway permissions retain their boundaries. Incompatible provider data
keeps editing read-only and blocks dependent migration before callbacks.

The two actual SDK plugins own Part indices and a Score summary separately.
Tests prove current-candidate reads, independent final validation, wrong-order
and partial-repair rollback, foreign write rejection, gateway isolation, owner
death/rebirth, stored history/replay, actual migration, version gating and
reciprocal reads without recursive execution. A compiled Wasm guest reads an
authorized Part block after an earlier Batch child changes it and fails without
the grant. Contract: `docs/kernel-contribution-reads-v1.md`.

Fresh final TS/Native: **830 passed, 2 skipped, zero failed (832 total)**; build
including strict tsc and diff check pass. Guest source builds on Rust 1.88 and
reproduces byte-identically. Host Rust code is unchanged: **538 passed/1 ignored**,
Clippy/MSRV and all three native artifact results are inherited from `6feef80`,
not rerun this slice. Evidence: `docs/evidence/kernel-contribution-reads-2026-09-12.json`.

Remaining work: automatically constructing a safe degraded assembly when a
provider is missing (currently startup read binding rejects), precise dependency
closure/equivalence, whole-transaction resource accounting, platform/performance
qualification, reversible Rust default cutover and final obsolete-engine
cleanup. Techniques/repeats remain plugin responsibilities. No next slice starts
after this closeout without the owner's renewed instruction.
