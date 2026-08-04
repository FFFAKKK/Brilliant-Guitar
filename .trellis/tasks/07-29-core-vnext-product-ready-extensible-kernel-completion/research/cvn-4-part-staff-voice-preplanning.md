# CVN-4 Part, Staff, Voice and Event Lifecycle Preplanning

> **Lifecycle:** CONDITIONAL PREPLANNING COMPLETE / CVN-3 INDEPENDENT ACCEPTANCE REQUIRED / FORMAL CHILD NOT CREATED / TASK NOT ACTIVATED.
> **Snapshot:** 2026-08-04.
> **Candidate input inspected:** CVN-3 source/test candidate `d9500f5a8ac285071586ba8eda380370eafd022f`.
> **Planned formal title:** `CVN-4 Part Staff Voice Lifecycle`.
> **Planned formal slug:** `cvn-4-part-staff-voice-lifecycle`.

## 1. Purpose of This Preplan

This file removes implementation-choice ambiguity before formal CVN-4 task creation. It fixes the intended public contracts, private mechanism, file surfaces, execution order, test matrix, acceptance criteria, rollback and stop conditions using the parent contract and current CVN-3 candidate evidence.

This is deliberately not a second active Trellis child. Formal task creation, branch creation and `task.py start` occur only after:

1. CVN-3 independent review passes;
2. any CVN-3 findings are repaired and re-reviewed;
3. CVN-3 acceptance and archive evidence are recorded;
4. the user directs the planner to create the CVN-4 child;
5. the formal CVN-4 PRD/design/implement package is reviewed;
6. the user separately approves CVN-4 execution.

## 2. Goal and Product Value

CVN-4 completes the generic hierarchy-editing layer already representable by `brilliant-score-1`:

1. insert, remove, reorder and update Parts;
2. insert, remove, reorder and update Staff definitions;
3. insert, remove, reorder and update Voices inside one Part/Measure owner;
4. explicitly assign an Event to a Staff or restore inheritance from its Voice default;
5. preserve exact ownership, references, extension blocks, inverse data, history, replay and events.

After acceptance, application/UI code can implement:

- Add/Delete/Reorder Instrument or Part;
- Rename Part and change its instrument/transposition descriptor;
- Add/Delete/Reorder Staff and change line-count/clef definition;
- Add/Delete/Reorder Voice in a selected Measure;
- change a Voice's default Staff and exact sequence start;
- assign an Event to a specific Staff or inherit the Voice default;
- undo, redo and replay all of the above through the existing CommandBus.

The benefit is structural completeness without direct `ScoreDocument` mutation. UI and future Guitar modules consume stable commands instead of maintaining separate ownership, cascade and history logic.

## 3. Authority and Dependency Order

Use this authority order:

1. accepted CVN-1 behavior and accepted CVN-3 behavior after its final review;
2. parent `feature-contract-matrix.md`, especially `CVN-FC-030/031`, `041`, `060–070`, `100–102`, `140/142`;
3. parent PRD decisions `CVN-D006–009` and requirement `CVN-R004`;
4. active Core specs after CVN-3 acceptance;
5. the formal CVN-4 PRD/design/implement derived from this file;
6. this conditional preplan;
7. historical archives.

CVN-4 depends on accepted CVN-1 and accepted CVN-3. It has no GD-0, CVN-2, official-module runtime or Guitar dependency. CVN-5 consumes CVN-4 later, so CVN-4 must expose exact standalone command semantics that also compose safely in a later batch.

## 4. Fixed Completion Surface

CVN-4 adds exactly fifteen Core command IDs:

- five Part commands;
- four Staff commands;
- five Voice commands;
- one Event staff-assignment command.

Final counts after CVN-4:

- root runtime exports: exactly `49`;
- Core command catalog: exactly `25`;
- Registry command descriptors: exactly `25`;
- persisted schema version: `brilliant-score-1`;
- new public runtime functions: zero;
- new public target kinds: zero;
- new public address kinds: zero;
- new public submit methods: zero.

Type exports grow through the existing `commands/contracts.ts` root export. Private effects, target ownership records, codecs and helpers remain absent from `src/core-kernel/index.ts`.

## 5. Exact Public Anchors and Payloads

```typescript
type PartAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-part"; readonly partId: string };

type StaffAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-staff"; readonly staffId: string };

type VoiceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-voice"; readonly voiceId: string };

interface InsertPartPayloadV1 {
  readonly anchor: PartAnchor;
  readonly part: Part;
}

interface MovePartPayloadV1 {
  readonly anchor: PartAnchor;
}

interface SetPartNamePayloadV1 {
  readonly name: string;
}

interface SetPartInstrumentPayloadV1 {
  readonly instrument: InstrumentDescriptor;
}

interface InsertStaffPayloadV1 {
  readonly anchor: StaffAnchor;
  readonly staff: StaffDefinition;
}

interface MoveStaffPayloadV1 {
  readonly anchor: StaffAnchor;
}

interface SetStaffDefinitionPayloadV1 {
  readonly lineCount: number;
  readonly defaultClef: Clef;
}

interface InsertVoicePayloadV1 {
  readonly measureId: string;
  readonly anchor: VoiceAnchor;
  readonly voice: Voice;
}

interface MoveVoicePayloadV1 {
  readonly anchor: VoiceAnchor;
}

interface SetVoiceDefaultStaffPayloadV1 {
  readonly staffId: string;
}

interface SetVoiceSequenceStartPayloadV1 {
  readonly start: Fraction;
}

interface SetEventStaffAssignmentPayloadV1 {
  readonly assignment:
    | { readonly kind: "inherit-default" }
    | { readonly kind: "staff"; readonly staffId: string };
}
```

