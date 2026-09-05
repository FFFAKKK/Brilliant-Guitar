# Candidate admission implementation plan

Status: command input representation/codec implemented; occurrence storage and
read/resolution prototype verified against the real Store/overlay under
`cfg(test)`. Candidate command execution and adoption are not activated. This is
the next S1 compatibility slice in
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
Staff/Voice global fallback requires a unique match; Event sequence fallback
only asks whether an Event exists elsewhere, so multiple remote matches still
mean wrong-owner. Move target failure precedes self-reference, and self-reference
must not be applied to insertion. Voice ownership compares content occurrences,
including when the requested anchor is start.

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

Foundation owns shared score component definitions and admission ID types.
Kernel Contracts owns command-specific raw anchors,
references and direct-versus-nested decode policies. Keep Foundation independent
of command IDs/failures. Existing strong-ID DTOs remain the adoption
boundary; conversion to them is explicit and fallible after final validation.

### Implemented codec representation refinement

The command input layer shares the nine component definitions through an
`Id = StableId` parameter. Admission instances use `String`; default instances
remain the existing nonempty-ID DTOs. References propagate the same parameter
through Voice defaults, Event assignments and Part measure contents. This
preserves empty/duplicate values and ordered arrays without maintaining a second
Raw DTO tree or converting Runtime operations into JSON walkers. Owned new
payloads may enter the candidate arena; this does not authorize cloning a base
Part or whole document during an ordinary edit.

Contracts shares one parameterized command decoder with typed and admission
entry points. Command targets, ranges, direct Event/Note payloads and direct
event anchors retain their nonempty types. Admission batch children remain
captured until their execution position, with distinct top-level replay and
nested-batch rules. Native submit still selects the typed entry point until
candidate execution is complete.

Serde alone does not prove exact shape. Present optional fields explicitly
reject null. Rhythmic content uses a strict empty-struct rest decoder because
serde's tagged unit variant otherwise ignores unknown fields. Contracts also
checks exact start/none/inherit-default payload variants and clef line literals.
The independent TS corpus covers these boundaries and is not generated from
Rust outputs. Full public semantic assessment retains the borrowing JSON
CandidateNode: it must still inspect noninteger musical data that strict command
component types cannot represent.

### Next occurrence read layer

The GPT-6 code review found that the existing 12 CoreBaseRead capabilities are
sufficient for an initial implementation; no new Store query is required.
Candidate activation moves the current typed TransactionOverlay into a frozen
prefix, before the first unrepresentable child. It keeps prefix effects,
segments, affected entities and work accounting without finish/adopt/replay.
Only read counters may change afterward; all later writes belong to the candidate.

Prefix occurrences use stable entity addresses from that frozen overlay. New
occurrences use private arena indices, including distinct PartMeasureContent
nodes. Consume new payloads into the arena without retaining a duplicate tree.
An added `(kind, raw ID)` multimap combines with at most one prefix lookup and
filters hidden nodes. Hidden prefix parents also hide unexpanded descendants
through the owner chain. Copy a sibling order only on its first mutation; borrow
untouched order visits. Candidate reference changes merge with indexed prefix
referrers and filter removed sources.

A narrow mutable prefix adapter forwards overlay-aware scalar/owner/order/
reference queries so prior inserts, deletes, replacements and moves remain
visible. It must never resolve directly against Store when the prefix contains
an override. Do not implement CoreBaseRead for the occurrence candidate itself:
its StableId-only address model cannot represent ambiguous or empty IDs.

Initial tests must cover a changed prefix value/order, same-ID prefix rebuild,
hidden unexpanded descendants, duplicate Staff lookup, distinct repeated content
nodes and order-copy scope before wiring command mutation or adoption.

### Verified occurrence prototype

`crates/brilliant-kernel-runtime/src/candidate.rs` now owns a frozen typed prefix,
an arena for new Part subtrees, a kind-specific raw-ID multimap, independent
content occurrences, local child orders and hidden roots. New aggregate payloads
are consumed into records once. Borrowed order visits pass the current raw ID
alongside its occurrence; anchor lookup does not first collect a sibling array.
The first mutation copies just its visible prefix sibling order, and subsequent
mutations reuse it. Hidden ancestor checks also cover descendants never visited
before deletion. Staff-referrer queries combine the prefix index with new records
and exclude hidden sources. Candidate reference replacement is still pending.

Thirteen Rust tests exercise the prototype using the real Store and overlay:
changed prefix pitch/order/references; complete retained ChangeSet equality
(including inverse/effects/segments/budget); same-ID prefix rebuild; ambiguous and
cross-kind targets; empty IDs/references; repeated/unknown/empty measure links;
content identity and ownership; anchor precedence; parent deletion repair; and
failure/drop isolation. A guarded 4098-Staff store rejects aggregate detach,
cloning base order/time arrays and verifies bounded visitor short-circuiting,
zero sibling visits for an indexed scalar read and one order copy on first write.

The module is test-only until it supports the complete required command closure.
Its storage insert/move/hide methods are not command preparation or adoption.
Before enabling it, implement fallible allocation and combined resource accounting,
candidate scalar/reference writes, measure-linked deletion/coverage handling,
remaining component insertion, final ordered diagnostics and strong-ID lowering.
Retain the original command facts and history behavior during that integration.
Local order counters in these tests are not global-work qualification evidence.

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
