# RKP-0 Canonical Oracle Scenario Matrix

This file is the construction authority for the 64-row TypeScript oracle. The operator implements these rows verbatim and does not select substitute fixtures, rejection branches, operation order, or expected state transitions.

## 1. Fixed fixture and assembly recipes

| Recipe | Exact construction |
|---|---|
| `fixture.core.full` | `cloneCoreScoreFixture()` from `test/core-kernel/fixtures/core-score.ts`. |
| `fixture.core.incomplete` | `cloneCoreScoreFixture()`, then remove only `event-4` from `voice-1`; the remaining three quarter events are unchanged. |
| `fixture.cvn3.shuffled` | `createCvn3ShuffledMeasureFixture()` from `test/core-kernel/fixtures/cvn-3-score.ts`. |
| `fixture.cvn3.ordered` | `createCvn3MeasureFixture()` from the same file. |
| `fixture.cvn4.full` | `cloneCvn4ScoreFixture()` from `test/core-kernel/fixtures/cvn-4-score.ts`. |
| `fixture.cvn4.staff-a2-unreferenced` | `cloneCvn4ScoreFixture()`, then remove only the own data property `staffId` from event `cvn4-event-a-1-notes`; `cvn4-voice-a-1-primary.defaultStaffId` remains `cvn4-staff-a-1`. Semantic validation must pass before capture. |
| `fixture.cvn6.integrated` | `createCoreScoreFixture()` plus authentic catalog compiled from `CVN6_MANIFEST` and `CVN6_REGISTRATION_ENTRIES`, with the exact two-row requirement inventory in `test/core-kernel/integrated-assembly-identity.test.ts:16-36`. |
| `assembly.core` | `CommandBus.create(initialDocument)`; no integrated catalog or inventory. |
| `assembly.cvn6` | `CommandBus.createIntegrated(initialDocument, authenticCatalog, exactInventory)`; Registry, gateway, replay and migration inputs reuse that same private assembly identity. |
| `assembly.cvn6.other` | A second authentic catalog/inventory construction used only for the declared mismatch operation; it is never structurally forged. |

Every fixture is strict-codec and Core-semantic validated before the first operation. Fixture recipes are functions in `ts-oracle-fixtures.ts`; no row may mutate a shared fixture instance.

## 2. Common operation programs and observations

### `A8` — effective accepted command with inverse proof

1. `subscribe("main", collect)`;
2. `submit(acceptedEnvelope)`;
3. `read("snapshot+history+dirty")`;
4. `undo()`;
5. `read("snapshot+history+dirty")`;
6. `redo()`;
7. `read("snapshot+history+dirty")`;
8. `unsubscribe("main")`.

There is exactly one observation per operation. The submit is `committed` with document version `1`, undo depth `1`, redo depth `0`; undo is `committed`, restores the byte-identical initial document, advances document version to `2`, and yields undo/redo `0/1`; redo is `committed`, restores the byte-identical post-submit document, advances document version to `3`, and yields `1/0`. The event projection is exactly committed/dirty for submit at sequences `1/2`, committed/dirty for undo at `3/4`, and committed/dirty for redo at `5/6`, with causes `submit`, `undo`, `redo` and dirty values `true`, `false`, `true`. Every row stores the exact public support/diagnostic, affected-address and event payloads produced by its cited accepted test. The inverse proof is `afterUndo.documentSha256 == initial.documentSha256` and `afterRedo.documentSha256 == afterSubmit.documentSha256`.

### `R4` — deterministic missing-target rejection

1. `subscribe("main", collect)`;
2. `submit(rejectedEnvelope)`;
3. `read("snapshot+history+dirty")`;
4. `unsubscribe("main")`.

The rejected envelope is the row's accepted envelope with only its target identity replaced by the explicit missing identity in the table. Payload and command ID remain unchanged. Expected result is `rejected` with `{code:"command.target-not-found"}`, document version `0`, undo/redo `0/0`, dirty `false`, event sequence `0`, no events, and byte-identical initial/final document. Each of the four operations has an observation; the rejection observation explicitly proves zero state/history/dirty/event delta.