Remove commands use exact empty payloads `Record<string, never>`.

The exact command envelope additions are:

| Order after current ten | Command ID | Target | Payload |
|---:|---|---|---|
| 11 | `core.part.insert` | document | `InsertPartPayloadV1` |
| 12 | `core.part.remove` | part | `{}` |
| 13 | `core.part.move` | part | `MovePartPayloadV1` |
| 14 | `core.part.set-name` | part | `SetPartNamePayloadV1` |
| 15 | `core.part.set-instrument` | part | `SetPartInstrumentPayloadV1` |
| 16 | `core.staff.insert` | part | `InsertStaffPayloadV1` |
| 17 | `core.staff.remove` | staff | `{}` |
| 18 | `core.staff.move` | staff | `MoveStaffPayloadV1` |
| 19 | `core.staff.set-definition` | staff | `SetStaffDefinitionPayloadV1` |
| 20 | `core.voice.insert` | part | `InsertVoicePayloadV1` |
| 21 | `core.voice.remove` | voice | `{}` |
| 22 | `core.voice.move` | voice | `MoveVoicePayloadV1` |
| 23 | `core.voice.set-default-staff` | voice | `SetVoiceDefaultStaffPayloadV1` |
| 24 | `core.voice.set-sequence-start` | voice | `SetVoiceSequenceStartPayloadV1` |
| 25 | `core.event.set-staff-assignment` | event | `SetEventStaffAssignmentPayloadV1` |

Every envelope uses `commandVersion: 1`. No alias, generic setter, property bag, index target, `before-*` anchor, cascade flag or reassign flag is added.

## 6. Exact Registry Descriptors

All fifteen descriptors use:

- `sourceModuleId: "core.commands"`;
- `apiVersion: 1`;
- `requiredCapabilities: ["command:execute"]`;
- the target kinds in section 5.

Exact title keys:

| Command ID | Title key |
|---|---|
| `core.part.insert` | `core.command.insert-part.title` |
| `core.part.remove` | `core.command.remove-part.title` |
| `core.part.move` | `core.command.move-part.title` |
| `core.part.set-name` | `core.command.set-part-name.title` |
| `core.part.set-instrument` | `core.command.set-part-instrument.title` |
| `core.staff.insert` | `core.command.insert-staff.title` |
| `core.staff.remove` | `core.command.remove-staff.title` |
| `core.staff.move` | `core.command.move-staff.title` |
| `core.staff.set-definition` | `core.command.set-staff-definition.title` |
| `core.voice.insert` | `core.command.insert-voice.title` |
| `core.voice.remove` | `core.command.remove-voice.title` |
| `core.voice.move` | `core.command.move-voice.title` |
| `core.voice.set-default-staff` | `core.command.set-voice-default-staff.title` |
| `core.voice.set-sequence-start` | `core.command.set-voice-sequence-start.title` |
| `core.event.set-staff-assignment` | `core.command.set-event-staff-assignment.title` |

Registry summary order remains its accepted deterministic descriptor ordering; the command catalog itself uses the exact append order above.

## 7. Strict Input Boundary

All fifteen commands use `inputBoundary: "vnext-bounded-v1"`.

The decode pipeline remains:

1. descriptor-first outer envelope inspection;
2. safe integer `commandVersion` check;
3. known command ID lookup;
4. target kind comparison;
5. full strict capture of the envelope;
6. maximum depth `64` and own data properties `1,048,576`;
7. exact cloned/frozen typed decode;
8. target/owner/anchor preparation;
9. isolated candidate application;
10. final semantic validation and support classification.

CVN-4 reuses `ScoreComponentDecodeContext(true)` and existing decoders for `Part`, `InstrumentDescriptor`, `StaffDefinition`, `Clef`, `Voice` and `Fraction`.

Every record has exact required keys. Extra fields at the envelope, target, payload, anchor, assignment or nested component level return `command.invalid-envelope`. Sparse arrays, accessor properties, symbol keys, cycles, hostile Proxy traps, poisoned methods, iterators, coercion hooks and `toJSON` return stable rejection without invoking caller code.

The six original V1 commands retain `legacy-v1`; all nineteen CVN-3/CVN-4 commands use the bounded VNext boundary.

## 8. Stable Owner and Anchor Algorithms

### 8.1 Common rules

- `start` resolves to index `0` of the owner list.
- `after-*` resolves immediately after the unique stable ID inside that owner list.
- anchor ID absent globally: `command.anchor-not-found`.
- anchor ID present elsewhere but outside the required owner list: `command.anchor-wrong-owner`.
- move anchor equals target ID: `command.anchor-self-reference`.
- duplicate identity in an accepted pre-state is an internal invariant failure.
- move validates target and anchor against the original list, removes the target, resolves the anchor in the remaining list and inserts.
- requested canonical position equal to current position: `no-op`.

### 8.2 Part owner

- owner list: `ScoreDocument.parts`;
- insert target: current document;
- move target: one existing Part;
- anchor lookup is global because there is one Part list.

### 8.3 Staff owner

