# CVN-3 Document Factory and Measure Lifecycle Design

## 1. Status and design authority

This is the reviewed implementation design for the active CVN-3 child. Public behavior is owned by the parent CVN-FC rows and `prd.md`; this file fixes the private mechanism so the operator does not select a different architecture during execution.

The implementation remains on the accepted CVN-1 execution spine. It adds one pure factory, four command adapters and narrow Measure effects. It does not create another transaction coordinator or widen the persisted schema.

## 2. Design objectives

The design must satisfy five invariants simultaneously:

1. **Single source of truth:** `measureDefinitions` owns Measure order; every changed structural command leaves each Part's `measureContents` in that same ID order.
2. **Single transaction owner:** submit/undo/redo/replay/event behavior stays in the accepted CVN-1 runtime.
3. **Stable identity:** all public targeting and insertion use caller IDs plus `MeasureAnchor`, never persisted indexes.
4. **Exact inverse:** history stores narrow data/effect inverses sufficient to restore exact values and order, including an already-valid pre-shuffled Part list.
5. **Strict bounded boundary:** every new `unknown` entry is descriptor-first, detached and subject to exact depth/property limits without shrinking the six accepted V1 command inputs.

## 3. Frozen and mutable zones

### 3.1 Frozen public/persisted zone

- `brilliant-score-1` field names and meanings.
- Existing six command IDs, targets, payloads and results.
- `CommandBus.submit/undo/redo`, `replayCoreCommands`, snapshots/selectors, checkpoint/dirty and event shapes.
- Existing Registry/Gateway construction and capability checks.
- Existing public Issue/Report shapes.
- CVN-1 expected characterization JSON and its accepted hash.

### 3.2 Additive public zone

- `createScoreDocument` and its type contracts.
- `MeasureAnchor` and four command envelope union members.
- `command.anchor-self-reference`.
- staged `command.resource-limit-exceeded` with `input-depth | input-properties` for this child.
- four Registry command descriptors/title keys.

### 3.3 Private implementation zone

- bounded input capture and component decode helpers;
- Measure command adapters;
- Measure anchor/list helpers;
- Measure bundle/reorder/definition effects;
- CVN-1 trace projection helper;
- CVN-3 fixtures and test organization.

## 4. Required production file layout

The operator uses this layout. A path may be combined only when the resulting module remains private, has the same single responsibility and is recorded in the implementation evidence.

```text
src/core-kernel/
  codec/
    strict-input-capture.ts           # NEW: CVN-FC-010 bounded graph capture
    score-component-codec.ts          # NEW: reusable internal typed component decode
    decode-score-document.ts          # MOD: delegates component decoding; same public behavior
  factory/
    contracts.ts                      # NEW: factory public types only
    strict-codec.ts                   # NEW: exact factory input decode
    create-score-document.ts          # NEW: construct -> semantic -> classify -> freeze
  commands/
    catalog.ts                        # MOD: append four exact definitions
    contracts.ts                      # MOD: anchors/envelopes/failures
    strict-codec.ts                   # MOD: route legacy vs bounded VNext input
    core-command-adapters.ts          # MOD: six adapters remain behavior-identical
    measure-command-adapters.ts       # NEW: four decode/prepare adapters
    target-resolver.ts                # MOD: Measure anchor/list helpers
    effects.ts                        # MOD: narrow Measure effects
    execution-assembly.ts             # MOD: exact ten-adapter assembly
  registry/
    builtins.ts                       # MOD: four title keys/descriptors
  reports/
    strict-codec.ts                   # MOD: exact new failure decoding
    adapters.ts                       # MOD: resource detail mapping
  index.ts                            # MOD: factory function/types; one new runtime name
```

Expected test layout:

```text
test/core-kernel/
  cvn-3-strict-input.test.ts
  cvn-3-document-factory.test.ts
  cvn-3-measure-insert-remove.test.ts
  cvn-3-measure-move-definition.test.ts
  cvn-3-transaction-integration.test.ts
  cvn-3-public-surface.test.ts
  fixtures/
    cvn-3-score.ts
    cvn-3-surface.expected.json
  command-spine-characterization.test.ts       # projected V1 comparison
  fixtures/cvn-1-characterization.ts            # projection only; expected JSON unchanged
  command-internals.test.ts
  registry-contracts.test.ts
  reports.test.ts
  public-api-boundary.test.ts
  forbidden-dependency-boundary.test.ts
```

