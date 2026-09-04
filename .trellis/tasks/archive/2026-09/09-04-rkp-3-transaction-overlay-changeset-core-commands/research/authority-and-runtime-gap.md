# RKP-3 Authority and Runtime Gap Audit

## 1. Live planning baseline

The planning worktree was created from accepted RKP-2 commit
`6d0956c970f4414cb61e0f3d7148672a6e635032` on branch
`codex/rkp-3-transaction-overlay-changeset-planning`. The source RKP-2
worktree was clean when inspected. This task is planning-only; `task.py start`
has not run and the TypeScript runtime remains the application default.

The live RKP-2 base supplies:

- one indexed `LiveScoreStore` with typed SlotMap handles;
- canonical import/export and a revision-zero `KernelRuntime`;
- entity, ownership, part/measure, voice-time, extension, and declared-reference
  indices;
- an opaque Node handle with create/read only;
- private structural metrics and independent index-rebuild evidence.

## 2. Binding authority

| Authority | Evidence | RKP-3 consequence |
|---|---|---|
| 28-command inventory | `src/core-kernel/commands/catalog.ts:1-69` | Rust catalog order and target kind must be exact; no dynamic registration. |
| Command DTO and failures | `src/core-kernel/commands/contracts.ts:27-387` | V1 target/anchor/payload shapes and failure precedence remain the semantic oracle. RKP-3 exposes only a stage-owned subset of the final result. |
| Existing effect behavior | `src/core-kernel/commands/effects.ts:57-220` | Ordered forward behavior and inverse observations are inputs, not a Rust storage design to copy. |
| Existing batch caps | `src/core-kernel/commands/batch-runtime.ts:20-22` and `src/core-kernel/commands/integrated-runtime.ts:103-104` | Keep 100 children, 131,072 prepared effects, and 131,072 affected addresses. |
| Accepted transaction law | `.trellis/spec/core-kernel/backend/command-transaction.md:54-70,72-107,296-300` | Target resolution, no-op, ordered batch visibility, lowest child failure, and zero-delta rejection are binding. |
| Rust migration architecture | `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md:380-404,505-544` | Handler receives a restricted view/builder; Runtime derives reverse-safe inverses and owns one commit plan. |
| Performance law | `.trellis/tasks/08-15-core-rust-runtime-performance-remediation/prd.md:33-45` and Architecture Reset V2 `:882-890` | Ordinary local submit must record zero full-document scans/clones/semantic validations/snapshot materializations. |
| Stage ownership | Architecture Reset V2 `:896-919` and parent implementation `:27-37` | RKP-3 owns overlay/ChangeSet/28 commands; RKP-4 owns history/snapshots/events/replay; RKP-5 owns incremental validation. |
| Frozen migration oracle | `test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl` and `.trellis/spec/core-kernel/backend/rust-runtime-transition.md:31-49` | Consume the immutable 28 accepted, 28 rejected, and two stage-relevant batch projections; do not rewrite the corpus. |

Where these sources differ in implementation shape, the newest accepted
Architecture Reset V2 stage model governs the Rust migration. TypeScript code
continues to govern observable command behavior until full differential
qualification and cutover.

## 3. Exact command partition

The catalog has exactly these ordered groups:

| Group | Commands | Count |
|---|---|---:|
| Scalar/local event | `core.document.set-metadata`, `core.note.set-written-pitch`, `core.event.set-note-value`, `core.voice.insert-notes-event`, `core.voice.insert-rest-event`, `core.event.remove` | 6 |
| Measure | `core.measure.insert`, `core.measure.remove`, `core.measure.move`, `core.measure.set-definition` | 4 |
| Part | `core.part.insert`, `core.part.remove`, `core.part.move`, `core.part.set-name`, `core.part.set-instrument` | 5 |
| Staff | `core.staff.insert`, `core.staff.remove`, `core.staff.move`, `core.staff.set-definition` | 4 |
| Voice/reference | `core.voice.insert`, `core.voice.remove`, `core.voice.move`, `core.voice.set-default-staff`, `core.voice.set-sequence-start`, `core.event.set-staff-assignment` | 6 |
| Range/batch | `core.range.delete`, `core.range.transpose-written-pitch`, `core.transaction.batch` | 3 |
| Total | exact catalog | 28 |

The current adapters are fixed and inspectable at:

- first six: `src/core-kernel/commands/core-command-adapters.ts:697-743`;
- measure: `src/core-kernel/commands/measure-command-adapters.ts:820-848`;
- hierarchy: `src/core-kernel/commands/hierarchy-command-adapters.ts:1444-1549`;
- range/batch: `src/core-kernel/commands/range-command-adapters.ts:424-445`.

## 4. Current Rust gap

### 4.1 Runtime

`crates/brilliant-kernel-runtime/src/runtime.rs:42-69` currently owns only a
`LiveScoreStore` and `DocumentVersionV1`. It can create and read, but has no
submit route, overlay, changes, version increment, or commit API.

`crates/brilliant-kernel-runtime/src/store.rs:56-68` owns all primary records,
topology, derived indices, and metrics. Query seams at `:291-360` already avoid
stable-ID scans, but the mutation surface does not yet exist.

The store representation is adequate for RKP-3:

- records are separate typed SlotMaps (`records.rs:11-80`);
- semantic order is explicit (`topology.rs:11-22`);
- indices are separate and typed (`indices.rs:34-76`);
- SlotMap, HashMap, HashSet, and Vec reservation paths already exist in the
  RKP-2 builder (`store.rs:490-560`).

The design must add a mutation protocol without reintroducing a retained
`ScoreDocumentV1` or deriving public order from hash/slot iteration.

### 4.2 Session and contracts

