# ChangeSet, Overlay, Atomic Adoption and Capacity Decision

## 1. Decision summary

RKP-3 uses a touched-state overlay plus a fully prepared commit plan.

```text
strict command bytes
  -> exact typed envelope
  -> fixed Session handler
  -> overlay-aware stable-ID reads
  -> ordered typed ChangeSet + inverse + affected addresses
  -> complete preflight and fallible reservation
  -> infallible-by-construction adoption under the session lock
  -> one checked version increment
```

The overlay never contains a full `ScoreDocumentV1`, full `LiveScoreStore`, or
clone of every index. It owns only changed records, removed bundles, touched
order vectors, index deltas, affected addresses, and the ordered change log.

## 2. Rejected implementation shapes

| Shape | Rejection reason |
|---|---|
| Clone/export the full document, run TypeScript-like effects, rebuild store | Recreates the exact global allocation and traversal defect that RUST-R004 forbids. |
| Clone every SlotMap/HashMap, mutate the clone, swap at end | Hides a full-store copy behind Rust containers and makes local edits O(document). |
| Mutate live store while preparing and undo on expected failure | SlotMap removal/reinsertion changes generations; rollback can itself allocate or fail and cannot prove exact handle/index restoration. |
| Store RuntimeHandles in ChangeSet | Makes RKP-4 history session-allocation dependent and leaks physical identity across rebuild/replay. |
| Generic JSON Patch/path operations | Loses typed owner/reference laws, permits unsupported writes, and is not the accepted semantic-command contract. |
| Public callback/closure transaction | Violates the fixed catalog, deterministic replay, and FFI boundary. |
| Temporarily full-validate every native submit | Violates the ordinary-local-edit zero-global-work law and steals RKP-5 ownership. |

## 3. Stable transaction vocabulary

All durable transaction identities are stable-ID based. Runtime handles are
resolved only in the ephemeral `CommitPlan`.

### 3.1 Addresses

```rust
enum StableEntityAddressV1 {
    Document { document_id: StableId },
    Measure { measure_id: StableId },
    Part { part_id: StableId },
    Staff { staff_id: StableId },
    Voice { voice_id: StableId },
    Event { event_id: StableId },
    Note { note_id: StableId },
}

enum StableOwnerAddressV1 {
    Document { document_id: StableId },
    Part { part_id: StableId },
    PartMeasure { part_id: StableId, measure_id: StableId },
    Voice { voice_id: StableId },
    Event { event_id: StableId },
}

enum StableOrderAddressV1 {
    Measures { document_id: StableId },
    Parts { document_id: StableId },
    Staffs { part_id: StableId },
    MeasureContents { part_id: StableId },
    Voices { part_id: StableId, measure_id: StableId },
    Events { voice_id: StableId },
    Notes { event_id: StableId },
    Extensions { document_id: StableId },
}

enum StableAnchorV1 {
    Start,
    After { sibling_id: StableId },
}
```

`StableOrderAddressV1` separates an ordered collection from the addressed
entity. Anchors are stable neighbor identities, never array indices. A
precondition records both the expected owner/order and the expected previous
sibling so a later history application cannot silently target a different
position.

### 3.2 Scalar and reference fields

```rust
enum ScalarAddressV1 {
    DocumentMetadata { document_id: StableId },
    MeasureDefinition { measure_id: StableId },
    PartName { part_id: StableId },
    PartInstrument { part_id: StableId },
    StaffDefinition { staff_id: StableId },
    VoiceSequenceStart { voice_id: StableId },
    EventNoteValue { event_id: StableId },
    NoteWrittenPitch { note_id: StableId },
}

enum ReferenceAddressV1 {
    VoiceDefaultStaff { voice_id: StableId },
    EventStaffAssignment { event_id: StableId },
    PartMeasureLink { part_id: StableId, measure_id: StableId },
    ExtensionOwner { namespace: String, owner: ExtensionOwnerV1 },
}
```

Each address has a closed matching value enum. Cross-field combinations that
cannot be valid are unrepresentable; no `serde_json::Value` is used for Core
record/scalar changes. Extension payload remains the already bounded typed
JSON value from Foundation.

### 3.3 Entity bundles

Insert/remove operations carry one of these detached semantic bundles:

