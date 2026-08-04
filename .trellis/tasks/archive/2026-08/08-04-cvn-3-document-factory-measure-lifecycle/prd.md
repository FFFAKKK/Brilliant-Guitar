# CVN-3 Document Factory and Measure Lifecycle

> **Lifecycle:** ACTIVE / USER EXECUTION APPROVED 2026-08-04 / OPERATOR READY
> **Branch:** `codex/cvn-3-document-factory-measure-lifecycle`
> **Base:** `codex/cvn-1-command-transaction-registry-spine` at `d936d58195803ef938214948b21e89fe67939090`
> **Parent:** `07-29-core-vnext-product-ready-extensible-kernel-completion`
> **Owned parent contracts:** CVN-FC-010/011/020/021/030/031/041/050-053/100-102/140/142

## 1. Goal and user value

CVN-3 adds the first complete Core-owned score-structure workflow on top of the accepted CVN-1 transaction spine:

1. create a valid score deterministically from explicit caller data;
2. insert one Measure across the global definition list and every Part;
3. remove one Measure with its complete Voice/Event/Note aggregate;
4. move one Measure while keeping every Part aligned;
5. change one Measure's meter and pickup safely.

After this gate, application/UI code can build “New Score”, “Add Measure”, “Delete Measure”, “Reorder Measure” and “Change Time Signature/Pickup” features without mutating `ScoreDocument` directly. Every changed command automatically participates in versioning, dirty state, checkpoint identity, undo, redo, replay, committed events, Registry discovery and support classification.

## 2. Authority and decision order

When two statements differ, use this order:

1. parent `feature-contract-matrix.md` CVN-FC rows listed above;
2. this PRD's requirements and acceptance criteria;
3. this task's `design.md` private mechanism;
4. this task's `implement.md` delivery order;
5. accepted active Core specs under `.trellis/spec/core-kernel/backend/`;
6. source/tests at the recorded base commit;
7. research notes.

Any proposed change to a public ID, target, payload, result discriminant, limit, failure priority or persisted field returns to parent planning before implementation continues.

### 2.1 Parent-contract trace table

| Parent row | Child requirement owner | Acceptance owner |
|---|---|---|
| `CVN-FC-010` | CVN3-R003 | CVN3-AC006/007/023 |
| `CVN-FC-011` | CVN3-R010 | CVN3-AC011/013/018/021/022 |
| `CVN-FC-020` | CVN3-R001/R002 | CVN3-AC001-004 |
| `CVN-FC-021` | CVN3-R001/R002 | CVN3-AC001-007 |
| `CVN-FC-030` | CVN3-R004 | CVN3-AC009/015/016 |
| `CVN-FC-031` | CVN3-R004/R007 | CVN3-AC015-018 |
| `CVN-FC-041` | CVN3-R013 | CVN3-AC008/025 |
| `CVN-FC-050` | CVN3-R005/R009 | CVN3-AC009-011 |
| `CVN-FC-051` | CVN3-R006/R009 | CVN3-AC012-014 |
| `CVN-FC-052` | CVN3-R007/R009 | CVN3-AC015-018 |
| `CVN-FC-053` | CVN3-R008 | CVN3-AC019-021 |
| `CVN-FC-100` | CVN3-R003/R004/R012 | CVN3-AC016/023 |
| `CVN-FC-101` | section 6 failure priority | CVN3-AC010/014/016/020/023 |
| `CVN-FC-102` | CVN3-R012 | CVN3-AC023/024 |
| `CVN-FC-140` | CVN3-R010-R013 | CVN3-AC022-024 |
| `CVN-FC-142` | CVN3-R001/R005-R009 | CVN3-AC001-021 |

## 3. Confirmed baseline and dependency