`crates/brilliant-kernel-session/src/session.rs` validates create and delegates
read only. There is no fixed command router or handler table.

`crates/brilliant-kernel-contracts/src/codec.rs` already provides strict JSON
capture with byte, depth, property, duplicate-member, exact-shape, and safe
integer enforcement. Its `canonical_field` inventory currently contains score
fields only, so command fields and exact command decode must be added without
weakening create decoding or failure precedence.

`DocumentVersionV1` exposes `initial()` and `get()` only at
`crates/brilliant-core-types/src/scalar.rs:111-120`. A checked increment bounded
by the JavaScript safe-integer maximum is therefore a real RKP-3 prerequisite;
it belongs in Core Types, not in an ad-hoc Runtime integer.

### 4.3 Node and TypeScript bridge

The native crate exports exactly create/read at
`crates/brilliant-kernel-node/src/lib.rs:44-55`. The boundary:

- rejects poisoned session mutexes as `bridge.handle-poisoned`
  (`boundary.rs:468-479`);
- contains panics with `catch_unwind` (`boundary.rs:497-505`);
- caps requests/responses at 64 MiB.

The private TypeScript adapter
`src/core-kernel/native/rust-kernel-smoke.ts` likewise knows only create/read
and currently types every successful read as version zero. RKP-3 needs one
explicit evidence-only submit export and must generalize read version typing,
while preserving the opaque empty handle and TypeScript default runtime.

Adding a third native export is a successor-stage ABI extension. RKP-1/RKP-2
tests that assert exactly two exports must be changed to assert preservation of
their required create/read subset; the new RKP-3 workspace test becomes the
single authority for the exact three-export successor surface.

## 5. Oracle scope audit

The immutable JSONL corpus has 64 rows:

- rows 1-28: one accepted submit for each command ID, committed at version 1;
- rows 29-56: the corresponding command with a missing target, rejected with
  `command.target-not-found`, version 0, and unchanged final document;
- rows 57-64: cross-cutting lifecycle scenarios.

RKP-3 may claim only:

1. all 28 accepted submit/final-document/version projections;
2. all 28 missing-target failure/document/version projections;
3. the atomic-batch final-document projection;
4. the batch-child-rejection failure/document/version projection.

It may not claim history depths, dirty state, undo/redo, event stream, replay,
plugin/module composition, migration, or final support/classification equality.
Those fields can be parsed by the test harness only to select/validate the
fixture; they are not RKP-3 output evidence.

## 6. Resolved validation boundary

RKP-3 will not temporarily export, clone, or full-validate a complete document
inside submit. That tempting bridge would make the first implementation appear
closer to final TypeScript results, but it violates the parent performance law
and assigns RKP-5 work to RKP-3.

RKP-3 instead enforces:

- exact envelope and domain-shape decoding;
- target-kind and stable-ID lookup;
- anchor existence/owner/self rules;
- declared-reference type/owner/conflict rules;
- duplicate-ID prevention across live plus staged entities;
- range endpoint/owner/transform rules;
- local record/topology/index/time consistency;
- transaction resource limits and checked version increment.

RKP-3 does not enforce or claim:

- final whole-score semantic diagnostics;
- profile/support classification;
- extension/domain validators;
- affected-closure validation equivalence;
- final public `CommandResult`.

The stage-private submit seam is therefore deliberately ineligible for product
selection. RKP-5/RKP-7 must close this gap before any cutover proposal.

## 7. Risk ledger

| Risk | Failure mode | Required control |
|---|---|---|
| In-place partial adoption | a late expected error leaves records/indices split | All expected errors, reservations, and indices are resolved into a complete `CommitPlan` before first mutation; adoption has no `Result` branch. |
| Panic during adoption | partial state might exist after an impossible invariant bug | Mutex becomes poisoned; boundary returns `bridge.panic-contained`, every later access returns `bridge.handle-poisoned`; never convert this into a normal command rejection or reuse the session. |
| Full-store copy disguised as overlay | latency passes while memory/work stays global | Overlay stores only touched records/orders/index deltas; counters and source-contract tests forbid `ScoreDocumentV1` and full store/map clones. |
| Runtime handles leak into history | RKP-4 history becomes session-allocation dependent | Durable ChangeSet addresses use stable IDs and typed owners only; resolved handles live only in the ephemeral CommitPlan. |
| Batch child reads stale base | later child misses earlier changes | One overlay-aware view is shared for all children in order. |
| Inverse is derived from base | repeated writes or move/remove inverses are wrong | Derive each inverse immediately from overlay-aware current state, then stage forward; prepend/reverse inverse segment order. |
| Range command scans whole score | local edit violates complexity law | Resolve endpoints through entity/ownership indices and walk only selected topology; counters bound selected entities. |
| New cap narrows behavior silently | Rust rejects a TypeScript-accepted command | Freeze logical accounting, prove accepted input bounds against 256 MiB, keep failure private, and reopen planning if proof fails. |
| Successor ABI weakens old tests | adding submit silently drops create/read guarantees | Preserve old subset assertions and add exact RKP-3 three-export law. |
| Stage overclaims parity | private valid-fixture path is reported as product equivalence | Tests and evidence name only RKP-3 projections and explicitly mark RKP-4/RKP-5/RKP-7 false. |

## 8. Entry conclusion

The live base is sufficient to plan RKP-3, and no new third-party crate is
required. Implementation is non-trivial but bounded: one checked Core Types
primitive, strict command contracts, Runtime overlay/ChangeSet/commit support,
fixed Session handlers, a private Node submit seam, and successor-specific
tests. The planning gate is ready once `design.md`, `implement.md`, the literal
file/test matrix, and Trellis validation all pass; implementation remains a
separate owner approval.