## 5. Bounded strict-input capture

### 5.1 Private result

```ts
type StrictInputLimitKind = "input-depth" | "input-properties";

type CaptureStrictInputResult =
  | { readonly status: "captured"; readonly value: unknown }
  | {
      readonly status: "invalid";
      readonly diagnostic: DecodeDiagnostic;
    }
  | {
      readonly status: "resource-limit-exceeded";
      readonly limitKind: StrictInputLimitKind;
      readonly limit: 64 | 1_048_576;
      readonly actual: 65 | 1_048_577;
    };

captureStrictInput(input: unknown): CaptureStrictInputResult;
```

The constants and helper remain private and are not re-exported by `src/core-kernel/index.ts`.

### 5.2 Traversal algorithm

Use an iterative descriptor traversal rather than recursion:

1. Push root at depth `0` with path `[]`.
2. Primitive `null | boolean | string | finite number` is copied directly.
3. Other primitives become `decode.json-value` at the current path.
4. For a container, verify ordinary-record or dense-Array shape through captured reflection/Array primordials.
5. Before following a property edge, calculate child depth. Depth `65` returns the exact depth resource result before reading that child descriptor.
6. Increment the unique-container property counter for each record key/array index. Count `1,048,577` returns the exact property resource result before reading that descriptor. Array `length` is structural metadata and is excluded.
7. Read only an own enumerable data descriptor. An accessor/non-enumerable/unreadable descriptor returns stable invalid input; ordinary property access is absent.
8. Track the active DFS path to reject cycles. Track completed input containers in a `WeakMap<input, clone>` so a shared acyclic container is inspected once and its cloned alias is reused.
9. Check depth on every reference edge even when the referenced container was completed earlier; a shared value reachable at depth `65` still exceeds the graph-depth contract.
10. Build only fresh records/arrays. No input prototype, descriptor, iterator or method is retained.
11. Complete capture inside one total exception boundary.

Typed exact-record decoders consume the safe captured graph in their declared field order. Unknown extension JSON object keys preserve their captured `Reflect.ownKeys` string order; diagnostic output is sorted after decoding.

### 5.3 Stable invalid mapping

| Observed condition | Diagnostic |
|---|---|
| reflection/Proxy operation throws, unreadable/accessor descriptor | `decode.unreadable-input` at the current/property path |
| symbol key | `decode.json-value`, details `{ reason: "symbol-key" }` |
| sparse/extra-key Array | `decode.json-value`, details `{ reason: "sparse-array" }` |
| active-path cycle | `decode.json-value`, details `{ reason: "cycle" }` |
| non-plain record/prototype | `decode.json-value`, details `{ reason: "non-plain-record" }` |
| `undefined`, function, bigint or symbol value | `decode.json-value`, details `{ reason: "unsupported-value" }` |
| NaN or infinity | `decode.non-finite-number` |

The capture never invokes a `get` trap. `ownKeys`, `getPrototypeOf` and `getOwnPropertyDescriptor` traps may be observed because descriptor validation requires them; throws are contained.

### 5.4 Command routing without V1 shrinkage

`CoreCommandAdapter` gains a private field:

```ts
readonly inputBoundary: "legacy-v1" | "vnext-bounded-v1";
```

- The first six adapters are explicitly `legacy-v1` and continue through their accepted decoder.
- The four Measure adapters are `vnext-bounded-v1`.
- Outer envelope/version/ID/target-kind priority is resolved first with the accepted descriptor path.
- Once a new ID and correct target kind are known, the complete original envelope is captured with the VNext limits, then target/payload are decoded from the detached capture.
- Capture invalidity maps to `command.invalid-envelope`; a limit maps to `command.resource-limit-exceeded` with exact fields.

This ordering ensures wrong version/unknown ID/wrong target kind keeps its higher-priority result even when the unused payload is oversized.

## 6. Shared internal component codec

`score-component-codec.ts` extracts the current persisted-component decoding rules without adding a root export. It owns reusable exact decoders for:

- `Fraction`, `Meter`, `NoteValue`, `WrittenPitch`, `Transposition`;
- `ScoreMetadata`, `MeasureDefinition`, `InstrumentDescriptor`;
- `StaffDefinition`, `Voice`, `MusicSequence`, `RhythmicEvent`, `ScoreNote`;
- `ExtensionOwner`, `ExtensionBlock` and opaque JSON payload;
- arrays of these components.