- CVN-1 is independently accepted and archived. Its six commands, one candidate/effect engine, history, replay, dirty/checkpoint and event behavior are the fixed compatibility base.
- CVN-3 depends only on accepted CVN-1 and is therefore dependency-satisfied.
- GD-0 remains an independent-acceptance candidate and is not an input to this Core-only child.
- Current public runtime surface has 48 names and current default Core catalog has six commands.
- Current persisted schema is `brilliant-score-1`; it already represents every CVN-3 result.
- Current full-test baseline is 193 tests; current command-internal baseline is 19 tests.
- No source or test implementation is authorized while this task remains `planning`.

## 4. Exact public additions

### 4.1 Factory

```ts
interface CreateScoreDocumentInputV1 {
  readonly factoryVersion: 1;
  readonly documentId: string;
  readonly metadata: ScoreMetadata;
  readonly initialMeasure: MeasureDefinition;
  readonly initialParts: readonly [InitialPartV1, ...InitialPartV1[]];
  readonly extensions: readonly ExtensionBlock[];
}

interface InitialPartV1 {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly [StaffDefinition, ...StaffDefinition[]];
  readonly voices: readonly [Voice, ...Voice[]];
}

type CreateScoreDocumentResult =
  | {
      readonly status: "created";
      readonly document: ScoreDocument;
      readonly support: ScoreSupportResult;
    }
  | {
      readonly status: "rejected";
      readonly failure:
        | {
            readonly code: "factory.invalid-input";
            readonly diagnostics: readonly DecodeDiagnostic[];
          }
        | {
            readonly code: "factory.semantic-invalid";
            readonly diagnostics: readonly SemanticDiagnostic[];
          }
        | {
            readonly code: "factory.resource-limit-exceeded";
            readonly limitKind: "input-depth" | "input-properties";
            readonly limit: number;
            readonly actual: number;
          };
    };

createScoreDocument(input: unknown): CreateScoreDocumentResult;
```

Only `createScoreDocument` is a new runtime root export. The interfaces/unions are type exports. The expected runtime export count after CVN-3 is exactly **49**.

### 4.2 Measure anchor

```ts
type MeasureAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-measure"; readonly measureId: string };
```

### 4.3 Four command envelopes

| Append order | Command ID | Target | Exact payload |
|---:|---|---|---|
| 7 | `core.measure.insert` | `{ kind: "document"; documentId }` | `{ anchor, definition, contents }` per section 6 |
| 8 | `core.measure.remove` | `{ kind: "measure"; measureId }` | `{}` |
| 9 | `core.measure.move` | `{ kind: "measure"; measureId }` | `{ anchor: MeasureAnchor }` |
| 10 | `core.measure.set-definition` | `{ kind: "measure"; measureId }` | `{ meter, pickup }` per section 9 |

The first six catalog entries remain in their accepted order. The default catalog and Registry command contribution list contain exactly ten entries after this gate.

## 5. Requirements

### CVN3-R001 — Pure deterministic factory

- `createScoreDocument` is a pure function. It creates no bus, Registry, gateway, history entry, event or checkpoint.
- The output always uses `schemaVersion: "brilliant-score-1"`.
- The output contains exactly one initial Measure definition.
- Each `InitialPartV1` becomes one `Part` with exactly one generated `PartMeasureContent`; its `measureId` equals `initialMeasure.id` and its `voices` preserve caller order.
- Part order, Staff order, Voice order, Event order, Note order and extension-array order preserve the decoded caller order.
- IDs and all musical values come from the caller. The factory reads no clock, randomness, locale, environment, file system or process state.
- Repeating the same accepted input produces deeply equal document/support values.

### CVN3-R002 — Factory decode versus semantic versus profile separation

- Malformed shape, extra/missing fields, wrong union members, empty tuple-constrained arrays, non-dense arrays and hostile runtime values return `factory.invalid-input`.
- A shape-valid graph with invalid IDs, references, coverage, meter/pickup semantics, sequence bounds, extension owner/payload or global ID uniqueness returns `factory.semantic-invalid` with the Core semantic diagnostics.
- A semantic-valid graph outside `K1_SCORE_FEATURE_PROFILE` returns `status: "created"` with `support.status: "unsupported"`.
- Decode and semantic diagnostics are deterministic, detached and deeply frozen. Diagnostics are sorted by path and then code.