- owner list: `resolvedPart.staves`;
- insert target: owner Part;
- move target: Staff, whose owner Part comes from target resolution;
- an anchor Staff in another Part is `command.anchor-wrong-owner`.

### 8.4 Voice owner

- owner list: one `PartMeasureContent.voices`;
- insert target: Part plus payload `measureId`;
- move target: Voice, with owner Part and owner Measure/content resolved privately;
- an anchor Voice in another Measure or Part is `command.anchor-wrong-owner`.

For `core.voice.insert`, a payload `measureId` absent from global definitions returns `command.target-not-found`. A global Measure present without matching content in an otherwise accepted target Part is `command.internal-error`, because accepted ScoreDocument semantics require exact coverage.

## 9. Part Command Semantics

### 9.1 `core.part.insert`

Preparation order:

1. resolve target document;
2. resolve Part anchor;
3. inspect payload Part coverage against current global Measure IDs;
4. when coverage is exact, reorder `part.measureContents` to global Measure order;
5. create one detached Part aggregate with no Part-owned ExtensionBlock additions;
6. prepare `insert-part-bundle`;
7. rely on final Core semantics for global ID uniqueness, Staff references, sequence bounds, instrument validity and remaining component semantics.

Coverage rules:

- every global Measure ID appears exactly once;
- extra, missing, duplicate or unknown Measure IDs reject through `command.semantic-invalid` and existing coverage/reference diagnostics;
- caller-shuffled but exact coverage commits in global Measure order;
- Part, Staff, Voice, Event and Note IDs are caller supplied and globally unique;
- Part-owned extensions are not fields of `Part` and are not created implicitly.

### 9.2 `core.part.remove`

- target Part must exist uniquely;
- remove the complete Part aggregate;
- remove every top-level ExtensionBlock whose owner is that Part;
- preserve score-owned and other-Part extension blocks;
- inverse stores previous Part anchor, complete Part value and every removed extension's original absolute index/value;
- removing the final Part is rejected after candidate semantic validation with `semantic.part-required` at `['parts']`;
- missing target returns `command.target-not-found`; removal is not idempotent success.

### 9.3 `core.part.move`

- change only `ScoreDocument.parts` order;
- Part aggregate values remain deeply equal;
- top-level ExtensionBlock array order remains byte/deep equal;
- anchor self-reference rejects;
- already-canonical position is no-op.

### 9.4 `core.part.set-name`

- preserve exact string, including leading/trailing whitespace;
- no trim, case folding or normalization;
- exact string equality is no-op;
- target Part ID remains fixed.

### 9.5 `core.part.set-instrument`

- replace the complete `InstrumentDescriptor`;
- target Part ID and all other Part fields remain fixed;
- deep equality of name and both transposition components is no-op;
- invalid transposition or derived sounding pitch rejects semantically;
- semantic-valid profile differences commit with the resulting support classification.

## 10. Staff Command Semantics

### 10.1 `core.staff.insert`

- target Part must exist;
- resolve Staff anchor within target Part;
- insert exactly one complete StaffDefinition;
- do not create Voice or reassign any existing Voice/Event;
- duplicate Staff ID or invalid lineCount/clef rejects through existing decode/semantic authority;
- caller-shared input is detached before preparation.

### 10.2 `core.staff.remove`

Before effect preparation, traverse every Voice and Event owned by the target Staff's Part:

- any Voice `defaultStaffId === targetStaffId` returns `command.reference-conflict`;
- any Event with explicit `staffId === targetStaffId` returns `command.reference-conflict`;
- inherited Event assignment is not a direct reference;
- references in another Part are impossible for accepted state and do not widen cascade semantics;
- when no reference remains, prepare one narrow remove effect;
- removing the final Staff rejects after final semantics with `semantic.staff-required` at the owning Part's `staves` path.

The failure contains only `{code:"command.reference-conflict"}`. It does not expose referencing entity IDs, paths or payload data.

### 10.3 `core.staff.move`

- reorder only the owning Part's `staves` list;
- anchor in another Part returns `command.anchor-wrong-owner`;
- self-anchor returns `command.anchor-self-reference`;
- Staff value and every Voice/Event reference remain unchanged;
- already-canonical position is no-op.

### 10.4 `core.staff.set-definition`

- payload replaces `lineCount` and `defaultClef` only;
- Staff ID remains fixed;
- `lineCount` must decode as a safe integer and final semantics require `> 0`;
- Clef is exact `{sign,line}` using current decoder;
- complete equality is no-op.

## 11. Voice and Event Command Semantics

### 11.1 `core.voice.insert`

- target Part must exist;
- payload Measure must exist globally;
- owner is target Part's matching PartMeasureContent;
- resolve Voice anchor only inside that content;
- insert one complete Voice without modifying sibling contents;
- Voice/Event/Note IDs must be globally unique;
- Voice default and every explicit Event Staff must belong to target Part;
- sequence start and duration must fit the owner Measure;
- invalid IDs, Staff references or sequence data reject through final semantic diagnostics.

### 11.2 `core.voice.remove`

- target Voice must resolve with exact owner Part, Measure and content;
- remove Voice plus all Event/Note descendants;
- preserve Staff definitions, sibling Voices and every ExtensionBlock;
- inverse stores previous Voice anchor and complete Voice aggregate;
- removing the final Voice from its content rejects with `semantic.voice-required` at that content's `voices` path.

### 11.3 `core.voice.move`

