# Candidate admission implementation plan

Status: command input representation/codec implemented; occurrence storage,
reads, scalar/reference writes and Part/Staff/Voice/Event insertion verified under
`cfg(test)`. Final assessment, stable Store adoption and combined typed-prefix/
candidate-suffix replay/adoption now have an internal vertical path. Candidate command execution and adoption are
not activated in the public runtime. Historical implementation entries below
retain the evidence and limitations at their original checkpoints. This is
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
`Id = StableId` parameter. Admission instances use `JsString`; default instances
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

The following records the original Arc<str> sharing repair. The subsequent
live UTF-16 migration replaces that storage by JsString/Arc<[u16]>, preserving
clone sharing while admitting all JavaScript code units. Constructors now accept
impl Into<JsString>, and borrowed access is as_js_string. See
`kernel-js-string-compatibility.md` for the current representation and checks.

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

### Result address boundary and verified net-zero history facts

A live TS probe inserts a uniquely identified Part containing repeated empty
Staff/Voice/Event/Note IDs, then removes that Part in the same batch. Submit,
undo and redo all commit with document versions 1, 2 and 3, while the document
equals its original value after every operation. The six affected addresses
retain document, temporary Part, empty Staff, empty Voice, empty Event and empty
Note in that order. Duplicate empty addresses are deduplicated by kind and raw ID.
Each operation emits a commit event and a dirty-state event, sequences 1 through
6. Dirty values are true, false and true: existing content identity is the current
history sequence, not a hash/equality comparison of document bytes. Detached TS
replay also commits this net-zero batch. A checked-in test pins these facts.

This probe exposed an independent response-boundary defect: the native adapter
rejected those legitimate affected addresses as bridge.internal because it reused
a nonempty-ID target validator. Rust result/history/event addresses also used
StableId. Contracts now shares the tagged address schema with an Id parameter
defaulting to StableId for all input targets. AffectedEntityAddressV1 uses a
result-only ID type that accepts raw strings, including empty. Stable IDs and
candidate Arc strings retain their existing allocation through conversion and
cloning; raw and stable representations compare by string content.

Only mutation affected lists, stored affected lists and committed-event affected
lists use this result type. The TS adapter validates their exact tagged/string
shape separately. Seven input target kinds still reject empty IDs; live Store,
command targets, selector requests and event document identity remain strong.
Existing capture/array limits, readonly result capture and event delivery remain
in place. Transport tests substitute this TS-proven affected list into a valid
native response and cover malformed fields, not candidate native execution.

This fixes the result boundary needed by the pending journal. It does not enable
the native repaired batch or implement operation journaling, history token
remapping, final candidate validation or Store adoption.

### Journal identity and replay-binding foundation

The private candidate now records a journal identity per node lifetime, with an
owner identity, a shared raw ID and optional strong locators at the suffix start
and end. The sealed manifest drops the recording candidate's arena positions.
Deleting and rebuilding the same raw ID creates distinct identities. Inactive
identities never resolve through a same-ID fallback. Temporary empty/duplicate
entities and repeated Part measure contents have no strong boundary locator;
insert replay must supply their complete deterministic node-to-identity mapping.

Suffix start means after the isolated strong prefix has executed, not the start
of the history entry. Forward replay must apply that prefix before binding the
suffix start. Inverse replay binds the suffix end, reverses the suffix, then
reverses the strong prefix. Binding cannot adopt/publish that prefix. These
ordering constraints were reviewed by the read-only GPT-6 design agent and are
captured by a prefix-inserted entity test.

Boundary binding checks global entity uniqueness, measure existence, content
uniqueness and exact owner relations before returning a binding set. Explicit
insert bindings reject duplicate identities, aliased occurrences, wrong kinds,
raw IDs and owners before publication. Removal invalidates all registered
descendants. Collection growth is fallible and failure makes the candidate
terminal. Raw IDs and parent boundary addresses share their allocations. A
temporary content index scans each changed content order once per boundary;
unchanged prefix links use the existing index without scanning sibling orders.