### CVN3-R003 — Shared bounded unknown boundary

The factory and all four new command envelopes use the CVN-FC-010 boundary:

- ordinary records have `Object.prototype` or `null` prototype;
- arrays are dense and use valid Array prototypes;
- values are read from own enumerable data descriptors only;
- symbol keys, accessors, sparse arrays, cycles, non-finite numbers and unsupported primitives are rejected;
- input getters, `get` traps, iterators, coercion hooks, `toJSON` and input methods are not invoked;
- a throwing reflection/Proxy operation becomes a stable data failure;
- root depth is `0`; maximum depth is `64`;
- property count includes record keys and array indices, excludes Array `length`, and stops at `1,048,577`;
- depth overrun returns `actual: 65`; property overrun returns `actual: 1_048_577`;
- accepted input is detached before typed decoding and deeply frozen before retention or return;
- shared acyclic containers are accepted and inspected once; active-path cycles are rejected;
- existing six commands retain their accepted V1 size behavior and are not retroactively subjected to these new caps.

### CVN3-R004 — Stable anchor behavior

- `start` means index `0` in the owning Measure list.
- `after-measure` is resolved by exact Measure ID in the original list.
- A globally missing anchor returns `command.anchor-not-found`.
- A move anchor equal to the target Measure returns `command.anchor-self-reference` after the target itself is confirmed to exist.
- Move resolves target and anchor before removal, removes the target, locates the anchor in the remaining list and inserts after it.
- Index, tick, slot, implicit current position, `before-*` and negative offsets are outside the contract.

### CVN3-R005 — Insert Measure contract

```ts
interface InsertMeasurePayloadV1 {
  readonly anchor: MeasureAnchor;
  readonly definition: MeasureDefinition;
  readonly contents: readonly [
    {
      readonly partId: string;
      readonly voices: readonly [Voice, ...Voice[]];
    },
    ...{
      readonly partId: string;
      readonly voices: readonly [Voice, ...Voice[]];
    }[],
  ];
}
```

- The target document must equal the active document.
- `contents` must cover every current Part exactly once.
- A referenced `partId` absent from the current document returns `command.target-not-found` before final semantics.
- Missing or duplicate coverage reaches final Core semantic validation and returns `command.semantic-invalid` with the existing coverage diagnostics.
- On a valid command, caller-shuffled `contents` is canonicalized to current Part order.
- The content `measureId` is generated from `definition.id`; it is not accepted in the payload.
- Within each Part, Voice/Event/Note order remains as supplied.
- New Measure, Voice, Event and Note IDs are checked by final global semantic validation; no ID is generated, trimmed, folded or renamed.
- Staff references must belong to the corresponding Part and each sequence must fit the new Measure.
- One commit inserts the definition and one content into every Part; any failure preserves the complete pre-state.

### CVN3-R006 — Remove Measure contract

- The target resolves to exactly one current Measure definition.
- One changed command removes the target definition and every Part's complete matching content aggregate.
- The owned aggregate includes all Voices, Events and Notes, preserving their values and order in the inverse.
- Removing the final Measure rejects with `command.semantic-invalid` and includes `semantic.measure-required`.
- Score-owned and Part-owned extension blocks remain deeply equal and in the same extension-array positions.
- Rejection, including last-Measure rejection, leaves document/version/history/redo/dirty/checkpoint/event state unchanged.

### CVN3-R007 — Move Measure contract

- Move changes no Measure, Voice, Event, Note or extension value.
- A changed move leaves `measureDefinitions` in the requested stable-ID order and every Part's `measureContents` in exactly the same Measure-ID order.
- On an already aligned document, moving to the current canonical position returns `no-op`.
- If a semantic-valid input document has shuffled per-Part Measure content order, a move normalizes all Part lists; it is a commit whenever final synchronized layout differs from the current layout.
- Undo restores the exact pre-command global and per-Part order, including a pre-existing shuffled Part order; redo reapplies the synchronized order.