- target Voice owner is fixed;
- anchor resolution is limited to the same PartMeasureContent;
- anchor in another Measure or Part returns `command.anchor-wrong-owner`;
- self-anchor returns `command.anchor-self-reference`;
- Voice aggregate remains deeply equal;
- already-canonical position is no-op.

### 11.4 `core.voice.set-default-staff`

- replace `defaultStaffId` only;
- exact same Staff ID is no-op;
- missing or another-Part Staff ID creates an isolated candidate rejected with `command.semantic-invalid` and `semantic.staff-reference-missing` at the Voice `defaultStaffId` path;
- Event explicit assignments remain unchanged.

### 11.5 `core.voice.set-sequence-start`

- replace `voice.sequence.start` only;
- payload uses canonical exact Fraction;
- same numerator/denominator is no-op;
- negative, non-canonical, out-of-bounds or duration-overflow result rejects through existing semantic diagnostics;
- semantic-valid non-zero start may commit as profile-unsupported.

### 11.6 `core.event.set-staff-assignment`

- `inherit-default` removes the optional Event `staffId` field;
- `staff` writes the exact provided Staff ID;
- explicit Staff must belong to the Event's owning Part;
- missing/another-Part Staff produces `command.semantic-invalid` with `semantic.staff-reference-missing` at the Event `staffId` path;
- effective explicit assignment already equal is no-op;
- `inherit-default` when no explicit field exists is no-op;
- the command does not move Event, change Voice default or modify sibling Events.

## 12. Failure Mapping and Priority

| Condition | Exact result |
|---|---|
| unreadable, malformed, extra-field or hostile envelope/payload | `command.invalid-envelope` |
| commandVersion other than 1 | `command.unsupported-version` |
| unknown command ID | `command.unknown-id` |
| target kind differs from catalog | `command.target-mismatch` |
| capture depth 65 | `command.resource-limit-exceeded`, `input-depth`, limit 64, actual 65 |
| property 1,048,577 | `command.resource-limit-exceeded`, `input-properties`, limit 1,048,576, actual 1,048,577 |
| missing command target | `command.target-not-found` |
| missing Part/Staff/Voice anchor globally | `command.anchor-not-found` |
| Staff/Voice anchor exists under another owner | `command.anchor-wrong-owner` |
| move anchor is target | `command.anchor-self-reference` |
| Staff removal with live Voice/Event reference | `command.reference-conflict` |
| duplicate ID, invalid coverage, invalid reference/sequence/instrument/definition | `command.semantic-invalid` with existing sorted diagnostics |
| removal of final Part | `command.semantic-invalid` + `semantic.part-required` |
| removal of final Staff | `command.semantic-invalid` + `semantic.staff-required` |
| removal of final Voice | `command.semantic-invalid` + `semantic.voice-required` |
| legal requested state equals current state | `no-op` |
| semantic-valid but profile-unsupported candidate | `committed` with `support.status === "unsupported"` |

Priority follows `CVN-FC-101`: availability when integrated later, envelope, version, ID, target kind, payload/resource, target/owner/anchor, reference/effect, final semantic, profile/capacity/internal.

Every rejection preserves encoded document, version, undo/redo depths and entries, checkpoint, dirty state and event trace deeply equal to pre-call state.

`command.reference-conflict` must be added to the public failure union, strict report decoder, Issue code map and exhaustive fixtures. It carries no raw reference list or internal path.

## 13. Private Resolver Changes

Extend `ResolvedScoreEntity` privately:

```typescript
type ResolvedVoiceEntity = {
  readonly kind: "voice";
  readonly voice: Voice;
  readonly content: PartMeasureContent;
  readonly measureId: string;
  readonly part: Part;
};
```

Event and Note resolved variants receive the same `content` and `measureId` ownership facts. Existing public target and selector results stay unchanged.

Add private anchor helpers in `target-resolver.ts`:

- `resolvePartAnchorInIds`;
- `resolveStaffAnchor(document, ownerPart, anchor)`;
- `resolveVoiceAnchor(document, ownerPart, ownerContent, anchor)`;
- `previousPartAnchor`;
- `previousStaffAnchor`;
- `previousVoiceAnchor`;
- family-specific move insertion helpers using one internal stable-ID algorithm.

The shared private algorithm owns unique-match, global-existence and original-list move behavior. Adapters do not duplicate owner scans or infer ownership from array indices.

## 14. Private Effect Design

Add exactly these narrow effect kinds to `CoreEffect`:

1. `insert-part-bundle`
2. `remove-part-bundle`
3. `move-part`
4. `replace-part-name`
5. `replace-part-instrument`
6. `insert-staff`
7. `remove-staff`
8. `move-staff`
9. `replace-staff-definition`
10. `insert-voice`
11. `remove-voice`
12. `move-voice`
13. `replace-voice-default-staff`
14. `replace-voice-sequence-start`
15. `replace-event-staff-assignment`

Private support records:

```typescript
interface IndexedExtensionBlock {
  readonly index: number;
  readonly value: ExtensionBlock;
}

interface InsertPartBundleEffect {
  readonly kind: "insert-part-bundle";
  readonly documentId: string;
  readonly anchor: PartAnchor;
  readonly part: Part;
  readonly extensions: readonly IndexedExtensionBlock[];
}
```

Forward Part insertion uses `extensions: []`. The inverse of Part removal carries cloned Part-owned blocks and their original positions.

