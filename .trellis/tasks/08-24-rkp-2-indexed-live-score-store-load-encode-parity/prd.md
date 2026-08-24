# RKP-2 Indexed LiveScoreStore, Load/Encode and Index Parity

## Goal

Replace the RKP-1 whole-DTO runtime holder with the first real Rust `LiveScoreStore`: typed generational entity storage, explicit semantic topology, deterministic lookup indices, exact musical-time indices, atomic import, and deterministic export back to the unchanged `brilliant-score-1` DTO. TypeScript remains the product runtime and no command is cut over.

## Authority and current state

- Planning base: `063b332dd48c05796fb3450a8004f42ff2148b20`.
- Accepted architecture: `.trellis/tasks/08-16-brilliant-guitar-architecture-reset-v2/design.md`.
- Accepted predecessor: archived RKP-1, audited production head `94387b339b5e4d9ce6b7f97597a1b56edd051f01`, archive commit `08792d52eb33ab3b9901eae818e8a53adc742bdc`.
- Sibling prerequisite: RKP-1 post-archive workspace/authority repair planning candidate `f7fecdcf7f2194b978ff2841b7913b670a2f7f8f` received a targeted planning PASS out of band; its implementation, independent implementation review, acceptance and archive remain pending.
- RKP-2 planning may proceed on this branch. RKP-2 activation and production edits require a final base that contains the accepted/archived sibling repair and preserves this planning contract.
- Task state stays `planning`; `task_start_run=false`; `production_implementation_authorized=false`.

## Product outcome

After RKP-2 acceptance, Rust can load a complete score into a session-private indexed representation and reproduce the same canonical score without retaining or editing the DTO tree. This gives later stages stable average-O(1) entity/owner lookup and O(log n + k) voice-time query primitives. It removes the architectural cause of future full-document target scans while preserving every current external shape.

## Requirements

### RKP2-R001 — One semantic truth, two explicit representations

`ScoreDocumentV1` remains the persistence, migration, exchange and round-trip DTO. `LiveScoreStore` becomes the sole live representation owned by `brilliant-kernel-runtime` after successful session creation.

The runtime stores scalar/entity data, semantic topology and derived indices. It does not retain the original `ScoreDocumentV1` object graph. Full DTO materialization occurs only during load validation/import and the existing explicit full `read_state`/encode path. RKP-4 owns selector-first reads and revision snapshot caching.

### RKP2-R002 — Exact dependency and container decision

The seven-crate workspace and dependency direction stay exact. Add one direct dependency only:

```toml
[workspace.dependencies]
slotmap = "=1.1.1"
```

`brilliant-kernel-runtime` consumes `slotmap.workspace = true`. Default `std` stays enabled; `serde` and `unstable` features stay disabled. `brilliant-score-foundation`, contracts, session and Node do not import `slotmap`.

Use standard `SlotMap` plus `new_key_type!` for distinct `MeasureHandle`, `PartHandle`, `StaffHandle`, `VoiceHandle`, `EventHandle`, `NoteHandle` and private `ExtensionHandle`. Public order never comes from `SlotMap` iteration.

### RKP2-R003 — Identity separation

- `EntityId`/`StableId` is persisted, globally unique across document, measure, part, staff, voice, event and note IDs, stable across save/open, and used by DTO/FFI.
- `RuntimeHandle` is a typed slot+generation key, session-private, stale after removal/reuse, and absent from Foundation DTOs, Kernel Contracts, Node DTOs, snapshots, events and encoded files.
- `MusicalLocation` is an exact canonical Fraction derived from voice sequence start and ordered event durations. It is a query key, not identity.

The document root participates in global ID uniqueness through an internal `RuntimeEntityRef::Document` sentinel; it receives no arena slot. Arena position, generation, pointer and allocation order never enter an EntityId.

### RKP2-R004 — Live store ownership

`LiveScoreStore` contains:

- document header and metadata;
- typed slot maps for measure, part, staff, voice, event and note records;
- a private extension-block slot map;
- semantic topology preserving every input array order;
- `EntityIndex`;
- `OwnershipIndex`;
- `(PartHandle, MeasureHandle) -> PartMeasureContentRecord` lookup;
- per-voice exact-time indices;
- `(namespace, owner) -> ordered extension handles` lookup;
- Core structural reference dependency index.

`PartMeasureContent` has no persisted EntityId, so RKP-2 does not invent one. It is addressed internally by the typed `(PartHandle, MeasureHandle)` pair. The score root remains a header, not another mutable document tree.

### RKP2-R005 — Explicit semantic order

The topology records these orders exactly as decoded:

1. document measure order;
2. document part order;
3. staff order per part;
4. measure-content order per part;
5. voice order per part/measure content;
6. event order per voice;
7. note order per event;
8. extension order.

Encoding walks these vectors. HashMap and SlotMap iteration is excluded from public ordering, failure precedence, index projections and test evidence.

### RKP2-R006 — Lookup and time complexity

