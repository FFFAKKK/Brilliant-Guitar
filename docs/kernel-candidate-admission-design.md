# Candidate admission implementation plan

Status: planned, not implemented. This is the next S1 compatibility slice in
[commercial kernel completion](kernel-commercial-completion.md), reviewed by
the read-only GPT-6 planning agent and selected by the main implementer.
Public qualification and the Rust default switch remain blocked on completion
of the implementation and its behavioral evidence, not on additional approval.

## Problem and constraints

The private runtime's overlay keys entity state globally by `StableId` and
measure contents by `(Part ID, measure ID)`. These are valid live-store
invariants, but cannot represent all transient candidates admitted by the
existing 28-command API. TS can insert repeated or empty component IDs and
repeated/unknown measure contents, then either report final semantic errors or
let subsequent batch children repair the candidate. Premature HashMap
deduplication loses ordered diagnostics and changes target/anchor resolution.

Six native differential probes are recorded in the completion ledger. The
special early existing-measure duplicate rule is repaired separately; it must
not be generalized into an early check for every component duplicate.

Keep exactly seven crates, unchanged wire schemas/exports, one commit owner,
atomic rejection, bounded resources, deterministic replay and stored history.
Do not weaken `StableId`, live slot uniqueness or ordinary local-edit work scope.

## Selected representation

Keep the existing typed overlay for representable candidates. Before the first
unrepresentable operation, enter a transaction-private candidate representation
that preserves the existing transaction prefix and ordered node occurrences.
Unchanged records borrow the base/current overlay; changed containers and new
components are captured locally. Avoid whole-document export/materialization.

Use internal occurrence tokens for candidate nodes, separate from raw score ID
strings. A private arena index is sufficient; array position alone is not a
stable identity across moves. Part measure contents stay an ordered list even
when multiple entries have the same measure ID. These tokens never enter the
public API, persisted score, extension identifiers or live store.

Candidate target lookup is by `(kind, raw ID)`: zero matches means target-not-found,
one resolves, and multiple means internal-error. Semantic ID uniqueness remains
global across kinds. Thus cross-kind duplicates may have unambiguous typed
targets. Owner-local anchor resolution precedes global fallback; distinguish
missing, wrong owner and ambiguous occurrences exactly as the reference resolver.

The implementation must share command preparation semantics. Do not create a
second complete JSON command engine or return internal-error merely because a
later command is unimplemented in candidate mode. Keep incomplete integration
private until the covered command/candidate combinations have full closure.

Only a valid final candidate can lower to the strong typed adoption plan.
Retain original child boundaries, command identity, affected entities and
ordered forward/inverse semantics. Net-zero document changes are not automatically
no-op: inserting a bad subtree and removing its unique parent may still create
a committed batch, version/history changes and events in the reference runtime.
Stored undo/redo must never replay an invalid intermediate state into live storage.

## Codec boundaries

The same logical field has intentionally different admission rules by entrypoint.
The implementation must test this matrix before routing raw candidates:

| Field or entrypoint | Empty string rule |
| --- | --- |
| All command targets; range endpoint IDs | Invalid envelope |
| Direct voice insert-event: Event/Note ID, optional staff ID, after-event anchor | Invalid envelope |
| Nested Part/Staff/Voice/measure components: IDs and staff/measure references | Shape-valid; defer to preparation/final semantics |
| Part/Staff/Voice/measure insert/move after-X anchor | Shape-valid; resolve anchor |
| voice.insert payload measureId | Shape-valid; resolve target |
| voice.set-default-staff and explicit event staff assignment | Shape-valid; final membership/no-op rules |

Measure-insert contents and each entry's voices require nonempty arrays at
decode. Part component arrays have different rules. Batch retains per-child
decode/preparation precedence; no new global batch deduplication pass.

Foundation owns shape-checked score component admission views/captured data,
building on its existing borrowing candidate cursor without cloning a second
complete Raw DTO tree. Kernel Contracts owns command-specific raw anchors,
references and direct-versus-nested decode policies. Keep Foundation independent
of command IDs/failures. Existing validated typed DTOs remain the adoption
boundary; conversion to them is explicit and fallible after final validation.

## Implementation and evidence order

1. Pin the field/entrypoint matrix against the independent TS decoder/runtime,
   including direct-versus-nested empty Event/Note IDs and empty target-versus-anchor.
2. Implement candidate occurrence storage, borrowed reads and target/anchor
   resolution. Test ordered duplicate paths, owner moves and ambiguity first.
3. Close one real path: abnormal Part/Staff insertion, later commands, full final
   report or valid adoption. Preserve earlier typed overlay operations on both
   success and rejection.
4. Extend to measure contents and all remaining commands, then history/replay.
   An incomplete candidate path cannot be a public default.
5. Differentially verify final documents, exact diagnostics, child failure index,
   affected/events/history/dirty behavior and honest work/resource accounting.
   Ordinary Note/Staff scalar edits must never materialize the candidate tree.

Required adversarial cases include:

- Duplicate inserted before an existing node reports the later old occurrence.
- Same-kind duplicate target fails ambiguously; cross-kind duplicate targets
  remain resolvable by kind.
- Removing a duplicate by its ambiguous ID fails, but deleting its unique new
  parent can repair the candidate. Empty target IDs remain envelope failures.
- Owner-local unique anchors succeed despite duplicates elsewhere; local/global
  missing and ambiguous anchors retain their distinct failures.
- Missing, unknown and repeated measure contents preserve input order and all
  report details; deleting their parent can repair the final candidate.
- A valid prefix followed by an invalid candidate rejects with no live delta;
  a repaired candidate retains the prefix and exact committed batch behavior.
- Net-zero repaired batches, persisted undo positions, redo branches, stored
  inverse/forward effects and replay match the reference runtime.

Source anchors for this decision: `overlay.rs`'s `TransactionOverlayV1`,
`target-resolver.ts`'s `uniqueMatch` and `resolveOwnerLocalAnchor`,
`score-component-codec.ts`, the hierarchy/measure/core command adapters,
Foundation `candidate.rs`, and Contracts `codec.rs` payload definitions.
