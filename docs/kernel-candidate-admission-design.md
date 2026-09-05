# Candidate admission implementation plan

Status: command input representation/codec implemented; occurrence storage,
reads, scalar/reference writes and Part/Staff/Voice/Event insertion verified under
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
and exclude hidden sources. The later write slice below adds replacement-aware
reads and owner-Part reference filtering.

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
command preparation over scalar/reference writes, measure-linked deletion/coverage handling,
remaining component insertion, final ordered diagnostics and strong-ID lowering.
Retain the original command facts and history behavior during that integration.
Local order counters in these tests are not global-work qualification evidence.

### Shared identity storage before resource enforcement

The next GPT-6 resource review identified representation amplification: cloning
an owned prefix address into every owner/order key also cloned its long ID.
Occurrence copies now share immutable prefix addresses through Arc, and prefix
content occurrences share the Part address from the visited owner order. New raw
IDs, staff references and content links share Arc strings through a local pool;
lookup keys share the same allocation. Added occurrence indices remain distinct.
This prototype slice did not change StableId or introduce an eager prefix/document
string pool. The later production owner-copy regression below justified changing
StableId's private storage as well.

Three additional tests verify shared allocation identity for a 64 KiB document
ID across 64 inserted Part owners, a 52 KiB Part ID across prefix contents, and
an 88 KiB repeated raw ID across records/index keys/references. Duplicate nodes
remain independent; hiding a parent does not remove retained nodes or ID strings.
Borrowed prefix reads leave the new-ID pool empty. This is a local representation
proof, not a complete memory bound: independently read prefix addresses and
temporary typed query conversions can still own string allocations.

Resource enforcement must preserve two distinct accounts:

- Compatibility logical bytes retain the existing ChangeSet fixed weights and
  UTF-8 string deduplication. Merge the prefix/suffix string accounting rather
  than adding independent intern budgets; do not charge prefix effects, affected
  addresses or segments again merely because candidate mode starts.
- Retained memory must include the simultaneously owned prefix, candidate records,
  shared ID storage, local orders/index entries, capacity growth and hidden nodes
  kept until transaction disposal. Shared strings do not eliminate node costs.

The existing accepted-wire logical upper bound does not establish the second
account. Derive the retained-memory envelope and use checked arithmetic/fallible
reservation before adding enforcement. Preserve the 64 MiB request and 256 MiB
ChangeSet logical limits; do not introduce an arbitrary lower candidate limit to
mask representation costs. Candidate activation remains gated on this work and
the command/validation/adoption closure described above.

### Fallible candidate collection growth

The prototype's retained write collections now use checked, fallible capacity
reservation: node arena, shared-ID pool, lookup kind/ID maps and duplicate buckets,
owned orders, order-entry vectors and hidden roots. Capacity failure terminates
the reservation state; later insert/move/hide writes fail before touching it.
An incomplete local order copy is discarded and cannot replace the current order.
The implementation restores the reservation state after a borrowed visitor even
when the visitor stops at a failed allocation. Move bounds are checked before
removing a child from the candidate order.

Fault injection runs the same insertion/parent-removal scenario with a failure
at each reservation request, covering all eight sites. It verifies the exact
frozen ChangeSet and live Store, plus terminal write behavior. Separate tests
exercise every partial order-copy reservation and real Vec/HashMap/HashSet
capacity-overflow errors without huge allocations. Reservation-attempt overflow
also fails without wrapping. Together with the earlier tests this is 19 candidate
tests, all still excluded from production routing.

Allocator/capacity failure remains internal-error, matching the existing commit
preparer; it is not reported as a fabricated logical-byte resource limit.
This protects candidate collection growth only. Arc/string construction, temporary
read results and base-query allocations retain their current Rust allocation
behavior. The cumulative logical ledger and a complete retained-memory envelope
are still required before activation; these tests do not prove recovery from
arbitrary process-wide OOM. Any future validation/lowering entry point must check
the terminal candidate reservation state before using partially prepared records.

### Production StableId clone sharing

A real typed-overlay insertion exposed the same amplification outside the
candidate prototype: a 64 KiB Part ID was copied into 258 separately allocated
owner IDs for 256 staves and two content owners. The allocation-identity regression
failed against String storage before the repair. StableId now holds private
Arc<str> storage, so those retained owner IDs share the original text buffer.
Its constructor still accepts impl Into<String>; nonempty validation, errors,
as_str, Debug, content-based equality/hash/order and manual JSON serialization
remain unchanged. No public field, layout/ABI promise or dependency was added.

Tests pin clone lifetime, independently constructed equal IDs, constructor input
types, thread transfer, exact Unicode/control-character JSON roundtrips and invalid
JSON rejection. A freshly rebuilt native addon is compared with the TS runtime
through long-ID batch editing, undo, rejection at an undo position, redo and replay.
The overlay regression checks unchanged live Part lookup/order through existing
read capabilities; it does not add a whole-document export to the transaction layer.

This removes text multiplication along clone chains in ordinary ownership and
history as well as candidate reads. It is not global interning: separately decoded
equal IDs can retain separate allocations. Initial String-to-Arc conversion still
allocates and briefly retains the source String; clone/drop incur atomic reference
counting. This representation proof is not latency/RSS qualification, an OOM
guarantee or a cumulative candidate budget. Those accounts and the complete
candidate command/validation/adoption closure remain required before activation.