- stable entity lookup: average O(1);
- typed handle dereference: average O(1);
- owner lookup: average O(1);
- part/measure content lookup: average O(1);
- exact-time and half-open range query within a voice: O(log n + k);
- encode: O(E + R + P), where E is stored entity/extension count, R is topology/reference edge count and P is bounded extension payload size;
- import/index construction: O(E + R + P) expected, with no nested lookup-by-ID scan.

A `VoiceTimeIndex` is a compact `Vec<VoiceTimeEntry>` sorted by exact start time and semantic event ordinal. Point/range query uses binary search. Later insert/delete/duration work updates only the affected voice suffix; transaction mutation belongs to RKP-3.

### RKP2-R007 — Exact music-time arithmetic

RKP-2 ports canonical Fraction and NoteValue duration rules required for load and time indexing. Storage uses signed integer numerator and positive integer denominator; intermediate compare/add/multiply uses checked `i128`; accepted results must fit the current JavaScript safe-integer domain and be reduced canonically.

No float, tick, frame, wall-clock value or persisted event/note time field is introduced. Event owns duration; event start derives from its voice sequence. Notes share their owning event time and duration.

### RKP2-R008 — Atomic import

`KernelSession::create` performs this fixed sequence:

1. preserve RKP-1 descriptor-first capture, request byte cap, strict JSON/shape/API/schema decoding and failure precedence;
2. pre-count records, topology edges, reference edges, time entries and validation scratch space with checked arithmetic;
3. reserve fallible validation/build SlotMap/HashMap/Vec capacity before construction;
4. run deterministic full Foundation semantic validation required for a valid live store;
5. build all records, topology and derived indices in canonical input order inside a private builder without ID scans;
6. run constant/linear local invariant checks over the private candidate;
7. publish exactly one revision-zero runtime/session only after the production checks pass.

Independent index rebuild and canonical export round-trip are mandatory RKP-2 verification paths exercised by Rust/Node tests and differential evidence. They are not repeated on every release-mode session creation; this preserves linear proof without adding a second full build/encode to normal file open.

Any rejection drops the private builder and publishes zero session/Node handle. There is no partially readable store.

### RKP2-R009 — Full-validation scope and stable failure mapping

RKP-2 completes Foundation load validation for all current Core invariants needed by the store: global IDs, metadata tempo, measure/meter/pickup, canonical fractions, transposition, staves, measure coverage, voice/event/note references and values, exact sequence bounds/arithmetic, written/sounding pitch, extension namespace/version/owner/uniqueness and object payload.

The public stable failure union remains exactly 22 variants. Semantic load failures map only to existing `score.invalid-structure`:

- duplicate ID -> `duplicate-id` at the later ID path;
- missing, duplicate or inconsistent structural reference/coverage -> `invalid-reference`;
- other semantic value/arithmetic/namespace/payload violations -> `invalid-value`.

Canonical first-failure order is document ID/metadata, measures in input order, parts and descendants in input order, then extensions in input order. Within one record, `design.md` fixes field order. An impossible builder/index/export parity failure maps to existing `bridge.internal` and publishes no session. No raw Rust error or allocation detail crosses the bridge.

### RKP2-R010 — Deterministic export

`LiveScoreStore::export_document` reconstructs a detached `ScoreDocumentV1` from records and topology. It must satisfy:

```text
input DTO == exported DTO
canonical(input) == canonical(exported)
canonical(exported) == canonical(decode(canonical(exported)))
read #1 bytes == read #2 bytes
```

Unknown ExtensionBlock namespaces, schema versions, owners and bounded JSON payload values are preserved losslessly. Payload object ordering remains the Foundation `BTreeMap` canonical order. Export does not expose handles or indices.

### RKP2-R011 — Index parity

The implementation provides a private `rebuild_indices_from_store` path. It rebuilds over the same accepted records/topology, normalizes handles to stable IDs/addresses, and compares:

- entity lookup;
- ownership;
- ordered structural edges;
- part/measure content lookup;
- voice exact start/end entries;
- extension lookup;
- Core reference dependency edges.

A test-only perturbation must make parity fail, proving the comparison is effective. Production import performs local handle/count/edge invariants before publication; the independent full rebuild is an explicit test/differential verification path rather than a hidden second production index build.

### RKP2-R012 — Reference boundary

The RKP-2 reference index covers only declared Core structural references:

- PartMeasureContent -> Measure;
- Voice.defaultStaffId -> Staff;
- Event.staffId -> Staff;
- Extension owner.partId -> Part.

Opaque ExtensionBlock payload strings are not inferred as EntityId references. Versioned plugin-declared payload references enter RKP-5/RKP-6 through Extension Protocol contracts.

### RKP2-R013 — Public compatibility freeze

RKP-2 preserves:

- `brilliant-score-1` DTO field/tag shapes and canonical serialization;
- 28 TypeScript Core command IDs and TypeScript default runtime;
- 51 application runtime exports;
- Module SDK 8 runtime / 34 type exports and nine-field contribution ABI;
- exactly two private Node free-function exports;
- 22 stable native failure variants/codes;
- revision 0, history `0/0`, dirty false create/read behavior;
- 64 MiB request/response caps, JSON depth 64, JSON property cap 1,048,576 and safe-integer rules;
- Node handle ownership/thread/reentrancy/finalizer behavior.