## 3. Rows 1-28 — accepted commands

All rows use `assembly.core` and program `A8`.

| # | Scenario ID | Fixture | Exact accepted envelope recipe | Existing source assertion |
|---:|---|---|---|---|
| 1 | `command.accepted.core.document.set-metadata` | `fixture.core.full` | document `score-1`; metadata `{title:"Changed",authors:["Brilliant Guitar"],tempo:{bpm:120}}` | `test/core-kernel/command-system.test.ts`, `document, note, and note-value replacement...` |
| 2 | `command.accepted.core.note.set-written-pitch` | `fixture.core.full` | note `note-1`; written pitch D4 `{step:"D",alter:0,octave:4}` | same test |
| 3 | `command.accepted.core.event.set-note-value` | `fixture.core.full` | event `event-1`; note value `{base:8,dots:0}` | same test; committed with the accepted unsupported-duration assessment |
| 4 | `command.accepted.core.voice.insert-notes-event` | `fixture.core.incomplete` | voice `voice-1`, after `event-3`; insert `event-chord`, quarter duration, notes `note-chord-c` C4 and `note-chord-e` E4 | `test/core-kernel/command-system.test.ts`, `insert notes/rest and remove event...` |
| 5 | `command.accepted.core.voice.insert-rest-event` | `fixture.core.incomplete` | voice `voice-1`, after `event-3`; insert quarter rest `event-new` | same test |
| 6 | `command.accepted.core.event.remove` | `fixture.core.full` | remove `event-4` with `{}` payload | same test |
| 7 | `command.accepted.core.measure.insert` | `fixture.cvn3.shuffled` | document `cvn3-measure-score`; insert `cvn3-measure-oracle` after `cvn3-measure-1`, meter 4/4, contents ordered `cvn3-part-b` then `cvn3-part-a`, each from `createCvn3InsertedVoices(partId,"cvn3-measure-oracle")` | `test/core-kernel/cvn-3-measure-insert-remove.test.ts`, `insert canonicalizes shuffled Part payloads...` |
| 8 | `command.accepted.core.measure.remove` | `fixture.cvn3.shuffled` | remove `cvn3-measure-1` | same file, `remove deletes and restores the complete Measure aggregate...` |
| 9 | `command.accepted.core.measure.move` | `fixture.cvn3.shuffled` | move `cvn3-measure-3` to `{kind:"start"}` | `test/core-kernel/cvn-3-measure-move-definition.test.ts`, `move synchronizes all Part lists...` |
| 10 | `command.accepted.core.measure.set-definition` | `fixture.cvn3.ordered` | measure `cvn3-measure-1`; meter `{numerator:2,denominator:2}`, pickup `{kind:"none"}` | same file, `set-definition preserves exact no-op...` |
| 11 | `command.accepted.core.part.insert` | `fixture.cvn4.full` | document `cvn4-score`; after `cvn4-part-a`; `createCvn4InsertedPart("cvn4-part-inserted")` | `test/core-kernel/cvn-4-part-lifecycle.test.ts`, `Part insert canonicalizes...` |
| 12 | `command.accepted.core.part.remove` | `fixture.cvn4.full` | remove `cvn4-part-a` | same file, `Part removal owns only its aggregate...` |
| 13 | `command.accepted.core.part.move` | `fixture.cvn4.full` | move `cvn4-part-c` to `{kind:"start"}` | same file, `Part move changes only...` |
| 14 | `command.accepted.core.part.set-name` | `fixture.cvn4.full` | part `cvn4-part-a`; name exactly `"  Part A  "` | same test |
| 15 | `command.accepted.core.part.set-instrument` | `fixture.cvn4.full` | part `cvn4-part-a`; instrument `{name:"Violin",writtenToSounding:{diatonicSteps:0,chromaticSemitones:0}}` | same test |
| 16 | `command.accepted.core.staff.insert` | `fixture.cvn4.full` | part `cvn4-part-a`; after `cvn4-staff-a-1`; staff `{id:"cvn4-staff-a-inserted",lineCount:1,defaultClef:{sign:"C",line:3}}` | `test/core-kernel/cvn-4-staff-lifecycle.test.ts`, `Staff insert adds only...` |
| 17 | `command.accepted.core.staff.remove` | `fixture.cvn4.staff-a2-unreferenced` | remove `cvn4-staff-a-2` | same file, `Explicit reassignment unlocks Staff removal...`; fixture pre-applies only the stated equivalent data condition |
| 18 | `command.accepted.core.staff.move` | `fixture.cvn4.full` | move `cvn4-staff-a-2` to `{kind:"start"}` | same file, `Staff move distinguishes...` |
| 19 | `command.accepted.core.staff.set-definition` | `fixture.cvn4.full` | staff `cvn4-staff-a-1`; `{lineCount:1,defaultClef:{sign:"C",line:3}}` | same test |
| 20 | `command.accepted.core.voice.insert` | `fixture.cvn4.full` | part `cvn4-part-a`, measure `cvn4-measure-1`, after `cvn4-voice-a-1-primary`; `createCvn4InsertedVoice("cvn4-voice-inserted","cvn4-staff-a-1")` | `test/core-kernel/cvn-4-voice-lifecycle.test.ts`, `Voice insert resolves...` |
| 21 | `command.accepted.core.voice.remove` | `fixture.cvn4.full` | remove `cvn4-voice-a-1-primary` | same file, `Voice removal owns Event and Note descendants...` |
| 22 | `command.accepted.core.voice.move` | `fixture.cvn4.full` | move `cvn4-voice-a-1-secondary` to `{kind:"start"}` | same file, `Voice move enforces...` |
| 23 | `command.accepted.core.voice.set-default-staff` | `fixture.cvn4.full` | voice `cvn4-voice-a-1-primary`; staff `cvn4-staff-a-2` | same file, `Voice and Event staff replacements...` |
| 24 | `command.accepted.core.voice.set-sequence-start` | `fixture.cvn4.full` | voice `cvn4-voice-a-1-primary`; start `{numerator:1,denominator:4}` | same test |
| 25 | `command.accepted.core.event.set-staff-assignment` | `fixture.cvn4.full` | event `cvn4-event-a-1-notes`; assignment `{kind:"inherit-default"}` | same test |
| 26 | `command.accepted.core.range.delete` | `fixture.cvn4.full` | document `cvn4-score`; measure range start `cvn4-measure-3`, end `cvn4-measure-2` | `test/core-kernel/range-delete.test.ts`, `range delete normalizes reverse global measure endpoints...` |
| 27 | `command.accepted.core.range.transpose-written-pitch` | `fixture.cvn4.full` | document `cvn4-score`; reversed voice-event range rest→notes in `cvn4-voice-a-1-primary`; transposition `{diatonicSteps:1,chromaticSemitones:2}` | `test/core-kernel/range-transpose-written-pitch.test.ts`, `range transpose skips rests...` |
| 28 | `command.accepted.core.transaction.batch` | `fixture.core.full` | document `score-1`; children are metadata `First` then metadata `Second`, otherwise identical to row 1 | `test/core-kernel/batch-core-atomicity.test.ts`, `effective Core batch commits once...` |

