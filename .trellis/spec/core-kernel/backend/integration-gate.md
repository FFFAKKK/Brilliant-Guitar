# Core Kernel Integration Gate

> **Implementation candidate（2026-07-21）:** K1-6 candidate `3dffa71c44d0eacb81d391714b855799f9e5cae9` passes 8/8 focused integration tests and 169/169 full tests. Independent acceptance is pending; this document does not close Pure Core Kernel V1.

## 1. Scope / Trigger

K1-6 is the cross-contract acceptance gate for the already accepted K1-1 through K1-5 public Core surface. It consumes these fixed inputs:

- K1-5 implementation baseline `51fa2177cbd25dea53f1ebaf23bd8b8426471589`;
- K1-5 acceptance documentation baseline `ed801a9fa1a69222188c3ca04ee243b48d7a92d2`;
- K1-6 activation baseline `3f6ae5d4467f560e6341e78ce6c7d3bdd46a3830`;
- K1-6 implementation candidate `3dffa71c44d0eacb81d391714b855799f9e5cae9`.

The gate adds integration tests and active documentation only. It introduces no production source, public export, schema, dependency, Guitar Domain, physical `.bgp` IO, UI, renderer, playback, import/export, network, Extension Host, or third-party runtime behavior.

## 2. Signatures

K1-6 must exercise the accepted public entry point at `src/core-kernel/index.ts`; it must not import private mutation, history, registry table, decoder dependency, or report-builder seams.

```typescript
decodeScoreDocument(input: unknown): DecodeScoreDocumentResult
encodeScoreDocumentJson(document: unknown): EncodeScoreDocumentJsonResult
parseScoreDocumentJson(json: string): ParseScoreDocumentJsonResult
validateScoreDocumentSemantics(document: ScoreDocument): ValidationReport
validateScoreFeatureProfile(document: ScoreDocument): ScoreSupportResult
migrateScoreDocument(input: unknown): MigrationResult

CommandBus.create(document: ScoreDocument): CommandBusCreationResult
createKernelRegistry(manifest: KernelStartupModuleManifest): KernelRegistryCreationResult
registry.createGateway(moduleId: string, bus: CommandBus): KernelModuleGatewayCreationResult
replayCoreCommands(document: ScoreDocument, commands: readonly CoreCommand[]): ReplayCoreCommandsResult
createKernelValidationReport(diagnostics: readonly Diagnostic[]): KernelReport<"validation">
```

The authorized gateway is the only module-facing write/read path in the integration scenario: `submit`, `undo`, `redo`, `read`, `select`, `subscribe`, and `summary`. The trusted host uses `CommandBus.markPersisted()` only for the accepted checkpoint transition.

## 3. Contracts

### Canonical fixture

- `schemaVersion`: `brilliant-score-1`;
- document: `score-k1-6`;
- four ordered 4/4 measures: `measure-k1-6-1` through `measure-k1-6-4`;
- one Part/Staff: `part-k1-6` / `staff-k1-6`;
- one Voice per measure, four quarter-note events per Voice;
- first event in each measure contains one note; the remaining events are rests;
- score extension `example.k1-6.score@7` and Part-owned extension `example.k1-6.part@3` contain deep opaque JSON and must remain deeply equal through every applicable path.

### Successful public flow

The exact accepted command sequence is:

1. set `note-k1-6-1-1` from C4 to D4;
2. set `event-k1-6-1-1` from quarter to eighth;
3. insert eighth rest `event-k1-6-1-1b` after that event.

The second commit is semantic-valid but reports `unsupported.sequence-duration`; the third commit restores `supported`. Replay from a fresh fixture must produce the version-3 document and results deeply equal to the live version-3 state.