Rules:

- Existing `decodeScoreDocument` delegates to these functions but retains its current result, path, diagnostic and hostile-input behavior.
- Factory/Measure decoders call the same component functions only after strict capture.
- Known records reject extra/missing fields.
- Optional `pickupDuration`, `timeModification` and `staffId` preserve presence semantics.
- Tuple-nonempty constraints are enforced by factory/command wrappers, not by the generic array decoder.
- Fields whose domain type is integer use safe-integer checks in new VNext wrappers. Finite non-integer numeric fields such as tempo remain permitted and are later semantically classified as today.
- No shared component decoder performs semantic validation or profile classification.

The extraction commit must leave the existing decode/JSON/migration test results unchanged before factory behavior is added.

## 7. Factory design

### 7.1 Decode order

`factory/strict-codec.ts` decodes in this fixed order:

1. `factoryVersion` (literal `1`);
2. `documentId` (string; empty remains a semantic concern);
3. `metadata`;
4. `initialMeasure`;
5. `initialParts`;
6. `extensions`.

Each `InitialPartV1` decodes fields in `id`, `name`, `instrument`, `staves`, `voices` order. `initialParts`, `staves` and `voices` reject length `0` with `decode.type` plus `{ expected: "non-empty-array" }` at the array path.

Factory-version mismatch uses `decode.union` at `['factoryVersion']`; there is no separate factory unsupported-version result.

### 7.2 Diagnostic ordering

After schema decode, sort diagnostics using:

1. compare paths segment-by-segment;
2. numeric segments compare numerically;
3. string segments compare by UTF-16 code unit;
4. a shorter otherwise-equal path sorts first;
5. equal paths sort by diagnostic code;
6. stable insertion order resolves fully equal items.

Apply the same sorter to factory semantic diagnostics. Existing non-factory API order is unchanged.

### 7.3 Construction pipeline

```text
unknown input
  -> bounded strict capture
  -> exact typed factory decode
  -> construct fresh ScoreDocument
       schemaVersion = brilliant-score-1
       measureDefinitions = [initialMeasure]
       parts = initialParts.map(part => ({
         id/name/instrument/staves,
         measureContents: [{ measureId: initialMeasure.id, voices }]
       }))
       extensions = decoded extensions
  -> validateScoreDocumentSemantics
  -> validateScoreFeatureProfile
  -> detach/deep-freeze complete result
```

If semantic validation fails, classification is skipped. A classifier `invalid` result after a successful semantic report is treated as an internal invariant and returned as `factory.semantic-invalid` using its frozen semantic diagnostics when present. The whole public call is total; an otherwise uncategorized exception returns `factory.invalid-input` with one root `decode.unreadable-input` diagnostic and no private exception data.

## 8. Catalog, contracts and assembly

Append to `CORE_COMMAND_DEFINITIONS` in this exact order:

```ts
{ commandId: "core.measure.insert", targetKind: "document" }
{ commandId: "core.measure.remove", targetKind: "measure" }
{ commandId: "core.measure.move", targetKind: "measure" }
{ commandId: "core.measure.set-definition", targetKind: "measure" }
```

`CoreCommandEnvelope` appends four named command types in the same order. `CommandFailure` appends:

```ts
| { readonly code: "command.anchor-self-reference" }
| {
    readonly code: "command.resource-limit-exceeded";
    readonly limitKind: "input-depth" | "input-properties";
    readonly limit: number;
    readonly actual: number;
  }
```

Later children may widen `limitKind`; CVN-3 returns only these two members.

`createCoreExecutionAssembly` validates all ten adapters, exact target kind, exact boundary class, uniqueness and no unknown definition. The source identity remains `core.commands/core.commands.v1`.

## 9. Measure target and anchor helpers

Add private helpers with no root export:

```ts
resolveMeasureAnchorInIds(
  ids: readonly string[],
  anchor: MeasureAnchor,
): { ok: true; insertionIndex: number } | { ok: false; failure: CommandFailure };

previousMeasureAnchor(
  ids: readonly string[],
  targetIndex: number,
): MeasureAnchor;

moveInsertionIndex(
  originalIds: readonly string[],
  targetId: string,
  anchor: MeasureAnchor,
): ...;
```