## 4. Rows 29-56 — rejected commands

All rows use the same fixture, payload and source assertion as their accepted counterpart, `assembly.core`, and program `R4`.

| # | Scenario ID | Accepted row | Exact replacement target |
|---:|---|---:|---|
| 29 | `command.rejected.core.document.set-metadata` | 1 | `{kind:"document",documentId:"missing-score"}` |
| 30 | `command.rejected.core.note.set-written-pitch` | 2 | `{kind:"note",noteId:"missing-note"}` |
| 31 | `command.rejected.core.event.set-note-value` | 3 | `{kind:"event",eventId:"missing-event"}` |
| 32 | `command.rejected.core.voice.insert-notes-event` | 4 | `{kind:"voice",voiceId:"missing-voice"}` |
| 33 | `command.rejected.core.voice.insert-rest-event` | 5 | `{kind:"voice",voiceId:"missing-voice"}` |
| 34 | `command.rejected.core.event.remove` | 6 | `{kind:"event",eventId:"missing-event"}` |
| 35 | `command.rejected.core.measure.insert` | 7 | `{kind:"document",documentId:"missing-document"}` |
| 36 | `command.rejected.core.measure.remove` | 8 | `{kind:"measure",measureId:"missing-measure"}` |
| 37 | `command.rejected.core.measure.move` | 9 | `{kind:"measure",measureId:"missing-measure"}` |
| 38 | `command.rejected.core.measure.set-definition` | 10 | `{kind:"measure",measureId:"missing-measure"}` |
| 39 | `command.rejected.core.part.insert` | 11 | `{kind:"document",documentId:"missing-document"}` |
| 40 | `command.rejected.core.part.remove` | 12 | `{kind:"part",partId:"missing-part"}` |
| 41 | `command.rejected.core.part.move` | 13 | `{kind:"part",partId:"missing-part"}` |
| 42 | `command.rejected.core.part.set-name` | 14 | `{kind:"part",partId:"missing-part"}` |
| 43 | `command.rejected.core.part.set-instrument` | 15 | `{kind:"part",partId:"missing-part"}` |
| 44 | `command.rejected.core.staff.insert` | 16 | `{kind:"part",partId:"missing-part"}` |
| 45 | `command.rejected.core.staff.remove` | 17 | `{kind:"staff",staffId:"missing-staff"}` |
| 46 | `command.rejected.core.staff.move` | 18 | `{kind:"staff",staffId:"missing-staff"}` |
| 47 | `command.rejected.core.staff.set-definition` | 19 | `{kind:"staff",staffId:"missing-staff"}` |
| 48 | `command.rejected.core.voice.insert` | 20 | `{kind:"part",partId:"missing-part"}` |
| 49 | `command.rejected.core.voice.remove` | 21 | `{kind:"voice",voiceId:"missing-voice"}` |
| 50 | `command.rejected.core.voice.move` | 22 | `{kind:"voice",voiceId:"missing-voice"}` |
| 51 | `command.rejected.core.voice.set-default-staff` | 23 | `{kind:"voice",voiceId:"missing-voice"}` |
| 52 | `command.rejected.core.voice.set-sequence-start` | 24 | `{kind:"voice",voiceId:"missing-voice"}` |
| 53 | `command.rejected.core.event.set-staff-assignment` | 25 | `{kind:"event",eventId:"missing-event"}` |
| 54 | `command.rejected.core.range.delete` | 26 | `{kind:"document",documentId:"missing-document"}` |
| 55 | `command.rejected.core.range.transpose-written-pitch` | 27 | `{kind:"document",documentId:"missing-document"}` |
| 56 | `command.rejected.core.transaction.batch` | 28 | `{kind:"document",documentId:"missing-document"}` |

