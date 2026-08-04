# CVN-4 Current Hierarchy Evidence

> **Evidence snapshot:** 2026-08-04.
> **Source/test candidate inspected:** `d9500f5a8ac285071586ba8eda380370eafd022f` on `codex/cvn-3-document-factory-measure-lifecycle`.
> **Use:** evidence input for conditional CVN-4 planning only. Formal task creation, branching and activation wait for CVN-3 independent acceptance.

## 1. Dependency Evidence

- Parent dependency graph requires accepted CVN-1 and accepted CVN-3 before CVN-4 becomes executable.
- CVN-1 is independently accepted and archived.
- CVN-3 implementation and verification are complete at candidate `d9500f5`, but `task.json.meta.final_independent_review` and `final_independent_re_review` remain `pending`.
- CVN-3 recorded 22 Measure-lifecycle tests, 71 cross-layer focused tests and 233 full tests, with 49 runtime exports, 10 Core commands and 10 Registry command descriptors.
- Therefore CVN-4 may be researched and conditionally specified, while formal child creation/activation remains gated by CVN-3 acceptance and archive evidence.
- CVN-2 is a separate module track and still waits for GD-0 independent acceptance. CVN-4 has no GD-0 or module-runtime dependency.

## 2. Binding Parent Contracts

Primary ownership is already fixed:

- `CVN-FC-030/031`: `PartAnchor`, `StaffAnchor`, `VoiceAnchor` and owner-aware anchor behavior;
- `CVN-FC-041`: exactly fifteen CVN-4 command IDs, targets and payload families;
- `CVN-FC-060`: five Part commands;
- `CVN-FC-061`: four Staff commands;
- `CVN-FC-062`: five Voice commands;
- `CVN-FC-063`: one Event staff-assignment command;
- `CVN-FC-070`: ownership cascade, cross-reference rejection and exact inverse restoration;
- `CVN-FC-100–102`: additive failure union, priority and privacy;
- `CVN-FC-140/142`: per-command and factory/structure acceptance matrices.

The parent fixes fifteen additions: five Part, four Staff, five Voice and one Event command. It excludes aliases, generic setters, public cascade flags, generic patch, array-index addressing and a second submit port.

## 3. Persisted Model Evidence

`src/core-kernel/domain/score-document.ts` already represents every CVN-4 result:

- `ScoreDocument.parts` at `:21`;
- `Part` at `:41` with `id/name/instrument/staves/measureContents`;
- `StaffDefinition` at `:54` with `id/lineCount/defaultClef`;
- `PartMeasureContent` at `:65` with `measureId/voices`;
- `Voice` at `:70` with `id/defaultStaffId/sequence`;
- optional Event `staffId` at `:84`;
- `InstrumentDescriptor`, `Clef`, `Fraction`, `MusicSequence`, Event and Note are already stable types.

No persisted field or schema-version change is required. `brilliant-score-1` remains sufficient. Part-owned extensions already use top-level `ScoreDocument.extensions` with owner `{kind:"part", partId}`.

## 4. Existing Strict Component Decoders

`src/core-kernel/codec/score-component-codec.ts` already exports strict reusable decoders:

- `decodeFraction` at `:183`;
- `decodeInstrument` at `:373`;
- `decodeClef` at `:393`;
- `decodeStaff` at `:413`;
- `decodeVoice` at `:564`;
- `decodePartMeasureContent` at `:584`;
- `decodePart` at `:605`.

The CVN-3 bounded command path captures unknown input before typed decode through `strict-input-capture.ts`, then uses `ScoreComponentDecodeContext(true)` for exact fields and deterministic diagnostics. CVN-4 should reuse this boundary rather than reimplementing Part/Staff/Voice codecs.

## 5. Current Semantic Authority

`src/core-kernel/validation/validate-score-semantics.ts` already enforces:

- globally unique non-empty entity IDs through `registerId` at `:54`;
- non-empty Part list with `semantic.part-required`;
- at least one Staff per Part with `semantic.staff-required`;
- positive safe-integer `StaffDefinition.lineCount`;
- every Voice `defaultStaffId` belongs to its Part;
- every explicit Event `staffId` belongs to its Part;
- each Part covers every global Measure once, with missing/duplicate/reference diagnostics;
- at least one Voice per PartMeasureContent with `semantic.voice-required`;
- canonical non-negative sequence start and exact sequence-duration bounds;
- Part instrument transposition validity and derived sounding-pitch validity;
- Part-owned extension owner existence and owner/namespace uniqueness.

The existing validator provides final rejection for duplicate inserted IDs, invalid Part coverage, invalid Staff definitions, invalid Staff references, invalid sequence starts/durations, removal of the last Part/Staff/Voice and invalid instrument replacement. No new semantic diagnostic code is required for CVN-4.

## 6. Current Profile Authority

`src/core-kernel/profiles/score-feature-profile.ts` already classifies semantic-valid documents independently from semantic validity:

- Part count;
- Staff count per Part;
- Voice count per Part/Measure;
- non-zero sequence start;
- sequence completeness;
- note-value/chord/time-modification support.

CVN-4 commands must commit semantic-valid changes even when the result becomes profile-unsupported. `set-instrument`, Staff insertion, Voice insertion and sequence-start changes must therefore preserve the CVN-3 semantic-versus-support separation.

## 7. Current Command and Transaction Seams

`src/core-kernel/commands/contracts.ts` currently exposes ten command variants and all seven stable target kinds. CVN-4 can append fifteen typed envelope variants without adding a new submit method.

`src/core-kernel/commands/core-command-adapters.ts` owns:

- exact target decoding;
- `CoreCommandAdapter` with `legacy-v1 | vnext-bounded-v1` input boundary;
- one `prepare` result union containing private effects and canonical affected addresses;
- the static ordered adapter list.

`src/core-kernel/commands/strict-codec.ts` already:

- resolves command ID and target mismatch before bounded capture;
- captures all VNext input before typed decode;
- returns exact depth/property resource failures;
- freezes accepted decoded envelopes.

`src/core-kernel/commands/execution-assembly.ts` checks catalog/adapter parity and currently marks the four Measure IDs as bounded. CVN-4 needs to extend this closed bounded-ID set to all twenty-five post-CVN-4 commands except the six preserved legacy IDs.

## 8. Current Target and Ownership Gaps

`src/core-kernel/commands/target-resolver.ts` already resolves Part, Staff, Voice, Event and Note globally, but its nested result currently omits the owning Measure/content for Voice/Event/Note:

- Staff result includes owning Part;
- Voice result includes Voice and Part only;
- Event result includes Event, Event index, Voice and Part;
- Note result includes Note, Event, Voice and Part.

CVN-4 Voice insert/move/remove and affected-address generation need the exact owning `PartMeasureContent` and `measureId`. The private resolved variants should be extended once at the resolver boundary rather than rescanning differently in multiple adapters.

The current resolver has Measure and Sequence anchors only. CVN-4 needs owner-aware stable-ID helpers for Part, Staff and Voice anchors, including global existence checks that distinguish `command.anchor-not-found` from `command.anchor-wrong-owner` and move self-reference from ordinary anchor failures.

## 9. Current Effect Engine

`src/core-kernel/commands/effects.ts` already owns:

- private `CoreEffect` union;
- preflight before mutation;
- clone-once candidate application;
- inverse derivation from current candidate values;
- reverse inverse ordering for multi-effect sets;
- frozen effects/inverses;
- atomic failure conversion.

CVN-3 added narrow Measure bundle/reorder/replacement effects without exposing them publicly. CVN-4 should follow the same pattern with narrow hierarchy effects. Part removal requires a bundle because its inverse must restore the Part aggregate and all Part-owned top-level ExtensionBlocks at exact original positions.

## 10. Extension Restoration Evidence

`ExtensionBlock` has no independent entity ID. Its stable uniqueness key is owner plus namespace, and its array position is observable through exact encoded document equality. Part removal therefore needs private inverse data containing each removed extension's original array index and full cloned block. Reinsertion in ascending original-index order restores the exact mixed score-owned/Part-owned extension sequence without whole-document replacement.