Public prepare order for move is exact:

1. resolve target Measure;
2. if `after-measure.measureId === target.measureId`, return self-reference;
3. resolve anchor in the original global list;
4. compute remaining-list insertion position;
5. calculate desired global IDs;
6. compare desired global and every Part content-ID list with current state to decide no-op versus changed.

For insert, resolve the public anchor before reference/semantic preparation. For private per-Part effects, a missing target/anchor after successful public prepare is an internal effect invariant rather than a new public owner failure.

## 10. Private Measure effect model

### 10.1 Private shapes

```ts
interface PartMeasureAnchor {
  readonly partId: string;
  readonly anchor: MeasureAnchor;
}

interface AnchoredPartMeasureContent extends PartMeasureAnchor {
  readonly content: PartMeasureContent;
}

type MeasureCoreEffect =
  | {
      readonly kind: "insert-measure-bundle";
      readonly documentId: string;
      readonly definitionAnchor: MeasureAnchor;
      readonly definition: MeasureDefinition;
      readonly contents: readonly AnchoredPartMeasureContent[];
    }
  | {
      readonly kind: "remove-measure-bundle";
      readonly documentId: string;
      readonly measureId: string;
    }
  | {
      readonly kind: "move-measure-bundle";
      readonly documentId: string;
      readonly measureId: string;
      readonly definitionAnchor: MeasureAnchor;
      readonly contentAnchors: readonly PartMeasureAnchor[];
    }
  | {
      readonly kind: "reorder-part-measure-contents";
      readonly documentId: string;
      readonly orders: readonly {
        readonly partId: string;
        readonly measureIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "replace-measure-definition";
      readonly documentId: string;
      readonly measureId: string;
      readonly value: MeasureDefinition;
    };
```

These join the private `CoreEffect` union. They are absent from root exports and persisted/replay input.

### 10.2 Common effect rules

- Verify `documentId` before any list mutation.
- Preflight every referenced Part, target, anchor, coverage count and payload invariant before mutating the candidate for that effect.
- Clone effect payload data before insertion/replacement.
- Operate only on the already-isolated candidate created once by `applyCoreEffectSet`.
- Derive each inverse against the current evolving candidate, then reverse the inverse list as accepted by CVN-1.
- Internal effect mismatch returns `command.internal-error`; undo/redo translates it through the accepted history invariant path.

### 10.3 Insert effect and inverse

Forward apply:

1. resolve `definitionAnchor` in current global IDs;
2. validate every content entry references an existing Part and `content.measureId === definition.id`;
3. resolve each per-Part anchor in that Part's current content IDs;
4. insert the definition;
5. insert each content in entry order.

Inverse is one `remove-measure-bundle` for the inserted ID. The adapter preflights a duplicate Measure definition ID and returns semantic invalidity before creating the effect; therefore the inverse always removes exactly the inserted global definition. Descendant duplicate IDs may reach final semantic validation because removing the unique new Measure bundle still yields an exact inverse.

### 10.4 Remove effect and inverse

Before removal, require exactly one definition and exactly one matching content in every current Part. Derive inverse as `insert-measure-bundle` with:

- the removed definition;
- its exact previous global anchor;
- every removed full `PartMeasureContent` in current Part order;
- each content's exact previous anchor in its own Part list.

Apply then removes one definition and one matching content from every Part. Values outside the aggregate, including extensions, are untouched.

### 10.5 Move effect and inverse

The public forward effect uses the requested anchor for the definition and for every Part content. The inverse records the exact previous anchor separately for the definition and for each Part, because a semantic-valid pre-state may have shuffled Part content order.

For every list: validate target and anchor in the original list, remove target, resolve the anchor in the remaining list and insert. Self-reference is rejected in adapter preparation, so it never reaches effect application.

### 10.6 Reorder effect and inverse

`reorder-part-measure-contents` stores only ID orders, not complete content snapshots.

- `orders` must cover every current Part exactly once in Part order.
- Each requested ID list must be a permutation of that Part's current content IDs and equal the current global Measure ID set.
- Apply rebuilds each Part array by ID lookup while retaining the exact content objects/values from the candidate clone.
- Inverse is the same effect kind carrying each Part's pre-effect ID order.

The adapter appends this effect only when a changed insert/remove/move would otherwise leave any Part order different from the resulting global order. On already aligned documents, the primary bundle effect remains the sole effect.

