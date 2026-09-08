# Complete candidate command and production integration

This is the next functional closure after S1.13. The owner prioritizes complete
kernel behavior before commercial optimization and has authorized implementation,
independent GPT-6 review and local commits. No new authorization gate is needed.
This plan does not declare the kernel complete or qualified.

The 27 leaf commands now have the main occurrence storage/history primitives.
The remaining work must connect command preparation, command accounting and the
existing session/history transaction boundary. Do not create another JSON engine,
public native API, schema or parallel Store. Internal journal step counts are not
public effects. Reuse the seven-crate architecture and current frozen contracts.

## Command coverage to close

Recorder paths below are under `crates/brilliant-kernel-runtime/src/candidate/journal`.

| CoreCommandEnvelope variant | Existing primitive | Required preparation/integration |
| --- | --- | --- |
| DocumentSetMetadata | replace_scalar | Document target, equality, affected/effect |
| NoteSetWrittenPitch | replace_scalar | Unique Note target and decoded pitch |
| EventSetNoteValue | replace_scalar | Unique Event target and decoded note value |
| VoiceInsertNotesEvent | insert_event | Voice target, anchor, Notes type, strong-to-admission conversion |
| VoiceInsertRestEvent | insert_event | Voice target, anchor, Rest type, strong-to-admission conversion |
| EventRemove | remove_event | Dispatcher and Event/Voice/Note affected order |
| MeasureInsert | insert_measure_command | DuplicateDefinition diagnostic with insertion path |
| MeasureRemove | remove_measure_command | Effects/affected; minimum count is final semantics |
| MeasureMove | move_measure_command | Public effect count independent of journal replacements |
| MeasureSetDefinition | replace_scalar | Pickup None/Duration and exact field equality |
| PartInsert | insert_part | TS coverage check and global Measure order canonicalization |
| PartRemove | remove_part_command | Call command preparation, not bare remove_part |
| PartMove | move_child | Owner and Part anchor/affected |
| PartSetName | replace_scalar | Part target and exact equality |
| PartSetInstrument | replace_scalar | Part target and complete Instrument equality |
| StaffInsert | insert_staff | Part target, Staff anchor, raw admission |
| StaffRemove | remove_staff | Scoped references, affected, final minimum count |
| StaffMove | move_child | Target/owner/self/anchor precedence |
| StaffSetDefinition | replace_scalar | Preserve ID; lineCount/defaultClef only |
| VoiceInsert | insert_voice | Part/content locator and Voice anchor |
| VoiceRemove | remove_voice | Affected; final minimum count |
| VoiceMove | move_child | Raw Part/content owner ambiguity check before retained move |
| VoiceSetDefaultStaff | replace_reference | Raw reference preserved; existence is final semantics |
| VoiceSetSequenceStart | replace_scalar | Exact Fraction field equality |
| EventSetStaffAssignment | replace_reference | Effective Staff no-op before raw reference writer |
| RangeDelete | delete_range_command | Error mapping, effects/affected; no Measure normalization |
| RangeTransposeWrittenPitch | transpose_range_command | Raw Transform address; all-pitch-before-effect preflight |
| TransactionBatch | one Recorder for all children | Existing capture, 100 cap, no nesting, child attribution |

`EventSetStaffAssignment` must compare effective Staff IDs. Inherit and an
explicit assignment to the same Voice default are a no-op and preserve the
existing raw Option form. `PartInsert` must preserve the TS coverage/canonicalization
rules rather than equating the low-level subtree constructor with preparation.

## Existing production path to reuse

- `brilliant-kernel-node/src/boundary.rs` calls session submit bytes. Keep this API.
- `brilliant-kernel-session/src/session.rs` currently decodes strong commands,
  starts one typed transaction, branches for Batch, finishes and commits. Reuse
  its control flow with the existing admission submit/captured/replay codecs.
- `brilliant-kernel-session/src/commands/mod.rs` already groups local, Measure,
  hierarchy and range preparation. Avoid duplicating command decoding.
- `brilliant-kernel-runtime/src/runtime.rs` owns prepared transactions, final
  commit, Undo/Redo and event/dirty/version projection. Add only an internal
  prepared/history representation that can carry the retained combined history.