Part insertion accepts a complete `Part` only and creates no Part-owned extension block. The forward insert effect therefore carries an empty extension-entry list; the same effect type can restore entries when it is the inverse of Part removal.

## 11. Event and Affected-Address Evidence

`ScoreAddress` already contains document, measure, part, staff, voice, event and note kinds. No new address kind is required.

CVN-3 establishes these useful conventions in `measure-command-adapters.ts`:

- deterministic target/owner/descendant ordering;
- global-ID de-duplication;
- aggregate traversal in stored Voice/Event/Note order;
- frozen detached affected-address arrays;
- undo/redo reuse the history entry's original affected facts.

CVN-4 can express Part, Staff and Voice aggregate changes with existing addresses. PartMeasureContent itself has no public address, so the owning Part is the canonical owner fact for Voice-list mutations.

## 12. Registry, Report and Surface Gaps

`src/core-kernel/commands/catalog.ts` currently contains ten commands. CVN-4 appends exactly fifteen, resulting in twenty-five Core command IDs.

`src/core-kernel/registry/builtins.ts` has one exhaustive `COMMAND_TITLE_KEYS` record and derives descriptors from the execution assembly. It must gain fifteen exact title keys, resulting in twenty-five Registry command descriptors.

`CommandFailure` currently lacks `command.reference-conflict`. The addition must propagate exhaustively through:

- `src/core-kernel/reports/strict-codec.ts`;
- `src/core-kernel/reports/adapters.ts` where applicable;
- `test/core-kernel/kernel-failure-adapters.test.ts`;
- report/Issue allowlist fixtures.

CVN-4 adds typed command/anchor interfaces but no new root runtime value. Expected runtime export count remains `49`; command and Registry counts become `25/25`.

The CVN-3 surface fixture currently records the complete 49/10/10 surface. Before adding CVN-4, its collector must project the frozen CVN-3 catalog/Registry subset while leaving `cvn-3-surface.expected.json` byte-identical. A separate CVN-4 fixture then asserts 49/25/25.

## 13. Existing Test Assets to Reuse

- `test/core-kernel/fixtures/cvn-3-score.ts` already supplies a multi-Part/multi-Measure document with Part-owned unknown extensions.
- `test/core-kernel/fixtures/cvn-3-command-helpers.ts` provides strict envelope helpers.
- `test/core-kernel/command-internals.test.ts` already proves effect round-trip, reverse inverse order, atomic preflight and history storage.
- `test/core-kernel/cvn-3-transaction-integration.test.ts` provides the direct bus/gateway/history/replay/event matrix pattern.
- `test/core-kernel/cvn-3-strict-input.test.ts` provides hostile-input and exact 64/65 plus 1,048,576/1,048,577 patterns.
- Registry, failure adapter, public API and forbidden-dependency tests already use exhaustive allowlists that must grow explicitly.

CVN-4 needs a dedicated hierarchy fixture with at least three Parts, multiple Staffs, multiple Voices in more than one Measure, explicit/inherited Event Staff assignment, mixed score/Part extension ordering and a semantic-valid pre-shuffled `measureContents` case.

## 14. Planning Conclusions

1. No schema, migration, domain-model or address-kind change is needed.
2. One new private hierarchy adapter file should own all fifteen decoders/preparers to avoid inflating the accepted V1 adapter file.
3. Existing shared component decoders are sufficient.
4. Target resolver results must gain content/measure ownership once, privately.
5. Narrow private hierarchy effects can extend the accepted effect engine; whole-document replacement remains unnecessary.
6. Part removal is the only CVN-4 operation that also mutates `ScoreDocument.extensions`.
7. Existing semantic diagnostics cover every last-entity, ID, Staff reference, sequence and coverage rejection.
8. `command.reference-conflict` is needed only for live Staff references during Staff removal.
9. Runtime exports stay at 49; catalog and Registry grow from 10 to 25.
10. Formal CVN-4 task creation and activation wait for CVN-3 independent acceptance and archive evidence.