### 10.7 Replace definition effect and inverse

- Resolve exactly one target Measure.
- Require `value.id === measureId`.
- Replace that one definition while preserving its array position.
- Inverse is the same effect with the complete previous definition.

No effect replaces `ScoreDocument` or an entire Part aggregate.

## 11. Command adapter algorithms

### 11.1 Insert

Decode exact payload, require nonempty `contents` and nonempty `voices`, then:

1. resolve target document and global anchor;
2. reject the first caller-order `partId` not present in current Parts with `target-not-found`;
3. calculate coverage counts for every current Part;
4. preflight duplicate `definition.id` by calculating the candidate definition path and return `command.semantic-invalid/semantic.id-duplicate`;
5. preserve missing/duplicate current-Part entries in the primary insert candidate so final semantics produces coverage diagnostics;
6. when coverage is exact, sort entries into current Part order and generate `PartMeasureContent` with `measureId = definition.id`;
7. prepare `insert-measure-bundle` with per-list anchors equal to the public anchor;
8. append reorder effect only if the predicted post-insert Part orders differ from predicted global order;
9. prepare canonical affected addresses from decoded data.

Invalid coverage never commits. Exact coverage is canonicalized independent of caller entry order.

### 11.2 Remove

1. decode exact empty payload;
2. resolve target definition;
3. resolve exactly one matching content in every Part;
4. collect affected addresses from target/aggregate pre-state;
5. prepare one `remove-measure-bundle`;
6. append reorder effect if remaining Part ID order would differ from remaining global order;
7. let final Core semantics produce `semantic.measure-required` for last-Measure removal.

### 11.3 Move

1. decode exact anchor payload;
2. apply the target/self/anchor order from section 9;
3. compute desired global order;
4. if desired global order equals current and every Part already equals it, return no-op;
5. prepare one `move-measure-bundle` with the public anchor for all lists;
6. append one reorder effect when any predicted Part order differs from desired global order;
7. affected addresses are target Measure followed by all Parts.

### 11.4 Set definition

1. decode exact meter and explicit pickup union;
2. resolve target Measure;
3. construct a full replacement definition using the existing target ID;
4. compare numerator, denominator and pickup presence/numerator/denominator;
5. return no-op when equal;
6. otherwise prepare one `replace-measure-definition` and Measure-only affected address;
7. final Core validation checks pickup and every sequence; profile classification occurs only after semantic success.

## 12. Canonical affected-address construction

Use one private append-if-new helper keyed by a canonical string for each `ScoreAddress` variant. Do not sort lexicographically after construction; preserve the PRD traversal order.

For insert/remove aggregate traversal:

```text
command target / Measure
for part in document.parts order:
  Part
  for voice in content.voices order:
    Voice
    for event in voice.sequence.events order:
      Event
      for note in notes-content order:
        Note
```

PartMeasureContent has no `ScoreAddress` variant, so Part + Measure addresses represent its structural boundary. No synthetic address kind is added.

## 13. Transaction pipeline integration

The accepted `submitCommand` order remains:

```text
strict route/decode
  -> adapter prepare/no-op
  -> version/history preflight
  -> one candidate clone + ordered effects + inverse
  -> full Core semantic validation
  -> Core profile classification
  -> history/event candidate
  -> one atomic state adoption
  -> isolated subscriber dispatch
```

Factory does not enter this pipeline. Four Measure commands enter it exactly like the six existing adapters. Replay routes raw Measure envelopes through the same default assembly. Undo/redo use stored effects and revalidate; they do not call command decoders again.

## 14. Registry and report integration

### 14.1 Registry

Extend `COMMAND_TITLE_KEYS` with the four PRD keys. `CORE_COMMAND_CONTRIBUTIONS` continues deriving descriptors from `DEFAULT_CORE_EXECUTION_ASSEMBLY`; no second registration entry or runtime register API is added.

Registry summary order remains its accepted canonical order. Tests assert the set and exact descriptor values rather than relying on source insertion order when Registry already sorts them.

### 14.2 Failure decoder

`reports/strict-codec.ts` must distinguish:

- exact `{ code: "command.anchor-self-reference" }`;
- exact resource record `{ code, limitKind, limit, actual }` with allowlisted kind and nonnegative safe-integer limit/actual;
- extra/missing/unsafe fields return report invalid-input as today.