Effect ownership fields:

- Part effects: `documentId`, `partId` and Part anchor/value as required;
- Staff effects: `partId`, `staffId` and Staff anchor/value as required;
- Voice effects: `partId`, `measureId`, `voiceId` and Voice anchor/value as required;
- Event assignment: `eventId` plus explicit assignment union;
- replacement effects store complete replacement values rather than generic property names.

### 14.1 Preflight and application

For each full effect set:

1. clone the source document once;
2. preflight the current effect against the current candidate;
3. derive its inverse from the current candidate value;
4. apply the effect;
5. prepend the derived inverse so final inverse order is reverse application order;
6. on any preflight/application failure, discard the candidate and return a stable failure;
7. deep-freeze the candidate and inverse set on success.

Part removal preflight captures extension indices before mutation, removes matching blocks from highest index to lowest, and its inverse reinserts cloned blocks in ascending stored-index order. This restores exact mixed extension ordering.

No effect stores a complete ScoreDocument snapshot. No public result exposes these effects or indices.

## 15. Canonical Affected-Address Order

Use existing `ScoreAddress` kinds and de-duplicate by kind/ID while preserving first occurrence.

| Command | Exact affected order |
|---|---|
| Part insert | document, inserted Part, its Staffs in order, then Voices/Events/Notes by global Measure order and stored descendant order |
| Part remove | removed Part, document, removed Staffs, then removed Voices/Events/Notes by global Measure order and stored descendant order |
| Part move | moved Part, document |
| Part set-name/instrument | target Part |
| Staff insert | owner Part, inserted Staff |
| Staff remove | target Staff, owner Part |
| Staff move | target Staff, owner Part |
| Staff set-definition | target Staff |
| Voice insert | owner Part, inserted Voice, inserted Events/Notes in order |
| Voice remove | target Voice, owner Part, removed Events/Notes in order |
| Voice move | target Voice, owner Part |
| Voice set-default-staff/start | target Voice |
| Event set-staff-assignment | target Event |

Part aggregate traversal resolves contents through global Measure order rather than trusting a semantically irrelevant pre-shuffled `measureContents` order. Voice/Event/Note traversal inside each resolved content uses stored order.

Undo and redo reuse the original history entry's affected array exactly. Replay of the same semantic envelope produces the same affected order.

## 16. Exact Production File Surface

Expected new private file:

- `src/core-kernel/commands/hierarchy-command-adapters.ts`

Expected modified production files:

- `src/core-kernel/commands/catalog.ts`
- `src/core-kernel/commands/contracts.ts`
- `src/core-kernel/commands/core-command-adapters.ts`
- `src/core-kernel/commands/target-resolver.ts`
- `src/core-kernel/commands/effects.ts`
- `src/core-kernel/commands/execution-assembly.ts`
- `src/core-kernel/registry/builtins.ts`
- `src/core-kernel/reports/strict-codec.ts`
- `src/core-kernel/reports/adapters.ts` only if exhaustive mapping requires an explicit branch
- `src/core-kernel/index.ts` only for type-export arrangement when `export * from commands/contracts` is insufficient; runtime exports remain unchanged

Expected unchanged production files:

- `src/core-kernel/domain/score-document.ts`
- `src/core-kernel/domain/address.ts`
- `src/core-kernel/codec/decode-score-document.ts`
- `src/core-kernel/factory/**`
- `src/core-kernel/commands/command-bus.ts`
- `src/core-kernel/commands/runtime.ts`
- `src/core-kernel/commands/replay.ts`
- `src/core-kernel/events/**`
- `src/core-kernel/read/**`
- `src/core-kernel/migration/**`

A needed modification outside the expected surface is recorded with contract rationale before commit. Schema, package/build, Guitar, product/UI, rendering, playback and IO paths stay protected.

## 17. Test and Fixture Surface

Create:

- `test/core-kernel/fixtures/cvn-4-score.ts`
- `test/core-kernel/fixtures/cvn-4-command-helpers.ts`
- `test/core-kernel/fixtures/cvn-4-surface.ts`
- `test/core-kernel/fixtures/cvn-4-surface.expected.json`
- `test/core-kernel/cvn-4-part-lifecycle.test.ts`
- `test/core-kernel/cvn-4-staff-lifecycle.test.ts`
- `test/core-kernel/cvn-4-voice-lifecycle.test.ts`
- `test/core-kernel/cvn-4-strict-input.test.ts`
- `test/core-kernel/cvn-4-transaction-integration.test.ts`
- `test/core-kernel/cvn-4-public-surface.test.ts`

Modify as required:

- `test/core-kernel/fixtures/cvn-3-surface.ts` to project only the frozen CVN-3 49/10/10 surface;
- `test/core-kernel/command-internals.test.ts` for each effect/inverse pair and aggregate restoration;
- `test/core-kernel/registry-contracts.test.ts` for fifteen descriptors/title keys;
- `test/core-kernel/kernel-failure-adapters.test.ts` for `command.reference-conflict`;
- public API, report/Issue, gateway and forbidden-dependency closed allowlists;
- transaction characterization only through additive projection, never by rewriting accepted expected behavior.

Protected fixtures:

- `test/core-kernel/fixtures/cvn-1-characterization.expected.json` remains byte-identical;
- `test/core-kernel/fixtures/cvn-3-surface.expected.json` remains byte-identical.

## 18. Required CVN-4 Fixture