- `MeasureBundle`: definition plus one PartMeasure content per Part, including
  nested Voices/Events/Notes;
- `PartBundle`: Part record, Staffs, all PartMeasure contents and descendants,
  plus its indexed ExtensionBlocks with document-order anchors;
- `StaffBundle`;
- `VoiceBundle` with Events/Notes;
- `EventBundle` with Notes;
- `NoteBundle`.

Bundles avoid duplicating a high-level command payload into thousands of tiny
owned values. Adoption expands a bundle into pre-counted typed record and index
deltas. The bundle root and every descendant still undergo duplicate-ID,
owner, reference, capacity, and local invariant checks before adoption.

### 3.4 Exact internal operation enum

```rust
enum ChangeOpV1 {
    ReplaceScalar {
        address: ScalarAddressV1,
        expected: ScalarValueV1,
        value: ScalarValueV1,
    },
    InsertEntity {
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        entity: EntityBundleV1,
    },
    RemoveEntity {
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        expected: EntityBundleV1,
    },
    InsertOrderedChild {
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        child_id: StableId,
    },
    RemoveOrderedChild {
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        child_id: StableId,
    },
    MoveOrderedChild {
        order: StableOrderAddressV1,
        child_id: StableId,
        expected_anchor: StableAnchorV1,
        anchor: StableAnchorV1,
    },
    ReplaceOrderedChildren {
        order: StableOrderAddressV1,
        expected: Vec<StableId>,
        value: Vec<StableId>,
    },
    InsertExtensionBlock {
        anchor: StableAnchorV1,
        value: ExtensionBlockV1,
    },
    ReplaceExtensionBlock {
        namespace: String,
        owner: ExtensionOwnerV1,
        expected: ExtensionBlockV1,
        value: ExtensionBlockV1,
    },
    RemoveExtensionBlock {
        expected_anchor: StableAnchorV1,
        expected: ExtensionBlockV1,
    },
    UpdateReference {
        address: ReferenceAddressV1,
        expected: ReferenceValueV1,
        value: ReferenceValueV1,
    },
}
```

`ReplaceOrderedChildren` is the explicit normalization primitive required by
accepted Measure insert/remove/move behavior when a valid input preserves a
Part content order different from global Measure order. It is not a generic
array replacement: only one typed `StableOrderAddressV1` collection can be
changed, and exact old/new stable-ID sets are preconditions.

The enum is private Rust history data, not a JSON/FFI/persistence schema. Its
`V1` suffix freezes semantic meaning for RKP-4 review without promising public
serialization.

## 4. Forward/inverse law

The builder performs this sequence for every operation:

1. resolve and detach the overlay-aware current value/owner/order;
2. verify the operation-specific precondition;
3. construct the inverse from that exact current state;
4. charge forward plus inverse to the logical budget;
5. append the forward operation to the current child segment;
6. prepend the inverse operation to that segment's inverse order;
7. update overlay record/order/reference/index views;
8. append affected stable addresses in first-observed order with deduplication.

For a batch, each child has `{forward_start, forward_end, inverse_start,
inverse_end, affected_start, affected_end}` metadata. The aggregate inverse
orders child segments in reverse and operations inside each segment in reverse.
No history entry is stored in RKP-3, but the produced structure is directly
consumable by RKP-4.

No-op comparison happens after target/reference resolution against the
overlay-aware value. A no-op appends no operation, consumes no version, and
does not erase prior effective batch children.

## 5. Transaction overlay

```rust
struct TransactionOverlayV1<'a> {
    base: &'a mut LiveScoreStore,
    records: HashMap<StableEntityAddressV1, OverlayRecordV1>,
    orders: HashMap<StableOrderAddressV1, Vec<StableId>>,
    extensions: HashMap<ExtensionKeyV1, OverlayExtensionV1>,
    entity_states: HashMap<StableId, OverlayEntityStateV1>,
    reference_deltas: HashMap<StableId, Vec<ReferenceDeltaV1>>,
    time_deltas: HashMap<StableId, OverlayVoiceTimeV1>,
    forward: Vec<ChangeOpV1>,
    inverse: Vec<ChangeOpV1>,
    affected_order: Vec<StableEntityAddressV1>,
    affected_seen: HashSet<StableEntityAddressV1>,
    segments: Vec<BatchSegmentV1>,
    prepared_effect_count: u64,
    logical_bytes: u64,
}
```