The generator first proves each accepted envelope strict-decodes on its declared fixture, then derives only the target replacement. If any row returns a failure other than `command.target-not-found`, RKP-0 stops for planning repair rather than choosing another rejection.

## 5. Rows 57-64 — cross-cutting programs

| # | Scenario ID | Fixture / assembly | Exact operation program and required result |
|---:|---|---|---|
| 57 | `cross.submit-noop-persisted-dirty` | `fixture.core.full` / `assembly.core` | subscribe; submit row-1 metadata (`committed`, v1, dirty true); submit it again (`no-op`, v1, no event); read; `markPersisted({documentId:"score-1",documentVersion:1})` (`updated`, dirty false); read; repeat mark (`no-op`); unsubscribe. Events are committed seq1, dirty-true seq2, dirty-false seq3 only. |
| 58 | `cross.undo-redo-tail-truncation` | `fixture.core.full` / `assembly.core` | subscribe; submit metadata `A`; submit metadata `B`; undo to `A`; submit metadata `C`; redo returns `{code:"history.empty-redo"}` with zero delta; read; unsubscribe. Final title is `C`, undo/redo `2/0`; no event is emitted by the rejected redo. |
| 59 | `cross.atomic-batch-commit` | `fixture.core.full` / `assembly.core` | program `A8` with row-28 batch. Submit, undo and redo each publish one aggregate committed event whose semantic identity is `core.transaction.batch`; the batch owns one version/history unit and final title `Second`. |
| 60 | `cross.batch-child-rejection-zero-delta` | `fixture.core.full` / `assembly.core` | subscribe; submit batch `[row-1 metadata title "Must not leak", {commandVersion:1,commandId:"core.unknown",target:{kind:"document",documentId:"score-1"},payload:{}}]`; read; unsubscribe. Exact failure is `{code:"command.batch-child-rejected",failedCommandIndex:1,failure:{code:"command.unknown-id"}}`; version/history/dirty/event/document remain initial. |
| 61 | `cross.semantic-replay-equality` | `fixture.core.full` / `assembly.core` | subscribe; live-submit row-1 metadata then row-2 pitch; read; call `replayCoreCommands` on a fresh initial fixture with the same two detached envelopes; unsubscribe. Replay status/results/final document/version equal the live path; replay does not mutate the live bus or append live events. |
| 62 | `cross.integrated-two-module-order-availability` | `fixture.cvn6.integrated` / `assembly.cvn6` | subscribe; read availability; submit `fixture.score.apply` on score with note `note-1`, D4, schema 1, marker `score-oracle`; submit `fixture.part.apply` on `part-1` with note `note-1`, C4, schema 1, marker `part-oracle`; read; unsubscribe. Store exact callback trace/counts, part-before-score canonical catalog order, validation/classification results, compatibility facts, two committed semantic identities and availability. Source: `module-transaction-atomicity.test.ts`, `module-validation-classification.test.ts`, `domain-availability.test.ts`. |
| 63 | `cross.detached-extension-migration` | active `fixture.cvn6.integrated` bus / same `assembly.cvn6` catalog | read active bus; call migration with the exact request at `test/core-kernel/extension-migration.test.ts:34-44` on source-version-1 block (`migrated`); call it on source already at version 2 (`not-required`, callbacks 0); call it with extensions `[]` (`rejected`, `migration.target-not-found`); read active bus. The active document/history/dirty/events/assembly remain byte-identical across all three detached calls. |
| 64 | `cross.assembly-mismatch-subscriber-isolation` | `fixture.cvn6.integrated`, `assembly.cvn6` and `assembly.cvn6.other` | create Registry from assembly A and bus from B; gateway creation returns `{code:"registry.assembly-mismatch"}` with no callback/state delta. On an A/A bus, subscribe `throwing` then `collector`, submit `fixture.score.apply` using the row-62 score payload, await one microtask turn, read, unsubscribe both. Submit commits once; collector receives the committed/dirty events in order despite the first handler throwing/rejecting. Sources: `integrated-assembly-identity.test.ts` and `event-system.test.ts`. |

Every cross-cutting operation has one observation. The scenario stores an `initialState` and `finalState`; rows 60, 63 active-state projection, and the mismatch half of row 64 require exact zero delta.

## 6. Mechanical completeness gate

The implementation declares a literal ordered tuple of the 64 IDs above. The manifest test verifies:

1. rows `1..28` equal the live catalog order with `command.accepted.` prefix;
2. rows `29..56` equal the same order with `command.rejected.` prefix;
3. rows `57..64` equal the cross-cutting table order;
4. each operation index is dense from zero and has exactly one same-index observation;
5. every accepted row has the `A8` inverse equality proof;
6. every rejected row and declared cross-cutting rejection has explicit zero-delta hashes;
7. source paths and test-title substrings are literal data in `ts-oracle-fixtures.ts`, so missing/renamed authority fails instead of silently selecting a substitute.