There is zero source change under `src/**`, and zero public Node function addition.

### RKP2-R014 — Resource and liveness evidence

The builder uses checked counts and fallible reserve APIs where provided. It introduces no lower document/entity cap than the already accepted 64 MiB/property/safe-number boundary. Reservation or internal consistency failure rejects creation through `bridge.internal`; response overflow retains the existing `bridge.response-too-large` behavior while the session remains valid.

Representative and 102,400-event stress fixtures must complete load/index/export in a bounded diagnostic worker. RKP-2 uses structural counters and a 180-second liveness guard, not a product latency pass budget. RKP-7 owns blocking latency/RSS qualification and RKP-9 owns Qualification V2.

Required counters for tests/evidence are private and data-only: entities visited, topology edges visited, reference edges built, entity lookups, owner lookups, time-index comparisons, index entries built, full DTO materializations and canonical encode bytes. Import and export counts must demonstrate linear traversal; ordinary edit counters begin in RKP-3.

### RKP2-R015 — Stale-handle and type guarantees

Runtime unit tests remove and reinsert records only through private/test-only store fixtures. The old typed key must fail lookup after reuse and the new generation must differ. Distinct handle types are compiler-enforced; no production mutation API or Node test hook is exported in RKP-2.

### RKP2-R016 — Stage isolation

Implementation is split into six independently revertible commits after a separate activation/status commit:

1. exact dependency/contract tests;
2. Foundation arithmetic and load validation;
3. typed records/topology and atomic private import;
4. derived indices, time query and rebuild parity;
5. deterministic export plus Runtime/Session integration;
6. hostile/resource/large-fixture evidence and lifecycle status.

Each stage runs its focused Rust tests before the next. The full Rust and TypeScript gates run before independent implementation audit.

### RKP2-R017 — Exact implementation ownership

Future production/test/config edits are restricted to the literal allowlist in `design.md` and `research/file-test-and-rollback-matrix.md`. Node source, Contracts DTOs, Core Types, Extension Protocol, TypeScript production, package/tsconfig, active specs and product/plugin paths are protected zero-delta paths.

A newly required production path, dependency or public contract returns to planning review before it is edited.

### RKP2-R018 — Downstream boundary

RKP-2 supplies storage and read-only import/export/query primitives only. RKP-3 owns overlay/ChangeSet and 28 command ports. RKP-4 owns history/snapshot cache/selectors/events/replay. RKP-5 owns incremental validation and Extension Protocol execution. RKP-6 owns composition and equal instrument-plugin consumers. RKP-7 owns complete differential/performance gates. RKP-8 owns one-step default cutover. RKP-9 owns Qualification V2 and legacy engine cleanup.

## Planning-candidate acceptance

- Every identity, container, topology, index, query and failure owner is explicit.
- Slotmap version/features and voice-time structure are fixed.
- Load, validation, index rebuild, export and publication order are executable without design invention.
- Planning and future implementation allowlists are literal.
- RKP-1 post-archive repair is an activation gate, not silently absorbed.
- Trellis/JSON/JSONL/unique-child/diff checks pass.
- Rust fmt/check/test/clippy and TypeScript typecheck/build are recorded.
- Any known base test failure is reproduced and attributed to the separate RKP-1 post-archive repair; the planning candidate does not claim a false green baseline.
- Relative delta under production/test/Cargo/package/tsconfig paths is zero.
- Independent planning audit returns P0/P1/P2=`0/0/0` before implementation authorization.

## Future implementation exit criteria

- The activation base contains the accepted/archived RKP-1 post-archive repair and passes its focused workspace test.
- All six implementation stages and their focused tests pass.
- Rust 1.97.1 fmt/check/test/clippy and MSRV 1.88.0 locked check pass.
- Node bridge tests retain exact two exports and 22 failures.
- TypeScript typecheck/build/full baseline reports zero unexpected failures.
- Valid oracle documents round-trip canonically; invalid fixtures reject deterministically; unknown extensions are lossless.
- Entity/owner/part-content/time queries satisfy structural complexity counters.
- Incrementally built and independently rebuilt normalized indices are equal.
- Representative and stress workers complete inside the diagnostic liveness guard without changing final product budgets.
- TypeScript remains default; no command cutover or official qualification occurs.
- Independent implementation audit returns P0/P1/P2=`0/0/0` before acceptance/archive.

## Out of scope

- command handlers, routing, target mutation, TransactionOverlay, ChangeSet or batch;
- history, undo, redo, checkpoint, dirty mutation, event publication or replay;
- selector API, snapshot caching or background reads;
- incremental validation or provider callbacks;
- Extension Protocol/WASM/catalog/inventory/composition/migration execution;
- Guitar, Piano, Bass or any privileged instrument path;
- Persistence package, Layout, Renderer, Playback, Export, Workbench, Tauri or public plugin host;
- default-runtime switch, TypeScript engine removal, CVN-7 rerun or official qualification;
- Score schema V2, entity-owned ExtensionBlock, persistent ticks, time fields or handle serialization.
