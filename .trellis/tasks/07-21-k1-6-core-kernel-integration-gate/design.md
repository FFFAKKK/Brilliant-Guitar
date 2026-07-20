# K1-6 Core Kernel Integration Gate — Design

> **Status: FINAL PLAN APPROVED / READY FOR OPERATOR START（2026-07-21）.** 用户已批准 `DEC-K1-6-001` 至 `DEC-K1-6-005` 以及完整 PRD/design/implement 规划。本文件只定义 K1-6 集成验收设计；任务仍保持 planning，必须由操作者显式执行 Trellis start gate 后才能按批准范围实施。

## 1. Authority and Baseline

- K1-1 through K1-5 active contracts under `.trellis/spec/core-kernel/` are frozen inputs.
- K1-5 implementation baseline: `51fa2177cbd25dea53f1ebaf23bd8b8426471589`.
- K1-5 independent acceptance documentation baseline: `ed801a9fa1a69222188c3ca04ee243b48d7a92d2`.
- K1-5 acceptance closure, archive, journal, and active-document convergence are present before K1-6 planning baseline `321064d`.
- K1-6 planning seed: `c4cd4f2`.
- Current repository evidence contains no accepted Guitar Domain implementation under `src/` or `test/`; Guitar terminology appears only in future-boundary documentation and the profile name.

## 2. Purpose and Non-goals

K1-6 proves that K1-1 through K1-5 behave as one Pure Core Kernel V1 rather than a collection of independently green utilities. It adds integration evidence, not new application behavior.

The approved implementation shape is test-and-documentation only:

- no planned production source modification;
- no new public API or schema member;
- no replacement of accepted focused unit tests;
- no Guitar Domain, UI, desktop, renderer, playback, physical IO, import/export, network, or third-party runtime;
- no dynamic Registry contribution, public patch, mutable document access, wall clock, randomness, or generated identity.

If a RED integration test proves a production defect, the operator must stop at the failing evidence. A private repair requires a focused repair addendum and explicit authorization; any public contract or schema change requires K1-6 replanning.

## 3. Approved Decisions

- **DEC-K1-6-001 — Test-and-documentation gate:** K1-6 does not proactively modify production code.
- **DEC-K1-6-002 — Fixture strategy:** create one canonical four-measure fixture plus small focused negative clones; do not build a second general fixture framework.
- **DEC-K1-6-003 — Guitar exclusion:** exclude Guitar Domain because no independently accepted implementation prerequisite exists.
- **DEC-K1-6-004 — Repeatability:** execute the complete public-flow scenario twice from fresh inputs and deeply compare its observable traces.
- **DEC-K1-6-005 — Defect handling:** stop and replan for public contract/schema drift; separately authorize any focused private repair.

## 4. Architecture

```text
canonical four-measure unknown input
  -> decodeScoreDocument
  -> validateScoreDocumentSemantics
  -> validateScoreFeatureProfile
  -> encodeScoreDocumentJson / parseScoreDocumentJson
  -> migrateScoreDocument (not-required, detached candidate)
  -> CommandBus.create
  -> createKernelRegistry(public manifest)
  -> KernelModuleGateway(public consumer)
       -> subscribe
       -> submit semantic commands
       -> read / select
       -> undo / redo
  -> CommandBus.markPersisted (trusted host checkpoint)
  -> replayCoreCommands
  -> KernelIssue / KernelReport projections
  -> deterministic observable trace
```

Every integration import comes from `src/core-kernel/index.ts`. Tests may define local unwrapping/assertion helpers, fixture builders, and trace types, but none are exported from production code.

## 5. File Responsibilities

K1-6 remains one Trellis task. The fixture, successful flow, boundary flow, and documentation gate are ordered dependencies of one final acceptance result; splitting them into child tasks would duplicate the same baseline and lifecycle. Tasks 1–3 remain independently reviewable commits, and `implement.md` states each dependency explicitly.

### Planned test files

- `test/core-kernel/fixtures/k1-6-score.ts`
  - owns `createK1_6ScoreFixture()` and `cloneK1_6ScoreFixture()`;
  - contains exactly one general one-Part, one-staff, one-voice-per-measure, four-measure 4/4 score;
  - contains deterministic stable IDs and deep score-owned plus part-owned unknown extensions;
  - does not replace or modify `fixtures/core-score.ts`.
- `test/core-kernel/core-kernel-integration.test.ts`
  - owns the successful public end-to-end scenario, observable trace, deterministic repeat, extension preservation, event order, history/dirty/read coherence, and replay comparison.
- `test/core-kernel/core-kernel-integration-boundaries.test.ts`
  - owns representative invalid, semantic-invalid, profile-unsupported, command atomicity, capability denial, handler isolation, report/privacy, and public-boundary integration cases.