The main hierarchy fixture contains:

- at least three Parts in a known order;
- at least three global Measures;
- one single-Staff Part and at least one multi-Staff Part;
- at least two Voices in two distinct PartMeasureContents;
- both inherited and explicit Event Staff assignment;
- Notes and Rest events with globally unique IDs;
- score-owned extensions mixed with Part-owned extensions in top-level array order;
- at least two Part-owned blocks for the Part selected for removal, separated by blocks owned elsewhere;
- semantic-valid profile-supported and semantic-valid profile-unsupported variants;
- a semantic-valid pre-shuffled `measureContents` variant;
- deterministic helper IDs with no time/random generation.

The fixture must support exact encoded before/after comparisons, full aggregate removal, extension-order restoration, cross-owner anchors, last-required-entity cases and caller-mutation isolation.

## 19. Per-Command Minimum Test Matrix

Every new command independently proves:

1. strict valid commit;
2. exact no-op where defined;
3. invalid envelope and extra field at every public layer;
4. wrong target kind;
5. missing target;
6. missing, wrong-owner and self anchor where applicable;
7. semantic/reference rejection;
8. exact encoded before/after document;
9. exact undo restoration;
10. exact redo reapplication;
11. replay equality;
12. checkpoint/dirty/redo clear or preservation behavior;
13. one committed event for commit and zero for no-op/reject;
14. exact canonical affected addresses;
15. getter/Proxy/sparse/cycle totality;
16. exact depth/property limits;
17. caller mutation after submit isolation;
18. unknown score/Part extension preservation;
19. failure pre/post state deep equality;
20. authorized gateway parity and denied gateway non-execution.

Additional structural cases:

- Part insert canonicalizes shuffled coverage;
- Part remove restores separated Part-owned extensions at exact positions;
- Part move leaves extension array byte/deep equal;
- Staff removal conflicts separately for Voice default and explicit Event reference;
- explicit reassignment then Staff removal succeeds as separate commands;
- Voice move rejects same ID in another Measure/Part as wrong owner;
- last Part/Staff/Voice diagnostics use exact paths/codes;
- setting a Staff reference to another Part rejects semantically;
- sequence-start commit can be semantic-valid but unsupported;
- pre-shuffled accepted Measure content order remains loadable and unrelated commands preserve it unless their contract requires normalization.

## 20. Ordered Implementation Plan

### Stage 0 — Formal activation baseline

Runs only after CVN-3 acceptance/archive and formal task approval:

- record accepted CVN-3 source, acceptance and archive commits;
- record clean formal planning HEAD and branch;
- run `npm run typecheck`, `npm run build`, focused CVN-3 tests and full `npm test`;
- record 49/10/10 surface and both immutable fixture hashes;
- validate formal CVN-4 context manifests;
- verify protected schema/Guitar/module-runtime paths have no baseline drift.

### Stage 1 — Freeze prior surfaces

- project the CVN-3 surface collector to exact 49/10/10;
- keep its expected JSON byte-identical;
- add an initial CVN-4 surface collector recording the pre-feature 49/10/10 state;
- preserve CVN-1 projected characterization;
- commit only characterization/fixture preparation.

### Stage 2 — Shared hierarchy seams

- extend private resolved ownership with content/Measure facts;
- add common owner-aware Part/Staff/Voice anchor helpers;
- add narrow hierarchy effect variants, preflight and inverse derivation;
- add direct effect round-trip/atomic-failure tests;
- expose no new public command yet.

### Stage 3 — Five Part commands

- append Part types and catalog entries 11–15;
- implement exact bounded decoders and Part adapters;
- implement Part coverage canonicalization;
- implement Part aggregate/extension removal and restoration;
- add Registry title keys and focused Part tests;
- update interim exhaustive catalogs without adding later-family placeholders.

### Stage 4 — Four Staff commands

- append Staff types and catalog entries 16–19;
- implement owner-aware Staff anchors;
- implement live-reference preflight and `command.reference-conflict`;
- add report/Issue mapping for the failure;
- implement Staff insert/remove/move/definition effects;
- add focused Staff and exact failure-state tests.

### Stage 5 — Three Voice structural commands

- append Voice insert/remove/move types and catalog entries 20–22;
- implement Part+Measure content selection;
- implement wrong-owner Voice anchors;
- implement Voice aggregate removal/inverse;
- add focused Voice structure tests.

### Stage 6 — Voice properties and Event assignment

- append catalog entries 23–25;
- implement default Staff, sequence start and Event assignment decoders/effects;
- prove semantic reference and profile-support separation;
- finish all fifteen Registry descriptors.

### Stage 7 — Transaction integration

- run all commands through direct CommandBus and Registry gateway;
- prove commit/no-op/reject state rules;
- prove undo/redo/replay/checkpoint/dirty/event behavior;
- prove caller alias and unknown extension isolation;
- prove canonical affected facts and subscriber isolation.

### Stage 8 — Strict input and closed failure matrices

- run hostile root/nested input cases for each payload family;
- prove exact 64/65 and 1,048,576/1,048,577 boundaries;
- update exhaustive failure/report tables;
- prove public failure privacy and frozen diagnostics;
- scan for private effect/index leakage.

### Stage 9 — Surface and regression closure