Eight identity tests cover same-ID forward/inverse lifetime reconstruction,
temporary invalid subtrees replayed at different arena positions, isolated typed
prefixes, malformed bindings, invalid strong boundaries and all added reservation
sites. A 512-measure case with a long Part ID pins one changed content-order scan
per boundary and zero scans for unchanged prefix links. Full Rust regression is
218 passed, 1 ignored; fmt, strict clippy and Rust 1.88.0 all-target checks pass.
This step is test-only. It implements identity remapping primitives, not stored
operation replay, complete journal payload/accounting, final validation or Store
adoption. Insert operation records must still prove the subtree correspondence,
and operation replay must check expected values and positions before mutation.

### Stored Part subtree insert/remove

The first operation path now records and replays Part insert/remove using saved
forward and inverse operations. A recorder owns its candidate and permits removal
only of an active Part inserted by that same recorder; an arbitrary Added root is
insufficient. Insert/remove of a temporary invalid subtree retains two effective
steps even when the final visible document equals the suffix start. This is the
operation-level basis for the TS-proven net-zero history behavior above; session
version, dirty identity, events and history integration are still pending.

Each operation uses an immutable flat Part-subtree payload. It retains one root,
unique journal IDs, exact owner/child-order membership and scalar, instrument,
staff-reference and event-content fields. It is a payload of the existing
InsertEntity/RemoveEntity kinds, not a twelfth snapshot operation. Empty, repeated
or dangling raw references remain data during preparation. Shared raw IDs and
references retain their allocations across capture and replay. The bundle does
not export or replace the whole document and replay does not invoke handlers.

Replay validates bundle structure, manifest identity facts, owner and predecessor
before insertion. Removal checks every expected field, visible child order and
predecessor before hiding or unbinding. Inserted subtrees have no Extension
blocks: the existing reference index also verifies that inverse removal from a
strong end Store cannot silently drop/orphan unexpected Part-owned opaque data.
General Prefix Part removal and recording extension mutations remain unfinished.

Log slots are reserved before recording a candidate mutation; candidate placement,
bundle capture and replay binding still contain fallible staging steps. Every
recorder/replay error permanently terminates that candidate, including invariant
errors after staging; writes and manifest sealing cannot resume. Tests inspect
discarded state only to prove the live Store and strong prefix remain untouched.
Anchor failures precede journal reservation attempts. These guarantees cover the
controlled collection reservation sites, not every process allocation. Exact
combined logical accounting and retained-memory/peak bounds remain open.

Ten operation tests cover transient invalid subtrees, explicit intermediate
fields/orders, different arena locations, six-step same-ID lifetime/anchor
sequences, inverse removal from a strong end Store, unexpected Extension data,
malformed bundles, changed expected values/orders/anchors, foreign recorder
ownership and all recording/forward/inverse reservation failures. Full Rust
regression is 228 passed, 1 ignored; fmt, strict clippy and Rust 1.88.0 all-target
checks pass. No production path changed; the latest full real-native/TS result
remains 705 passed, 2 skipped from the result-boundary change.

### Field operations composed with subtree removal

The journal now records ReplaceScalar for all eight scalar slots, including Part
instrument data, and UpdateReference for raw Voice/Event staff assignments. Each
step retains expected and replacement values plus its stored inverse. Scalar
values are shared between the forward/inverse record and the recorder's latest
field patch. References share candidate/journal ID allocations. Raw no-ops return
before identity/log/map reservations and produce no step; a changed-then-restored
field retains both operations even if the final value equals the start.

The recorder tracks only touched fields by occurrence. Part removal combines
those recorded changes with the original subtree payload, verifies that combined
expected state against the candidate, and stores it as the RemoveEntity payload.
Unrecorded field or order drift still fails. Original insert data remains immutable.
Unchanged node images and child-order arrays are shared across the two payloads;
building the remove payload occurs only when removing the affected subtree, not
on each local edit. Removed-node patch bookkeeping is released without refunding
or erasing stored operation history.