### Occurrence-scoped scalar and staff-reference writes

The test-only prototype now replaces all seven primary scalar fields and the
separate Part instrument field. Added records update their own arena values;
prefix occurrences use local replacement maps, leaving the frozen typed prefix
and its complete ChangeSet untouched. Reads prefer replacements only while the
source occurrence is visible. Hiding and rebuilding the same raw ID cannot inherit
an old occurrence's values. Scalar variant/owner mismatches fail before reservation.

Staff-reference writes preserve raw empty, unknown and cross-Part IDs until final
semantic validation. Voice references require a string; Event references distinguish
None/inherit from explicit strings, including empty strings. Prefix reference
queries omit replaced old edges and add replacement sources for their new values;
new records use their current arena reference. Sources remain distinct by occurrence
and hidden ancestors suppress old edges. The result is an unordered source set.
A separate owner-Part query is required for Staff removal: the TS preparation
walks only that Part, so a different Part's invalid reference must not produce an
early reference-conflict. Owner comparison uses occurrence identity, even for two
Parts with the same raw ID.

The GPT-6 source review pinned a further command-level rule: Event assignment
compares effective staff IDs (explicit ID or Voice default), so a request to inherit
can be a no-op that preserves an existing explicit field. The raw storage writer
does not decide this command rule. Future preparation must compare effective IDs
before invoking it. Storage return values describe individual raw-field changes;
they neither create history/effects nor permit coalescing a changed-then-restored
batch into a no-op. Original command facts still need a suffix journal and lowering.

Three new prefix replacement maps use fallible reservation. A map/ID-pool capacity
failure leaves the currently written field unchanged and terminates all later
writes. Six added tests cover all scalar fields, prefix/no-op/net-zero behavior,
duplicate added nodes, hidden replacements, raw-reference repair, old/new reference
buckets, cross-Part filtering and every new reservation site. The guarded large
Store test now also forbids aggregate/order/time copying during scalar/reference
writes and verifies zero sibling traversal for those local changes.

These are storage primitives, still excluded from production. Command preparation,
suffix history/effect accounting, combined logical/resource bounds, ordered final
diagnostics and strong-ID adoption are not implemented by these methods.

### Child insertion closure

Staff, Voice and Event insertion now use the same borrowed anchor resolver,
copy-on-first-write local orders and fallible reservation as Part insertion.
Voice insertion validates its content owner's occurrence even for start anchors;
repeated content IDs and duplicate Part IDs cannot redirect the write. Nested and
direct candidate Event insertion share one record/order builder. Raw empty and
duplicate Event/Note IDs remain independent occurrences; the command codec still
owns direct-entry restrictions when this storage is wired to preparation.

Four tests cover prefix and newly added owners, repeated contents, inherited/raw
staff references, notes/rest records, empty/duplicate IDs, same-ID anchors, hidden
sibling positions and failure before payload writes. Every reservation in a
Staff/Voice/Event insertion sequence is faulted separately; the candidate becomes
terminal and the complete typed prefix and live Store stay unchanged. Prefix
orders are copied only for the touched Staff/Voice/Event sibling list; inserts
into already-owned added orders reuse that storage. The shared placement helper
checks bounds before removing retained hidden siblings.

### Selected history/adoption boundary (implementation pending)

The GPT-6 review confirmed that the existing strong ChangeSet cannot represent
every candidate operation: empty component IDs cannot enter its arena/addresses,
and duplicate occurrences are not identifiable by StableId alone. Runtime and
transaction currently derive no-op from an empty strong forward list, while
stored undo/redo reapply that list through a strong overlay. Merely compiling a
final net delta would lose the real operations in an insert-invalid-Part then
remove-Part batch, including version/history/events and redo truncation.

The selected continuation is a private admission journal plus a separate strong
Store adoption delta. Keep the eleven operation kinds and preserve the typed
prefix, candidate suffix, original child segments, effects, affected ordering,
command identity and forward/inverse expected values. Admission journal records
may contain raw IDs and journal-local occurrence identities; valid boundary
entities retain strong IDs. Output affected addresses require a result-only raw-ID
representation without weakening command target decoding or changing wire shape.

Only the final validated changed occurrences/orders/references compile into the
strong delta; transient bad subtrees never enter the Store. Commit/no-op is decided
by effective journal operations, so a nonempty journal with an empty adoption delta
still follows version/history/event reservation and atomic commit. Dirty identity
continues to follow the existing content identity rules. Undo/redo apply stored
inverse/forward journal data in a fresh isolated candidate, not command handlers,
then validate and adopt once. Journal-local tokens must be remapped for that
candidate rather than reusing an earlier arena index as a live identity.

Required integration evidence includes repaired net-zero submit/undo/redo, a
changed typed prefix plus net-zero suffix, empty/deleted affected IDs, exact
segments/effects, redo truncation at an undo position, and zero adoption on
version/reservation failure. Ordinary typed local edits retain the strong path;
neither journal compilation nor history can fall back to whole-document export.
This is a concrete implementation decision, not a claim that journal execution,
final validation, combined resource accounting or adoption is already complete.

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