- update CVN-4 surface fixture from 49/10/10 to exact 49/25/25;
- keep CVN-3 fixture expected JSON immutable;
- rerun CVN-1 characterization and CVN-3 focused tests;
- run public API, Registry, report, forbidden dependency, typecheck, build and full suite;
- inspect protected-path diff against activation baseline.

### Stage 10 — Review candidate documentation

- map each requirement and acceptance criterion to test/file evidence;
- record exact source/test commits and counts;
- synchronize active Core specs as review-candidate text only;
- update parent CVN-4 status without marking dependency acceptance;
- run Trellis, JSON/JSONL, Markdown, path and diff checks.

### Stage 11 — Independent final review

An independent reviewer:

- reviews the full diff from accepted CVN-3 base;
- audits all fifteen contracts and effect inverses;
- audits Part extension ordering and Staff reference scans;
- audits Voice content ownership and wrong-owner anchors;
- runs focused and full commands independently;
- records every reproducible P0/P1/P2 or a pass verdict;
- re-reviews repairs before planner acceptance.

CVN-5 treats CVN-4 as satisfied only after accepted evidence and archive are recorded.

## 21. Exact Validation Commands

```powershell
npm run typecheck
npm run build
node --test "dist/test/core-kernel/cvn-4-part-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-staff-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-voice-lifecycle.test.js"
node --test "dist/test/core-kernel/cvn-4-strict-input.test.js"
node --test "dist/test/core-kernel/cvn-4-transaction-integration.test.js"
node --test "dist/test/core-kernel/cvn-4-public-surface.test.js"
node --test "dist/test/core-kernel/cvn-3-document-factory.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-insert-remove.test.js"
node --test "dist/test/core-kernel/cvn-3-measure-move-definition.test.js"
node --test "dist/test/core-kernel/cvn-3-transaction-integration.test.js"
node --test "dist/test/core-kernel/command-spine-characterization.test.js"
node --test "dist/test/core-kernel/command-internals.test.js"
node --test "dist/test/core-kernel/registry-contracts.test.js"
node --test "dist/test/core-kernel/kernel-failure-adapters.test.js"
node --test "dist/test/core-kernel/public-api-boundary.test.js"
node --test "dist/test/core-kernel/forbidden-dependency-boundary.test.js"
npm test
$CVN4_TASK_DIR = (Get-ChildItem -Directory .trellis/tasks | Where-Object Name -Match 'cvn-4-part-staff-voice-lifecycle$' | Select-Object -First 1 -ExpandProperty Name)
python ./.trellis/scripts/task.py validate $CVN4_TASK_DIR
git diff --check
```

The formal task replaces the typed task-directory slot with its real generated directory before review. A differing existing test filename is discovered with `Get-ChildItem test/core-kernel -Filter *.test.ts`, and the corrected command is recorded rather than dropping the test group.

## 22. Planned Commit Boundaries

1. `test(core): freeze CVN-3 surface before CVN-4`
2. `refactor(core): add hierarchy ownership and effect seams`
3. `feat(core): add Part lifecycle commands`
4. `feat(core): add Staff lifecycle commands`
5. `feat(core): add Voice structural commands`
6. `feat(core): add Voice and Event staff properties`
7. `test(core): close CVN-4 transaction and surface matrix`
8. `docs(core): record CVN-4 review candidate`

No commit mixes CVN-2/5/6 behavior, Guitar semantics, schema migration or unrelated cleanup. Final acceptance/archive/journal bookkeeping remains separate from source feature commits.

## 23. Requirements

- **CVN4-R001:** formal execution starts from independently accepted and archived CVN-3.
- **CVN4-R002:** exactly fifteen IDs are appended in the fixed parent order.
- **CVN4-R003:** all fifteen commands use the existing `submit(unknown)` port and bounded VNext capture.
- **CVN4-R004:** Part insert canonicalizes exact Measure coverage to global order.
- **CVN4-R005:** Part remove atomically removes the aggregate and every Part-owned extension.
- **CVN4-R006:** Part remove inverse restores exact Part and extension positions.
- **CVN4-R007:** Part move never reorders ExtensionBlocks.
- **CVN4-R008:** Part name and instrument setters have exact no-op rules.
- **CVN4-R009:** Staff insert creates no implicit Voice.
- **CVN4-R010:** Staff remove rejects every live Voice/Event reference with `command.reference-conflict`.
- **CVN4-R011:** Staff move and Voice move enforce owner-local anchors.
- **CVN4-R012:** Voice insert selects one PartMeasureContent by target Part and payload Measure ID.
- **CVN4-R013:** Voice remove owns Event/Note descendants and preserves siblings/extensions.
- **CVN4-R014:** Staff reassignment occurs only through explicit Voice/Event commands or future batch.
- **CVN4-R015:** last Part/Staff/Voice rejection uses existing semantic diagnostics.
- **CVN4-R016:** semantic-valid profile-unsupported candidates commit.
- **CVN4-R017:** all private effects derive exact inverse from current candidate state.
- **CVN4-R018:** runtime exports remain 49 and catalog/Registry become 25/25.
- **CVN4-R019:** CVN-1 characterization and CVN-3 accepted surface behavior remain frozen.
- **CVN4-R020:** schema, Guitar, module runtime, range and batch ownership stay outside CVN-4.

## 24. Acceptance Criteria