Inverse replay inserts the updated deleted subtree, reverses each reference and
scalar operation against its expected raw value, then removes the original insert
state. Both added and strong-prefix fields use the same journal replay rules. A
prefix-field modification followed by the edited transient Part lifecycle keeps
that prefix modification in forward replay and reverses it last during inverse
replay from a fresh strong end Store.

Eight new tests cover all scalar slots, raw None/empty/explicit reference forms,
no-ops, changed-and-restored fields, malformed/stale operations, typed field errors,
updated removal payloads and sharing, and recording/replay reservation failures
for added and prefix fields. A 4,098-Staff Part test verifies one field edit does
not traverse the subtree or rebuild its insertion payload. Full Rust regression
is 236 passed, 1 ignored; fmt, strict clippy and Rust 1.88.0 all-target checks pass.
The last real-native/TS regression remains 705 passed, 2 skipped; production native
execution is unchanged by these test-only journal additions.

Event command preparation must still decide effective-staff no-ops before calling
this raw journal, preserving explicit/inherited representation on a command no-op.
Remaining entity kinds and order operations, original effects/segments/affected ordering,
resource accounting, final candidate diagnostics and strong adoption remain open
before this path can connect to native submit/history/replay. This is not full
command closure or commercial qualification.

### Stored moves composed with subtree removal

MoveOrderedChild records owner, target, old predecessor and new predecessor as
journal identities. Recording preserves typed-global target and owner-local
anchor failure precedence; unchanged positions return before any reservation or
identity registration. Replay validates the expected predecessor and exact owner
before changing a list. It never resolves the predecessor again by raw ID, so an
empty or duplicated predecessor remains a distinct occurrence during undo.

Moves inside a Part inserted by this recorder track only the touched sibling
lists. Removal combines those recorded orders and field patches with the original
immutable insert payload and verifies the complete expected subtree. Untouched
sibling arrays remain shared even within a changed owner. Prefix moves store
only operation identities; they do not retain a second complete sibling list in
the removal bookkeeping. The candidate still copies a changed prefix order once
for its actual write. Temporary bundle indexing occurs on subtree removal only.

Eleven tests cover Part/Measure/Staff/Voice/Event/Note moves, move/edit/remove
composition and both replay directions, duplicate empty predecessors, repeated
content measure IDs with exact Voice ownership, hidden siblings, no-ops, malformed
expected state/order patches, and every controlled recording/replay reservation
failure. A Part with 1,024 unrelated Events bounds the small Staff move to its
Staff list and preserves the original insert payload. Full Rust regression is
247 passed, 1 ignored; fmt, strict clippy, Rust 1.88.0 all-target check and scoped
diff review pass. The last native/TS regression remains 705 passed, 2 skipped;
all candidate execution is still test-only.

This implements five operation forms, not the complete eleven-operation journal.
General entity insertion/removal, remaining order and extension operations,
effects/segments/affected ordering, combined resource accounting, final candidate
diagnostics and strong Store adoption remain open. No commercial qualification
or production cutover is claimed.

## Implementation and evidence order

After the live UTF-16 migration, bounded GPT-6 planning review selected the next
functional slice: journal Staff insertion/removal driven by admission-decoded
commands. It must cover raw empty/duplicate IDs, exact Part ownership and local
anchor resolution, reference-conflict scope, field/move/remove composition,
insertion inside a newly inserted Part and both stored replay directions.
Every new reservation failure must remain terminal and preserve the prefix/Store.
The implemented Staff slice covers both frozen-prefix and newly inserted Staff
deletion because Staff leaves own no extension subtrees. This is a concrete
command-to-journal path; it does not
activate a partial public candidate dispatcher. Final assessment, cumulative
budgets and strong adoption must follow before selecting the route natively.

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

### Staff structural journal and independent submission oracle

Staff insert/remove now share the stored InsertEntity/RemoveEntity operation
forms with Part subtrees. Each leaf retains its exact UTF-16 image and journal
identity. Preparation resolves raw targets and owner-local anchors, and checks
references within the owner's Part. Replay checks the stored identity, owner,
definition and predecessor. It does not rerun reference admission: reversing a
transaction can legitimately restore a temporarily unresolved reference before
its Staff is restored.