### Planned documentation files

- Create `.trellis/spec/core-kernel/backend/integration-gate.md` only after the implementation candidate passes all gates; it records tested cross-contract invariants and exclusions, not a new runtime API.
- Update `.trellis/spec/core-kernel/backend/index.md` and `.trellis/spec/core-kernel/index.md` to link the K1-6 gate and candidate/accepted status.
- Update the K1-6 PRD/design/implement record, Pure Core Kernel parent task, and directly conflicting product status lines with the actual candidate commit and fresh test total.
- Do not edit archived K1-1 through K1-5 decisions, `planning-snapshots/`, retired plans, or `notes/context-snapshot.md`.

No `src/**`, package configuration, dependency, schema, or public-export file is planned for modification.

## 6. Canonical Fixture Contract

The fixture is a supported `brilliant-score-1` document with these identities:

- document: `score-k1-6`;
- measures: `measure-k1-6-1` through `measure-k1-6-4`, all 4/4;
- part/staff: `part-k1-6`, `staff-k1-6`;
- voices: `voice-k1-6-1` through `voice-k1-6-4`;
- each measure contains four quarter events and exactly fills the measure;
- first event of each measure is a one-note notes event; remaining events are rests;
- all event/note IDs are globally unique and derived from fixed literals, never array positions at runtime;
- score extension namespace `example.k1-6.score`, schemaVersion `7`, with nested objects/arrays;
- part extension namespace `example.k1-6.part`, schemaVersion `3`, owned by `part-k1-6`, with a distinct deep payload.

Initial expectations:

- strict decode succeeds and returns a detached value;
- semantic report is `{ ok: true, diagnostics: [] }`;
- K1 profile result is `{ status: "supported", diagnostics: [] }`;
- JSON encode/parse round-trip is deeply equal;
- migration returns `not-required`, a completed empty migration report, and a detached deeply frozen document;
- both unknown extensions remain deeply equal.

## 7. Successful Public Scenario

The test creates a Registry manifest with the accepted `core.commands` and `core.selectors` owners plus one `official + internal-module + system-trusted` consumer named `internal.k1-6-integration`. The consumer has only:

```typescript
[
  "registry:read",
  "command:execute",
  "selector:execute",
  "score:read",
  "event:subscribe",
]
```

It owns no registration entry. The gateway delegates to one `CommandBus` built from the detached migration result.

The exact operation sequence is:

1. Subscribe a recording handler, a synchronous throwing handler, and a Promise-rejecting handler through the authorized gateway.
2. Submit `core.note.set-written-pitch` for `note-k1-6-1-1`, changing C4 to D4.
3. Mark `{ documentId: "score-k1-6", documentVersion: 1 }` persisted through the trusted host `CommandBus` API.
4. Submit `core.event.set-note-value` for `event-k1-6-1-1`, changing a quarter to an eighth. The document remains semantic-valid but becomes profile-unsupported with exactly `unsupported.sequence-duration`.
5. Submit `core.voice.insert-rest-event` into `voice-k1-6-1` after `event-k1-6-1-1`, using caller-supplied `event-k1-6-1-1b` with an eighth duration. Support returns to `supported`.
6. Read the immutable state and select metadata, the inserted event, its ownership, the four-measure range, history state, and dirty state through the gateway.
7. Replay the three accepted commands from a fresh canonical fixture and compare the replay document with the live version-3 document.
8. Undo the insert and verify version 4, unsupported support, undoDepth 2, redoDepth 1.
9. Redo the insert and verify version 5, supported support, undoDepth 3, redoDepth 0.
10. Verify the version-5 document is deeply equal to the version-3/replay document while its session version remains correctly higher.

Expected event order:

| Sequence | Event | Cause | Document version | Fact |
|---:|---|---|---:|---|
| 1 | `core.document.committed` | `submit` | 1 | pitch command |
| 2 | `core.session.dirty-state-changed` | `submit` | 1 | `dirty: true` |
| 3 | `core.session.dirty-state-changed` | `mark-persisted` | 1 | `dirty: false` |
| 4 | `core.document.committed` | `submit` | 2 | note-value command |
| 5 | `core.session.dirty-state-changed` | `submit` | 2 | `dirty: true` |
| 6 | `core.document.committed` | `submit` | 3 | insert command |
| 7 | `core.document.committed` | `undo` | 4 | inverse insert |
| 8 | `core.document.committed` | `redo` | 5 | forward insert |

The throwing and rejecting subscribers must not change this recording handler trace, roll back commits, stop later handlers, or expose `PRIVATE_K1_6_SUBSCRIBER_FAILURE`.

## 8. Observable Determinism Contract