### 14.3 Issue mapping

- self-reference maps to one code-only command issue;
- resource limit maps to one command issue with exact cloned/frozen details;
- semantic failure continues to map the operation issue followed by mapped semantic diagnostics;
- private input/effect/payload/path/exception data is omitted.

## 15. CVN-1 characterization and additive surface

The historical expected JSON stays unchanged.

Add a test-only projection used by `collectCvn1CharacterizationTrace`:

- runtime exports: retain only the original 48-name allowlist;
- catalog: retain only the original six command IDs in original order;
- Registry summaries inside the trace: remove only the four CVN-3 command descriptors; retain all six old commands, selectors, modules and capability results;
- command/history/replay/event/document data is not projected or rewritten.

The projected serialization must retain SHA-256 `CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9`.

A separate CVN-3 surface fixture asserts:

- root runtime names = original 48 plus `createScoreDocument`;
- catalog = six old plus four exact Measure entries;
- Registry = ten exact command descriptors and existing selectors;
- internal factory/codec/effect/assembly helpers remain absent from root exports.

## 16. Test fixture design

`fixtures/cvn-3-score.ts` provides fresh clone functions for:

1. minimum one-Part/one-Measure supported score;
2. semantic-valid two-Part score (profile unsupported);
3. three-Measure/two-Part aligned score;
4. same score with one or both Part content arrays shuffled while coverage remains valid;
5. deep score-owned and Part-owned opaque extensions;
6. complete and incomplete sequences;
7. pickup and non-4/4 semantic-valid cases.

Every factory/command test obtains a fresh clone. Tests do not mutate shared constants. IDs encode entity/Part/Measure ownership so expected order remains readable.

Resource fixtures are generated programmatically:

- depth fixture places a nested captured value at exactly 64 and 65;
- property fixture calculates fixed envelope overhead and fills one dense expected array so total counted own properties are exactly 1,048,576 or 1,048,577;
- the exact-boundary fixture may end in an ordinary shape failure after capture; the assertion is specifically “not resource-limit,” while boundary+1 must be the exact resource result.

## 17. Performance and allocation rules

- Strict capture is iterative and O(unique containers + counted properties).
- A shared DAG container is captured once; no retained cache survives the call.
- Command effect application clones the document once per attempted changed transaction, matching CVN-1.
- Valid aligned insert/remove/move and set-definition use one forward effect; a pre-shuffled layout uses one additional reorder effect.
- Measure removal history stores only removed aggregate data/anchors; move history stores anchors/order IDs; set-definition stores one prior definition.
- No full-document history snapshot, per-effect full clone or cross-commit mutable index is introduced.
- Transaction-local maps by entity/measure/part ID are permitted and discarded before return.

## 18. Compatibility and migration

- Existing documents require no migration.
- Existing semantic-valid documents with shuffled Part content order remain loadable; changed CVN-3 structural commands normalize them and exact undo restores pre-state.
- Unknown extensions remain opaque and deeply equal.
- A semantic-valid/profile-unsupported result remains writable and reportable under current Core-only rules.
- Future CVN-4 consumes the synchronized Measure structure and shared component codec; CVN-3 adds no CVN-4 command in advance.
- Future CVN-5 may compose the same effects in a batch; private inverse contracts must remain exact on an evolving candidate.

## 19. Rollback design

Rollback is additive and schema-free:

1. remove factory root export and `factory/` modules;
2. remove four command definitions/types/adapters/title keys;
3. remove Measure effect variants/helpers;
4. remove staged failure decoder/mapping additions;
5. remove CVN-3 fixtures/tests and restore the CVN-1 collector's pre-CVN-3 complete-surface behavior if the additive surface is absent;
6. keep existing documents and six-command history/replay format unchanged.

No data migration or user-document rewrite is part of rollback.

## 20. Stop conditions requiring planner review

Pause execution and return to this planning task if any implementation requires:

- a new persisted field/schema version;
- a public patch, JSON path, whole-document replacement or mutable document handle;
- generated IDs or implicit factory defaults;
- a second bus/history/replay/event coordinator;
- a Guitar or official-module runtime import;
- a fifth CVN-3 command or changed public target/payload;
- a resource cap/failure priority different from the parent matrix;
- weakening/removing the original CVN-1 behavior assertions;
- storing a complete document snapshot in history;
- treating profile unsupported as semantic rejection.