An active inserted Part records Staff births/deaths and touched Staff order by
occurrence identity. Whole-Part removal synthesizes expected membership from the
immutable original subtree plus recorded changes, then verifies current state.
It cannot recapture arbitrary current candidate state as the expected history.
Staff definition recording also checks its expected prior image, including a
requested no-op, so an unrecorded change cannot be hidden by a later valid edit.

The independent TypeScript fixture contains ten real batch submissions and their
undo/redo results, with inner JSON strings preserving isolated UTF-16 units. The
Rust test driver decodes those commands through Contracts and compares visible
entity order, values and references with the TS final document. Replay starts
from separately built strong initial/final Stores, proving it does not depend on
old candidate arena indices. This is not yet comparison of public Rust command
effects, versions, diagnostic reports or Store adoption.

One legacy TS history defect is frozen explicitly: inserting a duplicate Staff
under a new Part and then removing that Part commits, but undo rejects with
`history.invariant-violation`; redo then rejects with `history.empty-redo`.
The inverse stores only raw Staff ID and cannot select one duplicate after the
Part is restored. Initial/final/undo/redo documents are identical in this net-zero
case, so document equality alone concealed the failure. Rust's identity-based
journal must successfully replay it in both directions. The TS production defect
remains open until the replacement path is integrated or separately repaired.

### Final assessment and real Store adoption

Foundation now shares one fallible node-read interface between JSON assessment
and candidate occurrence assessment. The candidate projection preserves ordered
raw IDs, fields and owner-scoped arrays, including duplicate/empty IDs. It does
not construct a Score DTO or JSON tree. Extension assessment consumes the new
13th internal CoreBaseRead capability, a namespace/schema/owner header visitor;
the former 12-method count is historical, not a public ABI. Opaque payloads stay
in their existing storage. Header reads distinguish unavailable, invariant and
capacity failures; capacity failure yields InternalCapacity and terminates the
candidate instead of inventing a shape diagnostic.

Only a semantically valid candidate becomes an owned, read-only stable final
view. Sparse delta collection expands hidden prefix subtrees along their frozen
owner routes and visits changed/new state. Deletion identities remain distinct
from final ID values, including same-ID rebirth across entity kinds. Hidden
temporary raw IDs never become physical StableIds. A retained typed prefix is
collected by borrowing its arena/operations, not by replaying invalid transient
operations into live storage. Extension-only order changes are retained too.

Final preparation checks that changed records, references and metadata agree
with the validated view, then reuses Store preflight, capacity reservation and
adoption. The owned plan is produced before the frozen Store borrow ends and
checks document ID/version before commit. The Recorder wrapper assesses before
identity sealing and derives actual operation count from its journal plus the
prefix. Net-zero real operations still advance the version. The low-level seam
remains private and its direct tests supply their operation count explicitly.

The 12-case independent TS oracle compares full diagnostics and child-failure
precedence. All eight final semantic rejection cases also exercise the Recorder
finalization wrapper. Three successful cases compare real Store adoption and
suffix inverse/forward adoption from fresh strong boundaries, including versions
1/2/3 and full index rebuild parity. Additional cases cover metadata repair over
an invalid prefix, retained extension history, every scalar/reference family,
order/time changes, whole-Part rebirth and cross-kind Event/Staff rebirth.

One new cross-kind test exposed a shared production adoption defect: cleanup of
an old Event ID erased a newly inserted Staff binding with the same ID, causing
an internal assertion after writes had begun. All six entity cleanup branches
now remove a global binding only if it still names the exact old kind/handle.
Old ownership and slots are still removed by their old handles. Both typed and
candidate replay regressions cover the repair; native comparison is tracked in
the completion ledger.

This checkpoint closes an internal functional path, not complete kernel activation.
Combined history was still open here and is implemented in the next entry. General
command/journal forms, effects/segments/affected ordering and full resource
accounting remain open. Current traversal counters exclude work inside final-view
preparation reads and some frozen-prefix helpers; no complete cost claim or
universal allocation-failure recovery is implied. Ordinary typed edits retain
their incremental path and do not enter this full candidate assessment.