- `brilliant-kernel-runtime/src/history.rs` currently stores ChangeSetV1. Its
  internal payload must support candidate history without changing public history
  identity/cursor or serialization contracts.
- `candidate/journal/combined.rs` already prepares actual Store adoption and
  forward/inverse replay. Expose a narrow transaction/prepared facade after the
  full command contracts and failure accounting are wired. Do not expose raw
  Recorder or remove cfg(test) while dispatch is incomplete.

## Cross-command invariants

1. Ordinary command failures retain their code and precedence. Measure duplicate
   failures include the numeric insertion path. Range transform failures retain
   raw Note IDs. Final semantic failure belongs to the transaction, not the last
   Batch child. Existing shape/decode errors stay at the existing boundary.
2. Retain command changed/no-op facts, ordered affected entities with the correct
   deduplication scope, actual prepared effect count and Batch child index. Build
   segments from these facts instead of guessing from internal replay operations.
3. One successful Batch produces one version/history item and one final semantic
   assessment/adoption. History append, projection and Store commit share the
   existing atomic boundary. Reject/no-op must not truncate redo or change dirty
   state, versions, indices or observer events.
4. Enforce the existing request, response, effect/affected and logical retained
   history limits. Fallible allocation failure cannot masquerade as a declared
   byte cap. Track traversal and retained storage honestly; no workload/threshold
   reduction can substitute for qualification.
5. Do not materialize/export the whole Score for an ordinary local edit. Preserve
   typed-prefix borrowing and raw occurrence lifetimes through replay. Public
   identity and wire representation remain stable.

## Implementation ownership and delivery

Independent GPT-6 planning review identified three contracts to settle before
production wiring, rather than leaving them as integration follow-up:

1. Define a common owned prepared value containing command changed facts,
   effects/affected/segments, logical bytes, attempt metrics, the adoption plan
   and retained history. The current runtime infers no-op from an empty forward
   ChangeSet and extracts affected/bytes from that ChangeSet; candidate handling
   must use the explicit facts instead. Distinguish Typed and Candidate history
   replay internally. An effective net-zero commit still advances version/history.
2. Define the logical resource ledger before connecting prepared/history. Preserve
   the frozen weights, ID/string deduplication scopes, two-direction history,
   complete orders and opaque payload charging. Define cumulative Batch limit
   attribution and failure precedence. Do not estimate existing public caps from
   the new in-memory representation or defer this until after activation.
3. Checkpoint and command replay have different contracts. Checkpoints retain a
   document snapshot and schedule from committed logical bytes; command replay
   decodes captured commands again. Test candidate checkpoint-byte accumulation,
   retry after checkpoint creation failure without undoing an accepted commit,
   and consistent admission dispatch for submit, Batch children and replay.
   Replay rejection position and partially accepted results must stay compatible.
   No new checkpoint format or public API is required.

Parallel work can be divided into four bounded responsibilities, integrated by
the main session (only it runs Cargo/native tests and Git):

- Command dispatcher and remaining local preparation: all variants, target/owner/
  anchor rules, PartInsert and effective Staff no-op, unified private errors.
- Command facts: effects, affected ordering, command/Batch segments, resource ledger
  and focused TS comparisons; no independent storage interpreter.
- Runtime/history: a narrow prepared facade, candidate history payload, real Store
  adoption, Undo/Redo and atomic projection. Preserve the existing typed path.
- Session/native integration: admission codecs, existing Batch control and failure
  attribution, 28-command and mixed-Batch real native comparisons.

The delivery condition includes actual session -> runtime -> history -> Store
execution, not merely a private dispatcher test. Validate every command before
and after candidate entry, mixed valid/transient-invalid batches, no-op and failure
state, net-zero commits, full diagnostics and history/event identity. Keep staged
integration private until these conditions are proven; then activate the complete
candidate route in the existing private native kernel, without claiming the
application's Rust default switch or commercial release qualification.

S2 versioned extension/session composition and S3/S5 commercial qualification
remain separate incomplete requirements of the full goal.