`runK1_6IntegrationScenario()` is test-local and returns only public observable values:

```typescript
interface K1_6IntegrationTrace {
  readonly roundTripDocument: ScoreDocument;
  readonly migration: MigrationResult;
  readonly registrySummary: RegistrySummary;
  readonly commandResults: readonly CommandResult[];
  readonly checkpointResult: MarkPersistedResult;
  readonly version3Read: KernelReadState;
  readonly selectorFacts: Readonly<{
    metadata: unknown;
    insertedEvent: unknown;
    ownership: unknown;
    measureRange: unknown;
    history: unknown;
    dirty: unknown;
  }>;
  readonly replay: ReplayCoreCommandsResult;
  readonly undoResult: CommandResult;
  readonly redoResult: CommandResult;
  readonly finalRead: KernelReadState;
  readonly events: readonly KernelEvent[];
}
```

Two fresh calls must be deeply equal. The trace contains no date, duration, random ID, stack, raw Error, function, Registry internals, mutable history entry, or internal mutation.

## 9. Boundary Scenarios

Focused clones and public calls prove:

1. **Future schema:** decode rejects with stable decode diagnostics; migration rejects with `migration.unsupported-source-version`; no candidate document exists.
2. **Semantic invalid:** a duplicate stable entity ID decodes structurally, fails semantic validation, produces a rejected validation report, and migration rejects with all semantic diagnostics in order.
3. **Profile unsupported:** adding a second uniquely identified note to one notes event remains semantic-valid, yields exactly `unsupported.chord`, and produces a `completed-with-warnings` validation report; it is not a migration failure.
4. **Session/command rejection atomicity:** on one fresh authorized session, empty undo, missing-entity selector, wrong-document checkpoint, invalid event subscription, and a command targeting a missing note return their accepted history/read/checkpoint/event/command failures; document/version/history/dirty/events stay unchanged and each mapped issue preserves the stable code.
5. **Capability denial:** a declared internal module with no capabilities can receive a gateway but its submit is rejected with `registry.capability-denied`; mapping exposes only approved module/capability details and does not reach CommandBus state.
6. **Handler isolation/privacy:** synchronous and asynchronous subscriber failures containing a private sentinel do not escape, alter commits, or appear anywhere in public results/events.
7. **Malformed report input:** invoking the runtime validation-report entry with a hostile or malformed value returns a rejected `report.invalid-input` report without throwing or executing an accessor.

These are representative integration cases. Exhaustive per-code and per-codec unit coverage remains owned by K1-1 through K1-5 tests and must not be duplicated.

## 10. Requirement Traceability

| Requirement | Planned evidence |
|---|---|
| K1-6-REQ-001 | Tasks 0 and 4 freeze the baseline and prove no `src/**` or public-boundary change. |
| K1-6-REQ-002 | Task 1 owns the deterministic detached four-measure fixture and codec/validation/migration test. |
| K1-6-REQ-003～005 | Task 2 owns the authorized write path, read/history/event coherence, undo/redo, and replay equality. |
| K1-6-REQ-006～007 | Task 3 owns representative atomic failures, issue mapping, privacy, and unsupported separation. |
| K1-6-REQ-008 | Tasks 1 and 2 compare both unknown extensions after codec, migration, live commands, replay, undo, and redo. |
| K1-6-REQ-009 | Task 4 proves source/public-export/dependency boundaries and records the active integration spec. |
| K1-6-REQ-010 | Tasks 4 and 5 own the fresh candidate gate, document convergence, and independent acceptance handoff. |

## 11. Verification Gates

Focused gate:

```powershell
npm run build
node --test dist/test/core-kernel/core-kernel-integration.test.js dist/test/core-kernel/core-kernel-integration-boundaries.test.js
```

Full candidate gate:

```powershell
npm run typecheck
npm run build
npm test
git diff --check
python .\.trellis\scripts\task.py validate .trellis\tasks\07-21-k1-6-core-kernel-integration-gate
```

The full suite must include the existing public-export and forbidden-dependency tests. If Node test workers fail with sandbox `spawn EPERM`, rerun the identical official command in the approved environment; do not change product code or test semantics to bypass the environment.

## 12. Candidate and Acceptance Lifecycle

- The implementation operator creates a K1-6 branch only after explicit final-plan approval and `task.py start` authorization.
- Test commits must not claim acceptance. They produce an implementation candidate with exact HEAD, focused count, full count, and preserved unrelated paths.
- Active docs may say only `implementation candidate / independent acceptance pending` until a separate reviewer returns a verdict.
- Only after that verdict may planning documents record a fixed accepted baseline and archive K1-6.
- K1-6 acceptance closes Pure Core Kernel V1 integration; it does not authorize Guitar Domain or any product-layer implementation.