### Combined typed-prefix and candidate-suffix history

`CombinedHistory` retains the original typed ChangeSet arena and the immutable
occurrence Journal. Forward replay interprets the typed prefix over Store, then
replays the suffix in a candidate. Inverse replay first restores the suffix's
start identity boundary, then interprets the typed inverse over that frozen
candidate. Both paths perform one final semantic assessment, produce an owned
plan and adopt once. The interpreter is the existing 11-operation implementation
parameterized by CoreBaseRead, not a second typed replay engine.

The inverse intermediate may have invalid tempo, unresolved nonempty staff IDs
or incomplete measure coverage. A structural seal checks readable owners,
nonempty globally unique entity IDs, owner-local content IDs and representable
references. It does not grant semantic validity or access to Store preparation.
Only the separate final semantic wrapper does that. The read adapter reconstructs
actual local bundles for all six entity root kinds, including Part extensions;
it never consults the expected history bundle or builds a whole Score/JSON tree.

Delta merging follows execution order: suffix inverse first, typed inverse
second, final candidate changes last. Later births/deaths supersede prior fields
and source references; removed lifetimes remain recorded. Current final orders
and records drive adoption. Prefix-only inverse skips the extra boundary scan;
nonempty suffix inverse reports two full document scans (structural plus semantic)
and one full semantic validation. Detailed allocation/traversal accounting is
still unfinished. Option-based local bundle reads currently collapse capacity
failure into an unavailable read/precondition failure; failure remains before
adoption, but this is an explicit error-classification gate before activation.

Nine combined tests cover all 11 typed operation kinds, invalid intermediate
metadata/reference repair, duplicate temporary subtrees, empty and actual-net-zero
history, Part/Measure subtree replay, whole-Part same-ID rebirth with every
generation checked, extension history and repeated cycles. Corrupted late
preconditions and a corrupted final inverse demonstrate unchanged Store,
indices, version and metrics on rejection. Four adapter tests compare local
bundles/fields/orders and reference semantics with independently built typed
state; four structural tests include every new reservation failure.

Integration exposed shared extension projection defects: standalone extension
edits did not publish owner-reference changes, and stored anchors could remain
stale after an earlier extension insertion/removal/reorder. The overlay now
tracks standalone owner references, projects current Part extension membership,
payload and global predecessors, and reads the current standalone predecessor.
These changes also apply to ordinary typed operations. The regression suite
retains combined replay cases for these interactions.

This remains test-only and limited to existing Recorder operations. For example,
Recorder Part removal currently accepts only Parts inserted by that Recorder;
arbitrary prefix-Part removal, Voice/Event (including nested Notes)/Measure journal forms, all order
and extension suffix operations, effects/segments/affected ordering and full
resource accounting remain functional work. Future suffix extension writes must
explicitly merge both extension deltas; today's suffix has none. General command
coverage and native activation must not be inferred from the 11 typed-prefix
operation enumeration.

### Next functional slice after combined history

GPT-6 planning review selected Event/Voice subtree recording and replay next.
Complete voice.insert-notes-event, voice.insert-rest-event, event.remove,
voice.insert and voice.remove using a limited shared BundleNode/Image traversal,
existing FieldChanges/JournalOrder checks and identity insertion/removal bindings.
Exercise real combined adoption/undo/redo, edits before removal, dead descendant
identities, same-ID rebirth and invalid intermediate time/reference state.
Notes are nested in Events; the 28-command API has no independent Note insert or
remove command, so no extra public API is planned.

Then generalize verified removal of frozen-prefix subtrees (especially Part),
implement Measure as an explicit cross-Part composite with retained content
occurrences/anchors, and complete candidate range resolution plus the shared
command/Batch dispatcher. Reuse the existing final assessment/adoption path.
Do not recapture arbitrary current candidate values as expected history or
create a second command engine. Each recorded subtree must be checked against
its original image plus recorded changes before removal. Complete effects and
resource/error accounting before activating the native route.