### CVN3-R008 — Set Measure definition contract

```ts
interface SetMeasureDefinitionPayloadV1 {
  readonly meter: Meter;
  readonly pickup:
    | { readonly kind: "none" }
    | { readonly kind: "duration"; readonly duration: Fraction };
}
```

- Target Measure ID remains unchanged and is absent from the payload.
- `pickup.kind: "none"` removes `pickupDuration`; `duration` sets it exactly.
- Equal meter and pickup return `no-op`.
- A changed definition causes all Part sequences in that Measure to be revalidated.
- An overlong or out-of-bounds sequence rejects the whole command with `command.semantic-invalid`.
- A semantic-valid non-K1 meter or pickup commits and returns `support.status: "unsupported"`.

### CVN3-R009 — Synchronized structure invariant

- Factory output always aligns every Part's single content with the global Measure list.
- Every changed insert/remove/move result has exactly one content per Part per global Measure and identical global/per-Part Measure-ID order.
- The command does not depend on pre-state array indexes for identity; indexes are local calculations after stable-ID resolution.
- A semantic-valid but pre-shuffled Part list is normalized by changed structural commands without losing exact undo information.

### CVN3-R010 — Transaction, history and replay parity

For each changed command:

- candidate construction is isolated;
- document version increments by one after capacity preflight;
- exactly one undo entry is pushed and redo is cleared;
- dirty/checkpoint state follows the accepted CVN-1 rules;
- exactly one committed event is emitted, plus the accepted dirty-state event when dirty changes;
- undo moves one history entry and increments version once;
- redo moves the same entry back and increments version once;
- replay accepts only raw semantic envelopes and produces a deeply equal final document/version/result sequence;
- history stores frozen semantic command plus private forward/inverse effects, never a complete document snapshot.

For no-op/rejected commands, version/history/redo/dirty/checkpoint/events remain unchanged.

### CVN3-R011 — Canonical affected addresses

Affected addresses are detached, deeply frozen and ordered as follows:

- insert: target document, inserted Measure, then for each current Part in Part order: Part, new Voices in payload order, their Events in sequence order, and Notes in note order;
- remove: removed Measure, then for each current Part in Part order: Part, removed Voices, Events and Notes in their pre-removal order;
- move: moved Measure, then every Part in current Part order;
- set-definition: target Measure only.

Addresses are de-duplicated by exact address identity while preserving first occurrence. Undo and redo reuse the stored order.

### CVN3-R012 — Registry and Issue/Report integration

- The four IDs appear in the default Registry command contribution summary with `command:execute` capability.
- Exact title keys are:
  - `core.measure.insert` -> `core.command.insert-measure.title`;
  - `core.measure.remove` -> `core.command.remove-measure.title`;
  - `core.measure.move` -> `core.command.move-measure.title`;
  - `core.measure.set-definition` -> `core.command.set-measure-definition.title`.
- Gateway submission produces the same command result/state/event behavior as direct `CommandBus.submit` after capability authorization.
- `command.anchor-self-reference` maps to one privacy-safe command issue.
- `command.resource-limit-exceeded` maps to one command issue whose details are exactly `{ limitKind, limit, actual }`.
- No raw command payload, effect, extension payload, error, stack or absolute source path enters a failure, issue or event.

### CVN3-R013 — Additive compatibility

- Existing six command envelope, result, support, history, replay and event behavior remains byte-for-JSON equivalent under the CVN-1 projected characterization trace.
- The original CVN-1 expected trace file and accepted hash remain unchanged.
- The live additive surface is asserted separately: 49 runtime exports, ten command IDs, ten Registry command descriptors.
- Existing `decodeScoreDocument`, JSON round-trip, selectors, migration, Registry capability denial and public report adapters retain their prior behavior outside the explicit new additions.