- **CVN4-AC001:** formal task records accepted CVN-3 source/acceptance/archive commits and a clean activation HEAD.
- **CVN4-AC002:** catalog IDs 11–25 exactly match section 5 in order, version and target.
- **CVN4-AC003:** Registry contains exact 25 descriptors and the fifteen title keys in section 6.
- **CVN4-AC004:** runtime root export allowlist remains exactly 49.
- **CVN4-AC005:** all fifteen commands reject hostile/extra/sparse/cyclic input without invoking caller code.
- **CVN4-AC006:** depth 64/property 1,048,576 accept at the applicable boundary and 65/1,048,577 reject with exact facts.
- **CVN4-AC007:** Part insert commits exact coverage in global Measure order.
- **CVN4-AC008:** Part insert coverage/ID/reference failures preserve full state equality.
- **CVN4-AC009:** Part remove deletes the full aggregate and only its owned extensions.
- **CVN4-AC010:** Part remove undo restores exact mixed extension array positions and payload values.
- **CVN4-AC011:** Part move changes only Part order and is no-op when already positioned.
- **CVN4-AC012:** Part name preserves exact whitespace and no-op equality.
- **CVN4-AC013:** instrument replacement proves commit/no-op/semantic rejection/profile unsupported behavior.
- **CVN4-AC014:** Staff insert adds no implicit Voice or reference mutation.
- **CVN4-AC015:** Staff remove rejects a default-Staff Voice reference.
- **CVN4-AC016:** Staff remove rejects an explicit Event Staff reference.
- **CVN4-AC017:** after explicit reassignment, Staff removal commits and exact undo restores both commands independently.
- **CVN4-AC018:** removal of final Staff reports exact `semantic.staff-required` path and full state equality.
- **CVN4-AC019:** Staff move distinguishes missing, wrong-owner and self anchors.
- **CVN4-AC020:** Staff definition replacement proves exact equality and invalid line-count rollback.
- **CVN4-AC021:** Voice insert resolves target Part/Measure/content and preserves unrelated contents.
- **CVN4-AC022:** Voice insert rejects global ID, Staff reference and sequence violations deterministically.
- **CVN4-AC023:** Voice remove deletes Event/Note descendants and restores exact order/value through undo.
- **CVN4-AC024:** removal of final Voice reports exact `semantic.voice-required` path.
- **CVN4-AC025:** Voice move distinguishes cross-Measure, cross-Part, missing and self anchors.
- **CVN4-AC026:** Voice default Staff replacement commits/no-ops/rejects wrong ownership exactly.
- **CVN4-AC027:** sequence-start replacement proves canonical Fraction, bounds, no-op and unsupported separation.
- **CVN4-AC028:** Event assignment proves explicit, inherited, no-op and wrong-owner cases.
- **CVN4-AC029:** each command proves exact encoded before/after, undo, redo and replay equality.
- **CVN4-AC030:** each command proves checkpoint, dirty, redo and committed-event state rules.
- **CVN4-AC031:** affected addresses match section 15 and remain identical through undo/redo history facts.
- **CVN4-AC032:** caller mutation and unknown extension preservation pass every relevant path.
- **CVN4-AC033:** `command.reference-conflict` mapping is exhaustive, frozen and privacy-safe.
- **CVN4-AC034:** CVN-1 expected characterization and CVN-3 expected surface JSON remain byte-identical.
- **CVN4-AC035:** typecheck, build, focused tests, full tests, Trellis validation, diff checks and independent final review pass.

## 25. Rollback

Rollback is additive and schema-free:

1. revert Voice/Event property commit;
2. revert Voice structure commit;
3. revert Staff commit and remove `command.reference-conflict` mappings if no later owner uses it;
4. revert Part commit;
5. revert private hierarchy resolver/effect seams;
6. remove CVN-4 fixtures/tests;
7. restore the CVN-3 surface collector's pre-projection complete-surface behavior when the additive CVN-4 surface is absent;
8. retain CVN-3 accepted source, schema and expected fixtures unchanged.

Persisted documents require no migration because CVN-4 operates only on existing `brilliant-score-1` structures.

## 26. Stop Conditions

Return formal CVN-4 to parent review if implementation would require:

- a new persisted field or schema version;
- a new public target/address kind;
- a sixteenth CVN-4 command, alias or generic setter;
- a cascade/reassign flag on remove;
- Part-owned extensions embedded inside `Part`;
- whole-document replacement, generic patch or public array index;
- a second transaction/history/replay/event owner;
- runtime registration or module integration;
- Guitar/product/UI/render/audio/IO dependencies;
- changing any accepted CVN-3 observable behavior or expected fixture;
- changing the command/anchor/failure semantics fixed in this preplan without explicit parent review.

## 27. Formalization Checklist

After CVN-3 acceptance, the planner converts this preplan into a formal child by:

1. creating the Trellis child under the Core VNext parent;
2. creating a `codex/cvn-4-part-staff-voice-lifecycle` branch from accepted CVN-3;
3. recording exact base branch and HEAD;
4. producing task-local `prd.md`, `design.md`, `implement.md` and current evidence;
5. copying the twenty requirements and thirty-five acceptance criteria without weakening them;
6. replacing the formal task-directory slot in validation commands;
7. recording any candidate-to-accepted CVN-3 repair delta;
8. curating real `implement.jsonl` and `check.jsonl` entries;
9. running planning validation and presenting functions/benefits to the user;
10. leaving task status `planning` until separate execution approval.

There is no unresolved feature-scope question in this preplan. The remaining gate is objective: CVN-3 independent acceptance and archive evidence.