`prepared_effect_count` is supplied by handlers according to the accepted
TypeScript `CoreEffect` units and is intentionally independent from the number
of lower-level `ChangeOpV1` entries. For example, one aggregate entity effect
may expand into several typed record/order operations, while a Measure insert
may count both its bundle effect and an optional normalization effect.

This is a conceptual ownership shape. Implementation may split modules but may
not replace it with a full state copy.

Lookup order is fixed:

1. overlay tombstone/new/replacement state;
2. base entity index average O(1);
3. typed base slot lookup;
4. owner/order/reference projection through the touched overlay value when it
   exists, otherwise the matching base index/topology entry.

An order vector is cloned only on its first write. Scalar-only commands do not
clone any order. Event insert/remove clones only one Voice event order and the
affected time-index vector. Measure operations necessarily touch global
Measure order plus one content order per Part because that is their semantic
closure. Range operations walk only the selected topology interval and its
descendants.

## 6. Atomic adoption protocol

### Phase A — complete semantic preparation

Before any live mutation:

- exact decode/route/target-kind checks complete;
- every target, owner, anchor, reference, range endpoint, and duplicate ID is
  resolved against the overlay;
- all children have staged or the batch has been discarded;
- effect, affected, batch, and logical ChangeSet caps pass;
- the next document version is checked but not installed;
- every touched record/order/index projection passes local invariants;
- inserted/removed record/index/time/reference counts are checked;
- all new record values, replacement vectors, time indices, and index-delta
  entries are fully owned by the transaction;
- the CommitPlan contains stable IDs plus temporary insertion tokens, never
  unresolved user input.

### Phase B — fallible capacity reservation

The Runtime calls `try_reserve` for every live SlotMap, HashMap, HashSet, and
Vec that can grow, and for all remaining commit scratch. A capacity failure
returns the private stage resource/internal failure before any semantic entry,
record, index, metric, or version mutation.

Earlier successful reservations may leave additional allocator capacity if a
later reservation fails. Capacity is deliberately non-semantic and is excluded
from snapshots, indices, counters, failures, and equality. Every value-visible
and metrics-visible projection remains unchanged.

### Phase C — adoption with no expected failure edge

The `CommitPlan::adopt` signature returns a committed value, not `Result`.
Adoption executes while the session mutex is exclusively held:

1. allocate all inserted SlotMap records from already reserved capacity and
   bind temporary insertion tokens to fresh typed handles;
2. install scalar/replacement records and prebuilt touched order vectors;
3. apply ownership/entity/reference/extension/time index removals and inserts;
4. remove obsolete record slots last so stale handles become invalid only
   after every consumer edge has been detached;
5. install the checked next document version;
6. merge committed metrics and return the internal committed ChangeSet.

Every index/position used by adoption was checked against the still-locked base
state in Phase A. Adoption uses guarded map/slot operations and no user code,
serialization, allocation request, dynamic dispatch, or callback.

### Panic policy

An unexpected panic in Phase C is not a recoverable command rejection. The
existing Node boundary contains it as `bridge.panic-contained`; unwinding while
the session guard is held poisons the mutex, and every later access returns
`bridge.handle-poisoned`. The possibly partial session is never observed or
reused. This is materially safer than pretending rollback succeeded after a
SlotMap generation change.

Expected decode, command, precondition, resource, and invariant failures all
occur in Phase A/B and therefore retain strict zero delta.

## 7. Logical ChangeSet budget

### 7.1 Frozen cap

```text
MAX_CHANGESET_LOGICAL_BYTES_V1 = 268,435,456 bytes (256 MiB)
```

This is independent from allocator capacity and `size_of::<T>()`, so evidence
is identical on 32/64-bit platforms and across Rust versions.

### 7.2 Frozen accounting

The counter is checked `u64` arithmetic and includes:

| Item | Logical charge |
|---|---:|
| each arena entry | 16 bytes + exact value bytes |
| unique UTF-8 string/StableId stored in arena | UTF-8 byte length, once |
| bounded extension JSON payload | canonical JSON byte length, once |
| scalar/fraction/numeric/enum value | 16 bytes maximum fixed charge |
| `ChangeOpV1` forward or inverse header | 64 bytes |
| ordered-child ID entry | 16 bytes (ID bytes are interned once) |
| reference delta entry | 32 bytes |
| affected address entry | 32 bytes |
| batch segment | 32 bytes |

Entity bundles use an arena and intern table shared by forward and inverse;
the same detached old/new value is not charged twice merely because two ops
reference it. An op cannot hide uncharged owned data. HashMap/Vec spare
capacity, SlotMap vacant slots, pointers, alignment, and allocator metadata are
not charged.

### 7.3 Compatibility proof gate

Before freezing implementation Stage 2, tests must establish:

1. every owned field has exactly one accounting path;
2. checked overflow reports a stable private limit failure;
3. `at cap` accepts and `cap + 1` rejects without live delta;
4. worst-shape create and command fixtures at the accepted 64 MiB and property
   boundaries remain below 256 MiB under this accounting;
5. aggregate batch and large range removal cannot amplify uncharged payload;
6. repeated references/StableIds are interned and counted once, while distinct
   values are all counted.

The conservative bound is based on at most 64 MiB of accepted live source
bytes plus 64 MiB of accepted command bytes, shared forward/inverse payload
storage, and fixed structural charges. If the mechanical worst-shape proof
does not fit, implementation stops and planning is revised; the code must not
raise a hidden public limit or weaken existing input caps.

The private stage-only failure uses
`command.resource-limit-exceeded` with
`limitKind: "changeset-logical-bytes"`, `limit`, and `actual`. That extra
limit kind is never admitted by the public TypeScript `CommandFailure` union
and therefore blocks product cutover until a later compatibility/versioning
decision.

## 8. Complexity metrics

Each submit captures a before/after delta and returns only private evidence:

```text
full_document_scans
full_document_clones
full_semantic_validations
full_snapshot_materializations
entities_visited
entity_index_lookups
owner_index_lookups
time_index_comparisons
overlay_records
order_collections_copied
change_ops
changeset_logical_bytes
affected_addresses
index_entries_removed
index_entries_inserted
ffi_request_bytes
ffi_response_bytes
```

For an ordinary scalar/local insert/remove submit after load, the first four
are exactly zero. An explicit read after submit increments the existing full
materialization/canonical byte counters separately and is never folded into
submit time.

Counters use checked/saturating diagnostic arithmetic as already established
by RKP-2. They do not change command semantics. Failed transactions report
attempted-work counters in the detached response but do not merge them into
the committed store metrics.

## 9. Command-to-change mapping

| Command family | Primary operations | Touched order/index closure |
|---|---|---|
| metadata/pitch/note value/definitions/names/instrument/start | `ReplaceScalar` | target record; Voice time index for duration/start |
| default/event staff | `UpdateReference` | target record plus reference dependency index |
| event/staff/voice insert/remove | `InsertEntity` / `RemoveEntity` | one parent order; entity/owner/reference/time indices; descendants in bundle |
| event/staff/voice move | `MoveOrderedChild` | one parent order only |
| Measure insert/remove | Measure bundle plus ordered insert/remove and optional `ReplaceOrderedChildren` | global Measure order; every Part content order; entity/owner/reference/time indices for bundle |
| Measure move | `MoveOrderedChild` for global and each Part content order, optional normalization | global Measure order plus each Part content order |
| Part insert/remove | Part bundle plus ordered insert/remove and ExtensionBlock order operations; command insert supplies no extensions, while remove inverse restores captured owned extensions | Part order; all descendant and extension indices |
| Part move | `MoveOrderedChild` | Part order only |
| range delete | ordered sequence of bundle/event removals | only selected interval and descendants |
| range transpose | ordered `ReplaceScalar(NoteWrittenPitch)` | selected Notes only |
| batch | concatenated child segments on one overlay | union in first-observed order, one adoption |

This mapping preserves semantic ordering while allowing CommitPlan to coalesce
multiple writes to the same record/order/index into one live adoption. The
ordered forward/inverse log is not coalesced unless equivalence and segment
boundaries are preserved, because RKP-4 will consume those boundaries.