### CVN3-R014 — Pure Core and private mechanism boundary

- Production code imports no Guitar, UI, renderer, audio, desktop shell, physical IO, network, third-party runtime or plugin lifecycle dependency.
- `brilliant-score-1` shape and schema version remain unchanged.
- There is one bus/history/replay/event owner.
- No public mutation/effect/history handle, generic setter, generic patch, JSON path, public splice, mutable document getter or whole-document replacement API is added.
- Private Measure effects may mutate only Measure definitions, per-Part Measure contents and the exact target definition value.
- Runtime registration, unload, replacement, reload and hot plug remain outside this child.

### CVN3-R015 — Reviewable delivery

- Characterization/projection, private strict-boundary refactor, factory, Measure structural effects/commands and documentation/acceptance evidence use separate reviewable commit boundaries.
- Implementation work begins only after the user approves these artifacts and the planner runs `task.py start`.
- An independent final review compares the complete child diff with base `d936d58195803ef938214948b21e89fe67939090` and records a verdict before CVN-4 becomes dependency-satisfied.

## 6. Failure priority for this child

For the four command paths, choose the first applicable failure in this order:

1. unreadable or invalid exact outer envelope;
2. unsupported `commandVersion`;
3. unknown command ID;
4. target-kind mismatch;
5. new-command payload shape or input resource limit;
6. target and Measure-anchor resolution (target first, then self-reference, then anchor);
7. Part/reference/effect preparation;
8. final Core semantic validation;
9. profile classification contract;
10. version/history/event capacity;
11. isolated internal error.

Factory priority is: strict capture resource over later schema diagnostics once a limit is crossed; otherwise capture/schema diagnostics, then semantic diagnostics, then support classification. A strict-capture invalidity observed before a limit becomes `factory.invalid-input`.

## 7. Explicit out of scope

- Part, Staff, Voice or Event lifecycle commands (CVN-4).
- Range delete/transpose and explicit atomic batch (CVN-5).
- Official-module SDK/catalog and integrated module runtime (CVN-2/CVN-6).
- Guitar semantics or Guitar extension interpretation.
- Note/chord lifecycle beyond the existing Event commands.
- New persisted fields, a new score schema version or migration.
- File creation/save/import/export, autosave policy, UI, rendering, playback and collaboration.
- Runtime command registration/hot plug.
- Generic document creation defaults, generated IDs, templates or implicit instrument choices.

## 8. Acceptance criteria

### Factory

- [x] **CVN3-AC001:** minimum one-Measure/one-Part/one-Staff/one-Voice input creates the exact `brilliant-score-1` document and detached support result.
- [x] **CVN3-AC002:** multi-Part input creates one canonical content per Part and returns `created` even when profile support is `unsupported`.
- [x] **CVN3-AC003:** exact field/union/tuple diagnostics cover extra fields, wrong version, empty initialParts/staves/voices, sparse arrays and non-finite/unsafe numeric fields.
- [x] **CVN3-AC004:** semantic cases cover empty/duplicate IDs, wrong Staff references, invalid sequence, invalid extension owner/payload, invalid meter/pickup and deterministic full diagnostics.
- [x] **CVN3-AC005:** repeated calls are deeply equal; caller mutation after return changes neither document nor support; all returned values are deeply frozen.
- [x] **CVN3-AC006:** getter/Proxy/accessor/symbol/sparse/cycle/coercion/toJSON fixtures return stable results with zero getter/`get`/method calls and no thrown exception.
- [x] **CVN3-AC007:** depth 64 versus 65 and property count 1,048,576 versus 1,048,577 return the exact non-resource/resource distinctions and values.

### Catalog and insert