| Sequence | Event | Cause | Document version | History after action | Dirty after action |
|---:|---|---|---:|---|---|
| 1 | `core.document.committed` | `submit` | 1 | `1 / 0` | `true` |
| 2 | `core.session.dirty-state-changed` | `submit` | 1 | `1 / 0` | `true` |
| 3 | `core.session.dirty-state-changed` | `mark-persisted` | 1 | `1 / 0` | `false` |
| 4 | `core.document.committed` | `submit` | 2 | `2 / 0` | `true` |
| 5 | `core.session.dirty-state-changed` | `submit` | 2 | `2 / 0` | `true` |
| 6 | `core.document.committed` | `submit` | 3 | `3 / 0` | `true` |
| 7 | `core.document.committed` | `undo` | 4 | `2 / 1` | `true` |
| 8 | `core.document.committed` | `redo` | 5 | `3 / 0` | `true` |

Selectors must agree with the same version-3 state for metadata, inserted event, ownership, four-measure range, history, and dirty state. Undo must return to the unsupported version-2 content; redo must restore the supported version-3 content at document version 5.

## 4. Validation & Error Matrix

| Condition | Required observable result | State/event rule |
|---|---|---|
| future `brilliant-score-2` | decode failure; `migration.unsupported-source-version` | no migrated document |
| duplicate global event ID | decode succeeds; `semantic.id-duplicate`; `migration.semantic-invalid` | no migrated document |
| semantic-valid chord | `unsupported.chord`; validation report `completed-with-warnings` | migration remains `not-required` |
| empty undo | `history.empty-undo` | version/history/dirty unchanged; no event |
| missing selected event | `read.entity-not-found` | CommandBus state unchanged |
| checkpoint document mismatch | `checkpoint.document-mismatch` | clean identity unchanged; no event |
| invalid subscription handler | `event.invalid-handler` | no subscription or event |
| missing command target | `command.target-not-found` | atomic rejection; no event |
| missing `command:execute` capability | `registry.capability-denied` with module/capability details | denial occurs before mutation |
| throwing or rejecting subscriber | committed state and later subscribers continue | private error text never enters public output |
| hostile sparse/getter report input | `report.invalid-input` | getter call count remains zero |

## 5. Good / Base / Bad Cases

- Good: the three-command authorized flow reaches version 3, replay matches it, undo/redo reach versions 4/5, all selectors agree, and both opaque extensions are preserved.
- Base: the current-schema fixture passes decode, semantic validation, supported profile classification, JSON round-trip, and detached frozen `not-required` migration without starting a session.
- Bad: malformed, semantic-invalid, unauthorized, missing-target, invalid-handler, and hostile runtime inputs return their closed public data contracts without partial state or private exception leakage.

## 6. Tests Required

- `test/core-kernel/core-kernel-integration.test.ts`: foundation round-trip, successful full trace, and deep repeatability across two fresh runs.
- `test/core-kernel/core-kernel-integration-boundaries.test.ts`: future/semantic separation, unsupported chord, authorized failure atomicity, capability denial, subscriber/report privacy.
- Focused gate: exactly 8/8 tests.
- Full gate on the accepted 161-test input baseline: exactly 169/169 tests.
- `npm run typecheck`, `npm run build`, `git diff --check`, and Trellis task validation must pass.
- `src/**`, `package.json`, `tsconfig.json`, `public-api-boundary.test.ts`, and `forbidden-dependency-boundary.test.ts` must have no K1-6 diff.

## 7. Wrong vs Correct

### Wrong

```typescript
// Bypasses accepted orchestration and proves only isolated utility behavior.
const mutable = structuredClone(document);
mutable.parts[0]!.measureContents[0]!.voices[0]!.sequence.events.push(event);
```

### Correct

```typescript
const result = gateway.submit({
  commandVersion: 1,
  commandId: "core.voice.insert-rest-event",
  target: { kind: "voice", voiceId: "voice-k1-6-1" },
  payload: {
    anchor: { kind: "after-event", eventId: "event-k1-6-1-1" },
    event,
  },
});
```

The correct path proves capability authorization, strict command decoding, atomic mutation/history, snapshot/selector coherence, event ordering, dirty state, replay, and privacy through the accepted public surface.

## Candidate Gate

`K1-6 implementation candidate complete; independent acceptance pending.`

Pure Core Kernel V1 is not formally closed until a separate reviewer records an accepted baseline. Guitar Domain and product-layer implementation remain unauthorized.