- [x] **CVN3-AC008:** catalog order is the six accepted IDs followed by the four CVN-3 IDs with exact targets and title keys.
- [x] **CVN3-AC009:** valid shuffled-per-Part insert commits one synchronized Measure aggregate and preserves Voice/Event/Note order.
- [x] **CVN3-AC010:** insert covers missing/duplicate/extra Part references, duplicate entity IDs, wrong Staff references, invalid sequence, invalid anchor, wrong document and full rejection-state equality.
- [x] **CVN3-AC011:** insert undo/redo/replay exactly restores/reapplies encoded document, history, dirty/checkpoint and event/affected-address behavior.

### Remove

- [x] **CVN3-AC012:** valid remove deletes the exact Measure/Voice/Event/Note aggregate from global and all Part lists while preserving extensions.
- [x] **CVN3-AC013:** remove undo restores every value and original global/per-Part position; redo and replay match the live result.
- [x] **CVN3-AC014:** removing the final Measure returns `command.semantic-invalid` containing `semantic.measure-required` with complete pre/post state equality and zero events.

### Move

- [x] **CVN3-AC015:** start, forward and backward moves keep global and every Part order identical while all aggregate values remain deeply equal.
- [x] **CVN3-AC016:** self-reference, missing target, missing anchor and invalid anchor shapes return exact failures with unchanged state.
- [x] **CVN3-AC017:** already-positioned aligned move is no-op; a pre-shuffled valid Part layout is normalized by a changed move and undo restores the exact shuffled order.
- [x] **CVN3-AC018:** move undo/redo/replay and affected-address order are exact.

### Set definition

- [x] **CVN3-AC019:** meter/pickup set, pickup removal and exact no-op cases produce the required documents/results.
- [x] **CVN3-AC020:** a definition that makes any Part sequence invalid rejects atomically with exact semantic diagnostics.
- [x] **CVN3-AC021:** semantic-valid profile-unsupported meter/pickup commits with unsupported support; undo/redo/replay are exact.

### Cross-cutting compatibility and quality

- [x] **CVN3-AC022:** each of the four IDs independently covers valid, no-op where applicable, invalid/extra/wrong target, target/anchor/reference, semantic, exact before/after, undo, redo, replay, checkpoint/dirty/redo-clear/event, hostile input, caller mutation and extension preservation cases required by CVN-FC-140.
- [x] **CVN3-AC023:** new command depth/property resource failures and their Issue mappings contain only allowlisted code/limits.
- [x] **CVN3-AC024:** direct bus and capability-authorized gateway results/state/events are deeply equal for all four IDs; denial occurs before mutation.
- [x] **CVN3-AC025:** projected CVN-1 trace remains equal to its immutable expected fixture and accepted SHA-256; the additive surface is exactly 49 exports/10 commands/10 Registry command descriptors.
- [x] **CVN3-AC026:** typecheck, build, focused tests, full tests, `git diff --check`, forbidden-dependency scan and Trellis validation pass.
- [x] **CVN3-AC027:** no public/private whole-document replacement shortcut, no persisted schema change and no Guitar/module-runtime dependency appears in the full diff.
- [x] **CVN3-AC028:** independent final review reports no reproducible release-blocking finding and records the accepted source/test commit before archive.

> **Independent acceptance (2026-08-04):** CVN3-AC001 through CVN3-AC028 are
> accepted at source/test commit
> `d9500f5a8ac285071586ba8eda380370eafd022f`. The independent review reported
> P0/P1/P2 = `0/0/0`; typecheck, build, the 22-test lifecycle triad, the
> 233-test full suite, Trellis validation, candidate `git diff --check`, and
> the immutable CVN-1 SHA-256 gate all passed.

## 9. Planning completion and activation gate

Planning is ready for user review when all of the following are present:

- this converged PRD;
- `design.md` with fixed private contracts and algorithms;
- `implement.md` with ordered stages, commands, rollback and review gates;
- `research/current-measure-evidence.md`;
- real entries in both context manifests;
- `task.py validate` success;
- a clean planning-only diff outside the task/parent metadata.

After review approval, activation is one explicit planner action: run `task.py start 08-04-cvn-3-document-factory-measure-lifecycle`. Task creation and planning completion alone do not activate production implementation.
