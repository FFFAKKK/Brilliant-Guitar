# K1-6 Core Kernel Integration Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` in inline mode and complete this plan task-by-task. Do not dispatch implementation or check sub-agents for this repository workflow. The user approved the final PRD/design/implement set on 2026-07-21; an operator may now run the explicit Trellis start gate, but may not broaden this plan.

**Goal:** Add test-only integration evidence proving the accepted K1-1 through K1-5 public contracts form one deterministic, privacy-safe Pure Core Kernel V1, then record a separately reviewable implementation candidate.

**Architecture:** A new four-measure fixture is consumed only through `src/core-kernel/index.ts`. One successful scenario crosses codec, semantic/profile validation, migration, Registry/gateway, CommandBus, checkpoint, read/selectors, events, undo/redo, replay, issue/report boundaries, and is repeated deeply; a second file covers representative invalid, unsupported, authorization, atomicity, and privacy paths. No production source change is planned.

**Tech Stack:** TypeScript 5.8, Node.js built-in test runner, `node:assert/strict`, existing Core public API, no new dependency.

**Current status:** FINAL PLAN APPROVED / READY FOR OPERATOR START. The Trellis task intentionally remains `planning` with `branch: null` until the operator starts it; no implementation work is part of the planning approval commit.

## Global Constraints

- Planner-approved scope is tests, fixtures, and active documentation only; no planned `src/**`, package, dependency, schema, or public-export modification.
- Use only imports from `src/core-kernel/index.ts` in K1-6 integration tests. The fixture may import public types from the same index.
- Preserve all K1-1 through K1-5 signatures, code strings, result meanings, ordering, freezing, and privacy contracts.
- Use fixed caller-owned IDs. No clock, randomness, UUID, array-index addressing, tick/slot/RhythmSlot, patch, JSON path, or mutable document API.
- Do not modify `test/core-kernel/fixtures/core-score.ts`; K1-6 owns a separate fixture.
- Do not add Guitar Domain, physical `.bgp` IO, import/export, UI, Tauri, renderer, layout, playback, network, Extension Host, or third-party runtime.
- K1-6 is a characterization/acceptance gate. Do not manufacture a failing test merely to satisfy RED. If an approved cross-contract assertion fails, preserve the failing evidence and stop; do not edit production code without the repair authorization defined in `design.md`.
- Every public output captured in a deterministic trace must be plain observable data. Do not capture functions such as `unsubscribe`, live Registry/CommandBus objects, test duration, Error objects, or process/environment data.
- Preserve unrelated user-owned untracked paths and never stage them.

---

## Task 0: Activate Only After Final Plan Approval

**Files:**

- Read: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/prd.md`
- Read: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/design.md`
- Read: `.trellis/spec/core-kernel/index.md`
- Read: `.trellis/spec/core-kernel/backend/index.md`
- Read: `.trellis/spec/core-kernel/backend/quality-guidelines.md`
- Read: `.trellis/workflow.md`

**Interfaces:**

- Consumes the explicitly approved planning set and the accepted K1-1 through K1-5 baseline.
- Produces one activated K1-6 branch and a recorded pre-change gate; it produces no runtime behavior.

- [ ] **Step 1: Confirm planning approval and task state**

Run:

```powershell
Get-Content .trellis\tasks\07-21-k1-6-core-kernel-integration-gate\task.json
```

Expected before activation: `status` is `planning`, `branch` is `null`, and the notes say implementation is not authorized. Stop unless the user has explicitly approved all three planning documents.

- [ ] **Step 2: Load implementation context**

Use `trellis-before-dev` to read the task artifacts and active Core specs. Inline mode skips implement/check jsonl curation.

- [ ] **Step 3: Start the task with the project workflow**

Run the project-provided Trellis start action. Expected: task becomes `in_progress` and the created/switched branch uses the `codex/` prefix. Do not manually broaden scope during activation.

- [ ] **Step 4: Record the clean baseline**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
npm run typecheck
npm run build
npm test
git diff --check
```

Expected: typecheck/build pass, the pre-K1-6 full suite reports 161/161, and diff check passes. The known user-owned untracked paths may remain; no K1-6 tracked change exists yet. If `npm test` fails only with Node `spawn EPERM`, rerun the identical command in the approved environment.

---

## Task 1: Add the Canonical Four-measure Fixture and Foundation Test

**Files:**

- Create: `test/core-kernel/fixtures/k1-6-score.ts`
- Create: `test/core-kernel/core-kernel-integration.test.ts`

**Interfaces:**

- Produces `createK1_6ScoreFixture(): ScoreDocument` and `cloneK1_6ScoreFixture(): ScoreDocument` for K1-6 tests only.
- Produces one public-API foundation test; Tasks 2 and 3 consume the fixture without modifying its contract.

- [ ] **Step 1: Create the isolated fixture**

Add `test/core-kernel/fixtures/k1-6-score.ts` with this structure and exact identities:

```typescript
import type {
  PartMeasureContent,
  ScoreDocument,
  WrittenPitch,
} from "../../../src/core-kernel/index";

type EventIds = readonly [string, string, string, string];

function measureContent(
  measureId: string,
  voiceId: string,
  eventIds: EventIds,
  noteId: string,
  writtenPitch: WrittenPitch,
): PartMeasureContent {
  return {
    measureId,
    voices: [
      {
        id: voiceId,
        defaultStaffId: "staff-k1-6",
        sequence: {
          start: { numerator: 0, denominator: 1 },
          events: [
            {
              id: eventIds[0],
              duration: { base: 4, dots: 0 },
              content: {
                kind: "notes",
                notes: [{ id: noteId, writtenPitch }],
              },
            },
            {
              id: eventIds[1],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
            {
              id: eventIds[2],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
            {
              id: eventIds[3],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
          ],
        },
      },
    ],
  };
}

export function createK1_6ScoreFixture(): ScoreDocument {
  return {
    schemaVersion: "brilliant-score-1",
    id: "score-k1-6",
    metadata: {
      title: "K1-6 integration fixture",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 96 },
    },
    measureDefinitions: [
      { id: "measure-k1-6-1", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-2", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-3", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-4", meter: { numerator: 4, denominator: 4 } },
    ],
    parts: [
      {
        id: "part-k1-6",
        name: "Concert instrument",
        instrument: {
          name: "Piano",
          writtenToSounding: {
            diatonicSteps: 0,
            chromaticSemitones: 0,
          },
        },
        staves: [
          {
            id: "staff-k1-6",
            lineCount: 5,
            defaultClef: { sign: "G", line: 2 },
          },
        ],
        measureContents: [
          measureContent(
            "measure-k1-6-1",
            "voice-k1-6-1",
            [
              "event-k1-6-1-1",
              "event-k1-6-1-2",
              "event-k1-6-1-3",
              "event-k1-6-1-4",
            ],
            "note-k1-6-1-1",
            { step: "C", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-2",
            "voice-k1-6-2",
            [
              "event-k1-6-2-1",
              "event-k1-6-2-2",
              "event-k1-6-2-3",
              "event-k1-6-2-4",
            ],
            "note-k1-6-2-1",
            { step: "D", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-3",
            "voice-k1-6-3",
            [
              "event-k1-6-3-1",
              "event-k1-6-3-2",
              "event-k1-6-3-3",
              "event-k1-6-3-4",
            ],
            "note-k1-6-3-1",
            { step: "E", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-4",
            "voice-k1-6-4",
            [
              "event-k1-6-4-1",
              "event-k1-6-4-2",
              "event-k1-6-4-3",
              "event-k1-6-4-4",
            ],
            "note-k1-6-4-1",
            { step: "F", alter: 0, octave: 4 },
          ),
        ],
      },
    ],
    extensions: [
      {
        namespace: "example.k1-6.score",
        schemaVersion: 7,
        owner: { kind: "score" },
        payload: {
          label: "preserve-score-extension",
          nested: { flags: [true, false], count: 4 },
        },
      },
      {
        namespace: "example.k1-6.part",
        schemaVersion: 3,
        owner: { kind: "part", partId: "part-k1-6" },
        payload: {
          label: "preserve-part-extension",
          annotations: [{ kind: "opaque", values: [1, 2, 3] }],
        },
      },
    ],
  };
}

export function cloneK1_6ScoreFixture(): ScoreDocument {
  return structuredClone(createK1_6ScoreFixture());
}
```

- [ ] **Step 2: Add the public foundation test**

Create `test/core-kernel/core-kernel-integration.test.ts`. Import runtime APIs only from `../../src/core-kernel/index` and add:

```typescript
import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  createKernelValidationReport,
  decodeScoreDocument,
  encodeScoreDocumentJson,
  migrateScoreDocument,
  parseScoreDocumentJson,
  validateScoreDocumentSemantics,
  validateScoreFeatureProfile,
} from "../../src/core-kernel/index";
import { cloneK1_6ScoreFixture } from "./fixtures/k1-6-score";

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

test("four-measure fixture traverses codec validation profile and migration", () => {
  const source = cloneK1_6ScoreFixture();
  const decoded = decodeScoreDocument(source);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error("expected K1-6 fixture to decode");
  assert.notEqual(decoded.value, source);
  assert.deepEqual(validateScoreDocumentSemantics(decoded.value), {
    ok: true,
    diagnostics: [],
  });
  assert.deepEqual(validateScoreFeatureProfile(decoded.value), {
    status: "supported",
    diagnostics: [],
  });

  const encoded = encodeScoreDocumentJson(decoded.value);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("expected K1-6 fixture to encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected K1-6 fixture JSON to parse");
  assert.deepEqual(parsed.value, decoded.value);

  const migrated = migrateScoreDocument(source);
  assert.equal(migrated.status, "not-required");
  if (migrated.status !== "not-required") {
    throw new Error("expected current schema to need no migration");
  }
  assert.deepEqual(migrated.document, decoded.value);
  assert.notEqual(migrated.document, source);
  assertDeeplyFrozen(migrated.document);
  assert.deepEqual(migrated.report, {
    reportVersion: 1,
    kind: "migration",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
  assert.deepEqual(createKernelValidationReport([]), {
    reportVersion: 1,
    kind: "validation",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
});
```

- [ ] **Step 3: Run the fixture foundation gate**

Run:

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/core-kernel-integration.test.js
```

Expected: typecheck/build pass and 1/1 focused test passes. Any product assertion failure is a K1-6 defect finding; stop rather than weakening the assertion.

- [ ] **Step 4: Commit Task 1**

```powershell
git add test/core-kernel/fixtures/k1-6-score.ts test/core-kernel/core-kernel-integration.test.ts
git commit -m "test(core): add k1-6 integration fixture"
```

---

## Task 2: Add the Successful Public Integration Trace

**Files:**

- Modify: `test/core-kernel/core-kernel-integration.test.ts`

**Interfaces:**

- Consumes the K1-6 fixture and public Core APIs.
- Produces test-local `runK1_6IntegrationScenario()` and two behavioral tests; no helper is exported from production.

- [ ] **Step 1: Add exact public command and manifest builders**

Extend imports with the public types/functions used by the scenario:

```typescript
import {
  CommandBus,
  createKernelRegistry,
  replayCoreCommands,
  type CommandResult,
  type KernelEvent,
  type KernelReadState,
  type KernelStartupModuleManifest,
  type MarkPersistedResult,
  type MigrationResult,
  type ReadResult,
  type RegistrySummary,
  type ReplayCoreCommandsResult,
  type ScoreDocument,
} from "../../src/core-kernel/index";
```

Add the exact manifest and commands:

```typescript
function integrationManifest(): KernelStartupModuleManifest {
  return {
    startupManifestVersion: 1,
    modules: [
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
      {
        moduleId: "internal.k1-6-integration",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [
          "registry:read",
          "command:execute",
          "selector:execute",
          "score:read",
          "event:subscribe",
        ],
        registrationEntryIds: [],
      },
    ],
  };
}

const ACCEPTED_COMMANDS = [
  {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: "note-k1-6-1-1" },
    payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
  },
  {
    commandVersion: 1,
    commandId: "core.event.set-note-value",
    target: { kind: "event", eventId: "event-k1-6-1-1" },
    payload: { noteValue: { base: 8, dots: 0 } },
  },
  {
    commandVersion: 1,
    commandId: "core.voice.insert-rest-event",
    target: { kind: "voice", voiceId: "voice-k1-6-1" },
    payload: {
      anchor: { kind: "after-event", eventId: "event-k1-6-1-1" },
      event: {
        id: "event-k1-6-1-1b",
        duration: { base: 8, dots: 0 },
        content: { kind: "rest" },
      },
    },
  },
] as const;
```

- [ ] **Step 2: Add strict local unwrapping helpers**

Add local helpers that throw only when the fixture/test setup violates an expected public branch:

```typescript
function requireBus(document: ScoreDocument): CommandBus {
  const created = CommandBus.create(document);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected K1-6 CommandBus");
  return created.value;
}

function requireReadResult<T>(result: ReadResult<T>): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected successful K1-6 selector/read");
  return result.value;
}

function requireAuthorized<T>(
  result: { readonly status: "authorized"; readonly value: T } |
    { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized K1-6 gateway result");
  }
  return result.value;
}
```

- [ ] **Step 3: Implement the observable trace runner**

Add this test-local trace type:

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

Implement `runK1_6IntegrationScenario()` with the exact sequence below:

```typescript
function runK1_6IntegrationScenario(): K1_6IntegrationTrace {
  const initial = cloneK1_6ScoreFixture();
  const encoded = encodeScoreDocumentJson(initial);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("expected K1-6 scenario encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected K1-6 scenario parse");
  const migration = migrateScoreDocument(parsed.value);
  assert.equal(migration.status, "not-required");
  if (migration.status !== "not-required") {
    throw new Error("expected detached K1-6 migration candidate");
  }

  const bus = requireBus(migration.document);
  const createdRegistry = createKernelRegistry(integrationManifest());
  assert.equal(createdRegistry.ok, true);
  if (!createdRegistry.ok) throw new Error("expected K1-6 Registry");
  const createdGateway = createdRegistry.registry.createGateway(
    "internal.k1-6-integration",
    bus,
  );
  assert.equal(createdGateway.ok, true);
  if (!createdGateway.ok) throw new Error("expected K1-6 gateway");
  const gateway = createdGateway.gateway;

  const events: KernelEvent[] = [];
  requireAuthorized(gateway.subscribe((event: KernelEvent) => events.push(event)));
  requireAuthorized(gateway.subscribe(() => {
    throw new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE");
  }));
  requireAuthorized(gateway.subscribe(() =>
    Promise.reject(new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE")),
  ));

  const registrySummary = requireAuthorized(gateway.summary());
```

Submit command 1, mark version 1 persisted, then submit commands 2 and 3 sequentially. The exact assertions are:

```typescript
  const first = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[0]));
  assert.deepEqual(
    { status: first.status, documentVersion: first.documentVersion,
      undoDepth: first.undoDepth, redoDepth: first.redoDepth,
      support: first.status === "committed" ? first.support.status : undefined },
    { status: "committed", documentVersion: 1, undoDepth: 1,
      redoDepth: 0, support: "supported" },
  );
  const checkpointResult = bus.markPersisted({
    documentId: "score-k1-6",
    documentVersion: 1,
  });
  assert.deepEqual(checkpointResult, {
    status: "updated",
    documentVersion: 1,
    dirty: false,
  });
  const second = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[1]));
  assert.equal(second.status, "committed");
  if (second.status !== "committed") throw new Error("expected command 2 commit");
  assert.deepEqual(
    second.support.diagnostics.map(({ code }) => code),
    ["unsupported.sequence-duration"],
  );
  const third = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[2]));
  assert.equal(third.status, "committed");
  if (third.status !== "committed") throw new Error("expected command 3 commit");
  assert.equal(third.support.status, "supported");

  const version3Read = requireReadResult(requireAuthorized(gateway.read()));
  const selectorFacts = {
    metadata: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.score-metadata",
    }))),
    insertedEvent: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.score-entity",
      address: { kind: "event", eventId: "event-k1-6-1-1b" },
    }))),
    ownership: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.score-entity-ownership",
      address: { kind: "event", eventId: "event-k1-6-1-1b" },
    }))),
    measureRange: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.score-range",
      range: {
        kind: "measure-range",
        start: { kind: "measure", measureId: "measure-k1-6-1" },
        end: { kind: "measure", measureId: "measure-k1-6-4" },
      },
    }))),
    history: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.history-state",
    }))),
    dirty: requireReadResult(requireAuthorized(gateway.select({
      selectorId: "core.selector.dirty-state",
    }))),
  } as const;

  const replay = replayCoreCommands(
    cloneK1_6ScoreFixture(),
    ACCEPTED_COMMANDS,
  );
  const undoResult = requireAuthorized(gateway.undo());
  const redoResult = requireAuthorized(gateway.redo());
  const finalRead = requireReadResult(requireAuthorized(gateway.read()));

  return {
    roundTripDocument: structuredClone(parsed.value),
    migration: structuredClone(migration),
    registrySummary: structuredClone(registrySummary),
    commandResults: structuredClone([first, second, third]),
    checkpointResult: structuredClone(checkpointResult),
    version3Read: structuredClone(version3Read),
    selectorFacts: structuredClone(selectorFacts),
    replay: structuredClone(replay),
    undoResult: structuredClone(undoResult),
    redoResult: structuredClone(redoResult),
    finalRead: structuredClone(finalRead),
    events: structuredClone(events),
  };
}
```

Do not capture gateway/subscription functions in the returned trace.

- [ ] **Step 4: Add exact coherence assertions**

Add the test `public integration scenario keeps writes reads events history and replay coherent` and assert:

```typescript
assert.deepEqual(trace.commandResults.map((result) => [
  result.status,
  result.documentVersion,
  result.undoDepth,
  result.redoDepth,
]), [
  ["committed", 1, 1, 0],
  ["committed", 2, 2, 0],
  ["committed", 3, 3, 0],
]);
assert.equal(trace.version3Read.snapshot.documentVersion, 3);
assert.equal(trace.version3Read.history.undoDepth, 3);
assert.equal(trace.version3Read.history.redoDepth, 0);
assert.equal(trace.version3Read.dirty, true);
assert.equal(trace.replay.status, "replayed");
if (trace.replay.status !== "replayed") {
  throw new Error("expected K1-6 replay");
}
assert.equal(trace.replay.documentVersion, 3);
assert.deepEqual(trace.replay.results, trace.commandResults);
assert.deepEqual(
  trace.replay.finalDocument,
  trace.version3Read.snapshot.document,
);
assert.deepEqual(
  [trace.undoResult.status, trace.undoResult.documentVersion,
    trace.undoResult.undoDepth, trace.undoResult.redoDepth],
  ["committed", 4, 2, 1],
);
assert.deepEqual(
  [trace.redoResult.status, trace.redoResult.documentVersion,
    trace.redoResult.undoDepth, trace.redoResult.redoDepth],
  ["committed", 5, 3, 0],
);
assert.deepEqual(
  trace.finalRead.snapshot.document,
  trace.version3Read.snapshot.document,
);
assert.equal(trace.finalRead.snapshot.documentVersion, 5);
assert.deepEqual(trace.finalRead.history, { undoDepth: 3, redoDepth: 0 });
assert.equal(trace.finalRead.dirty, true);
assert.equal(trace.undoResult.status, "committed");
if (trace.undoResult.status !== "committed") {
  throw new Error("expected K1-6 undo commit");
}
assert.deepEqual(
  trace.undoResult.support.diagnostics.map(({ code }) => code),
  ["unsupported.sequence-duration"],
);
assert.equal(trace.redoResult.status, "committed");
if (trace.redoResult.status !== "committed") {
  throw new Error("expected K1-6 redo commit");
}
assert.equal(trace.redoResult.support.status, "supported");
assert.deepEqual(trace.registrySummary.modules.map(({ moduleId }) => moduleId), [
  "core.commands",
  "core.selectors",
  "internal.k1-6-integration",
]);
assert.equal(trace.registrySummary.contributions.length, 12);
assert.deepEqual(trace.selectorFacts.metadata, {
  title: "K1-6 integration fixture",
  authors: ["Brilliant Guitar"],
  tempo: { bpm: 96 },
});
assert.deepEqual(trace.selectorFacts.insertedEvent, {
  kind: "event",
  value: {
    id: "event-k1-6-1-1b",
    duration: { base: 8, dots: 0 },
    content: { kind: "rest" },
  },
});
assert.deepEqual(trace.selectorFacts.ownership, {
  entityKind: "event",
  documentId: "score-k1-6",
  partId: "part-k1-6",
  measureId: "measure-k1-6-1",
  voiceId: "voice-k1-6-1",
});
assert.deepEqual(trace.selectorFacts.history, { undoDepth: 3, redoDepth: 0 });
assert.equal(trace.selectorFacts.dirty, true);
const expectedMeasures = cloneK1_6ScoreFixture().measureDefinitions;
assert.deepEqual(trace.selectorFacts.measureRange, {
  kind: "measure-range",
  normalized: {
    kind: "measure-range",
    start: { kind: "measure", measureId: "measure-k1-6-1" },
    end: { kind: "measure", measureId: "measure-k1-6-4" },
  },
  measures: expectedMeasures,
});
const expectedExtensions = cloneK1_6ScoreFixture().extensions;
assert.deepEqual(trace.roundTripDocument.extensions, expectedExtensions);
assert.deepEqual(trace.version3Read.snapshot.document.extensions, expectedExtensions);
assert.deepEqual(trace.replay.finalDocument.extensions, expectedExtensions);
assert.deepEqual(trace.finalRead.snapshot.document.extensions, expectedExtensions);
assert.deepEqual(
  trace.events.map((event) => [
    event.eventSequence,
    event.eventType,
    event.cause,
    event.documentVersion,
  ]),
  [
    [1, "core.document.committed", "submit", 1],
    [2, "core.session.dirty-state-changed", "submit", 1],
    [3, "core.session.dirty-state-changed", "mark-persisted", 1],
    [4, "core.document.committed", "submit", 2],
    [5, "core.session.dirty-state-changed", "submit", 2],
    [6, "core.document.committed", "submit", 3],
    [7, "core.document.committed", "undo", 4],
    [8, "core.document.committed", "redo", 5],
  ],
);
assert.equal(JSON.stringify(trace).includes("PRIVATE_K1_6"), false);
```

Also assert the inserted event selector, ownership selector, four-measure range selector, history selector, and dirty selector return authorized successful results with their exact stable IDs/counts.

- [ ] **Step 5: Add the deterministic repeat test**

```typescript
test("public integration scenario is deeply deterministic across fresh runs", async () => {
  const first = runK1_6IntegrationScenario();
  await Promise.resolve();
  const second = runK1_6IntegrationScenario();
  await Promise.resolve();
  assert.deepEqual(second, first);
});
```

Expected: no unhandled rejection and no timing field in either trace.

- [ ] **Step 6: Run the successful-flow gate**

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/core-kernel-integration.test.js
```

Expected: 3/3 focused tests pass.

- [ ] **Step 7: Commit Task 2**

```powershell
git add test/core-kernel/core-kernel-integration.test.ts
git commit -m "test(core): cover k1-6 public integration flow"
```

---

## Task 3: Add Representative Integration Boundary Tests

**Files:**

- Create: `test/core-kernel/core-kernel-integration-boundaries.test.ts`

**Interfaces:**

- Consumes the public Core index and `cloneK1_6ScoreFixture()`.
- Produces five focused boundary tests without changing accepted subsystem unit ownership.

- [ ] **Step 1: Add future-schema and semantic-invalid separation**

Create the test file with public imports:

```typescript
import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  createKernelRegistry,
  createKernelValidationReport,
  decodeScoreDocument,
  mapCheckpointFailureToKernelIssues,
  mapCommandFailureToKernelIssues,
  mapEventSubscriptionFailureToKernelIssues,
  mapReadFailureToKernelIssues,
  mapRegistryAccessFailureToKernelIssues,
  migrateScoreDocument,
  validateScoreDocumentSemantics,
  validateScoreFeatureProfile,
  type KernelEvent,
  type KernelModuleGateway,
  type KernelReport,
  type KernelStartupModuleManifest,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import { cloneK1_6ScoreFixture } from "./fixtures/k1-6-score";

const VALID_PITCH_COMMAND = {
  commandVersion: 1,
  commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId: "note-k1-6-1-1" },
  payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
} as const;

function requireAuthorized<T>(
  result: { readonly status: "authorized"; readonly value: T } |
    { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized K1-6 boundary result");
  }
  return result.value;
}
```

Add local setup that creates the same accepted owner modules plus `internal.k1-6-integration` and `internal.k1-6-denied`. The full consumer has `command:execute`, `selector:execute`, `score:read`, and `event:subscribe`; the denied consumer has no capabilities. Use exact public factories:

```typescript
function requireBoundaryRuntime(): {
  readonly bus: CommandBus;
  readonly gateway: KernelModuleGateway;
  readonly deniedGateway: KernelModuleGateway;
} {
  const migrated = migrateScoreDocument(cloneK1_6ScoreFixture());
  assert.equal(migrated.status, "not-required");
  if (migrated.status !== "not-required") {
    throw new Error("expected boundary migration candidate");
  }
  const createdBus = CommandBus.create(migrated.document);
  assert.equal(createdBus.ok, true);
  if (!createdBus.ok) throw new Error("expected boundary CommandBus");

  const manifest: KernelStartupModuleManifest = {
    startupManifestVersion: 1,
    modules: [
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
      {
        moduleId: "internal.k1-6-integration",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [
          "command:execute",
          "selector:execute",
          "score:read",
          "event:subscribe",
        ],
        registrationEntryIds: [],
      },
      {
        moduleId: "internal.k1-6-denied",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [],
        registrationEntryIds: [],
      },
    ],
  };
  const createdRegistry = createKernelRegistry(manifest);
  assert.equal(createdRegistry.ok, true);
  if (!createdRegistry.ok) throw new Error("expected boundary Registry");
  const full = createdRegistry.registry.createGateway(
    "internal.k1-6-integration",
    createdBus.value,
  );
  const denied = createdRegistry.registry.createGateway(
    "internal.k1-6-denied",
    createdBus.value,
  );
  assert.equal(full.ok, true);
  assert.equal(denied.ok, true);
  if (!full.ok || !denied.ok) throw new Error("expected boundary gateways");
  return {
    bus: createdBus.value,
    gateway: full.gateway,
    deniedGateway: denied.gateway,
  };
}
```

Add a test that:

```typescript
const future = {
  ...cloneK1_6ScoreFixture(),
  schemaVersion: "brilliant-score-2",
};
const decodedFuture = decodeScoreDocument(future);
assert.equal(decodedFuture.ok, false);
const migratedFuture = migrateScoreDocument(future);
assert.equal(migratedFuture.status, "rejected");
if (migratedFuture.status !== "rejected") {
  throw new Error("expected future schema rejection");
}
assert.equal(migratedFuture.failure.code, "migration.unsupported-source-version");
assert.equal("document" in migratedFuture, false);

const duplicate = cloneK1_6ScoreFixture();
const duplicateEvent = duplicate.parts[0]!.measureContents[1]!
  .voices[0]!.sequence.events[0]!;
(duplicateEvent as { id: string }).id = "event-k1-6-1-1";
const decodedDuplicate = decodeScoreDocument(duplicate);
assert.equal(decodedDuplicate.ok, true);
const semantic = validateScoreDocumentSemantics(duplicate);
assert.equal(semantic.ok, false);
assert.deepEqual(
  semantic.diagnostics.map(({ code }) => code),
  ["semantic.id-duplicate"],
);
assert.equal(createKernelValidationReport(semantic.diagnostics).status, "rejected");
const migratedDuplicate = migrateScoreDocument(duplicate);
assert.equal(migratedDuplicate.status, "rejected");
if (migratedDuplicate.status !== "rejected") {
  throw new Error("expected semantic migration rejection");
}
assert.equal(migratedDuplicate.failure.code, "migration.semantic-invalid");
assert.deepEqual(
  migratedDuplicate.failure.diagnostics,
  semantic.diagnostics,
);
assert.equal("document" in migratedDuplicate, false);
```

- [ ] **Step 2: Add the semantic-valid unsupported chord test**

```typescript
const chord = cloneK1_6ScoreFixture();
const notesEvent = chord.parts[0]!.measureContents[0]!
  .voices[0]!.sequence.events[0]!;
if (notesEvent.content.kind !== "notes") {
  throw new Error("expected notes event");
}
(notesEvent.content.notes as typeof notesEvent.content.notes[number][]).push({
  id: "note-k1-6-1-1b",
  writtenPitch: { step: "E", alter: 0, octave: 4 },
});
assert.equal(validateScoreDocumentSemantics(chord).ok, true);
const support = validateScoreFeatureProfile(chord);
assert.equal(support.status, "unsupported");
assert.deepEqual(
  support.diagnostics.map(({ code }) => code),
  ["unsupported.chord"],
);
const report = createKernelValidationReport(support.diagnostics);
assert.equal(report.status, "completed-with-warnings");
assert.deepEqual(report.issues.map(({ code }) => code), ["unsupported.chord"]);
assert.equal(migrateScoreDocument(chord).status, "not-required");
```

- [ ] **Step 3: Add authorized command rejection atomicity**

Use `requireBoundaryRuntime()`, subscribe a recording handler, capture the successful `bus.read()` value, then verify empty history, invalid selector, invalid checkpoint, invalid subscription, and missing-target command failures all remain atomic:

```typescript
const { bus, gateway } = requireBoundaryRuntime();
const events: unknown[] = [];
const subscribed = gateway.subscribe((event: unknown) => events.push(event));
assert.equal(subscribed.status, "authorized");
const beforeResult = bus.read();
assert.equal(beforeResult.ok, true);
if (!beforeResult.ok) throw new Error("expected boundary read");
const before = beforeResult.value;

const emptyUndo = requireAuthorized(gateway.undo());
assert.equal(emptyUndo.status, "rejected");
if (emptyUndo.status !== "rejected") throw new Error("expected empty undo");
assert.deepEqual(mapCommandFailureToKernelIssues(emptyUndo.failure).map(
  ({ code }) => code,
), ["history.empty-undo"]);

const missingRead = requireAuthorized(gateway.select({
  selectorId: "core.selector.score-entity",
  address: { kind: "event", eventId: "missing-event" },
}));
assert.equal(missingRead.ok, false);
if (missingRead.ok) throw new Error("expected missing selector entity");
assert.deepEqual(mapReadFailureToKernelIssues(missingRead.failure).map(
  ({ code }) => code,
), ["read.entity-not-found"]);

const checkpoint = bus.markPersisted({
  documentId: "wrong-document",
  documentVersion: 0,
});
assert.equal(checkpoint.status, "rejected");
if (checkpoint.status !== "rejected") throw new Error("expected checkpoint rejection");
assert.deepEqual(mapCheckpointFailureToKernelIssues(checkpoint.failure).map(
  ({ code }) => code,
), ["checkpoint.document-mismatch"]);

const invalidSubscription = requireAuthorized(gateway.subscribe(null));
assert.equal(invalidSubscription.status, "rejected");
if (invalidSubscription.status !== "rejected") {
  throw new Error("expected invalid subscription rejection");
}
assert.deepEqual(
  mapEventSubscriptionFailureToKernelIssues(invalidSubscription.failure).map(
    ({ code }) => code,
  ),
  ["event.invalid-handler"],
);

const rejected = requireAuthorized(gateway.submit({
  commandVersion: 1,
  commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId: "missing-note" },
  payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
}));
assert.equal(rejected.status, "rejected");
if (rejected.status !== "rejected") {
  throw new Error("expected command rejection");
}
assert.equal(rejected.failure.code, "command.target-not-found");
assert.deepEqual(mapCommandFailureToKernelIssues(rejected.failure).map(
  ({ code }) => code,
), ["command.target-not-found"]);
const afterResult = bus.read();
assert.equal(afterResult.ok, true);
if (!afterResult.ok) throw new Error("expected boundary read after failures");
assert.deepEqual(afterResult.value, before);
assert.deepEqual(events, []);
```

The before/after read must retain version 0, undoDepth 0, redoDepth 0, and dirty false.

- [ ] **Step 4: Add capability denial before mutation**

Add `internal.k1-6-denied` with an empty capability array to the public manifest, create its gateway, and assert:

```typescript
const { bus, deniedGateway } = requireBoundaryRuntime();
const beforeResult = bus.read();
assert.equal(beforeResult.ok, true);
if (!beforeResult.ok) throw new Error("expected denied-path read");
const before = beforeResult.value;
const denied = deniedGateway.submit(VALID_PITCH_COMMAND);
assert.equal(denied.status, "rejected");
if (denied.status !== "rejected") {
  throw new Error("expected capability denial");
}
assert.deepEqual(denied.failure, {
  code: "registry.capability-denied",
  moduleId: "internal.k1-6-denied",
  capability: "command:execute",
});
const issues = mapRegistryAccessFailureToKernelIssues(denied.failure);
assert.deepEqual(issues.map(({ code }) => code), [
  "registry.capability-denied",
]);
assert.deepEqual(issues[0]!.details, {
  moduleId: "internal.k1-6-denied",
  capability: "command:execute",
});
const afterResult = bus.read();
assert.equal(afterResult.ok, true);
if (!afterResult.ok) throw new Error("expected denied-path read after failure");
assert.deepEqual(afterResult.value, before);
```

- [ ] **Step 5: Add subscriber and hostile-report privacy closure**

Create an async test and use one recording subscriber plus synchronous and Promise-rejecting subscribers:

```typescript
const { gateway } = requireBoundaryRuntime();
const events: KernelEvent[] = [];
const recording = requireAuthorized(
  gateway.subscribe((event: KernelEvent) => events.push(event)),
);
const throwing = requireAuthorized(gateway.subscribe(() => {
  throw new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE");
}));
const rejecting = requireAuthorized(gateway.subscribe(() =>
  Promise.reject(new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE")),
));
assert.equal(recording.status, "subscribed");
assert.equal(throwing.status, "subscribed");
assert.equal(rejecting.status, "subscribed");
const committed = requireAuthorized(gateway.submit(VALID_PITCH_COMMAND));
assert.equal(committed.status, "committed");
await Promise.resolve();
assert.deepEqual(events.map(({ eventType, eventSequence }) => [
  eventType,
  eventSequence,
]), [
  ["core.document.committed", 1],
  ["core.session.dirty-state-changed", 2],
]);
assert.equal(JSON.stringify({ committed, events }).includes("PRIVATE_K1_6"), false);
```

Then call the runtime report boundary without executing a getter:

```typescript
let getterCalls = 0;
const hostile: unknown[] = [];
Object.defineProperty(hostile, "0", {
  enumerable: true,
  configurable: true,
  get() {
    getterCalls += 1;
    throw new Error("PRIVATE_K1_6_REPORT_FAILURE");
  },
});
hostile.length = 1;
const runtimeReport = createKernelValidationReport as unknown as (
  input: unknown,
) => KernelReport<"validation">;
const report = runtimeReport(hostile);
assert.equal(getterCalls, 0);
assert.equal(report.status, "rejected");
assert.deepEqual(report.issues.map(({ code }) => code), [
  "report.invalid-input",
]);
assert.equal(JSON.stringify(report).includes("PRIVATE_K1_6"), false);
```

- [ ] **Step 6: Run the boundary gate**

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/core-kernel-integration-boundaries.test.js
```

Expected: 5/5 focused boundary tests pass.

- [ ] **Step 7: Run both K1-6 files together**

```powershell
node --test dist/test/core-kernel/core-kernel-integration.test.js dist/test/core-kernel/core-kernel-integration-boundaries.test.js
```

Expected: 8/8 K1-6 tests pass.

- [ ] **Step 8: Commit Task 3**

```powershell
git add test/core-kernel/core-kernel-integration-boundaries.test.ts
git commit -m "test(core): cover k1-6 integration boundaries"
```

---

## Task 4: Run the Full Candidate Gate and Synchronize Active Documentation

**Files:**

- Create: `.trellis/spec/core-kernel/backend/integration-gate.md`
- Modify: `.trellis/spec/core-kernel/backend/index.md`
- Modify: `.trellis/spec/core-kernel/index.md`
- Modify: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/prd.md`
- Modify: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/design.md`
- Modify: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/implement.md`
- Modify: `.trellis/tasks/07-21-k1-6-core-kernel-integration-gate/task.json`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/07-07-pure-core-kernel-v1/prd.md`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/07-07-pure-core-kernel-v1/design.md`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/07-07-pure-core-kernel-v1/implement.md`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`
- Modify directly conflicting K1-6 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md`

**Interfaces:**

- Consumes the 8 focused K1-6 tests and all existing K1-1 through K1-5 gates.
- Produces a fixed implementation candidate and active cross-contract specification; it does not claim independent acceptance.

- [ ] **Step 1: Run static, build, focused, and full gates**

```powershell
npm run typecheck
npm run build
node --test dist/test/core-kernel/core-kernel-integration.test.js dist/test/core-kernel/core-kernel-integration-boundaries.test.js
npm test
git diff --check
python .\.trellis\scripts\task.py validate .trellis\tasks\07-21-k1-6-core-kernel-integration-gate
```

Expected on the approved 161-test baseline: 8/8 focused K1-6 tests and 169/169 full tests pass. If another separately approved change legitimately changes the baseline before activation, record the exact new pre-K1-6 count and require exactly eight additional K1-6 tests; never silently edit the expected evidence.

- [ ] **Step 2: Confirm source and public surface stayed unchanged**

Run:

```powershell
git diff c4cd4f2 -- src package.json tsconfig.json
git diff c4cd4f2 -- test/core-kernel/public-api-boundary.test.ts test/core-kernel/forbidden-dependency-boundary.test.ts
```

Expected: both diffs are empty. If not, stop and classify the change against `DEC-K1-6-005`.

- [ ] **Step 3: Write the active integration specification**

Create `integration-gate.md` with:

- exact accepted input baselines;
- the four-measure fixture invariants;
- successful public flow and event/version/history/dirty table;
- replay and extension-preservation invariants;
- representative failure/unsupported/privacy cases;
- explicit no-new-API/no-Guitar/no-product-runtime exclusions;
- exact candidate HEAD and fresh 8/full test counts;
- wording `K1-6 implementation candidate complete; independent acceptance pending`.

- [ ] **Step 4: Synchronize only active status documents**

Update the listed Core/parent/product files so they agree that K1-6 is an implementation candidate awaiting independent review. Do not mark Pure Core Kernel V1 complete and do not unlock Guitar/product implementation.

Search:

```powershell
rg -n "K1-6|Pure Core Kernel V1" .trellis/spec/core-kernel .trellis/tasks/07-07-pure-core-kernel-v1 .trellis/tasks/06-29-commercial-guitar-tablature-product
```

Expected: no active document says K1-6 is not started, already accepted, or includes Guitar Domain. Historical snapshots and archived tasks are excluded from convergence edits.

- [ ] **Step 5: Record candidate metadata**

Set the K1-6 task notes/meta to the actual implementation candidate commit, focused count `8`, full count `169` (or the exact approved-baseline-plus-eight count), and `implementation_stage: acceptance_pending`. Keep the task `in_progress` until independent review.

- [ ] **Step 6: Commit candidate documentation**

Stage only the listed K1-6/Core/parent/product documentation files and commit:

```powershell
git commit -m "docs(core): record k1-6 integration candidate"
```

- [ ] **Step 7: Rerun convergence and diff gates after documentation commit**

```powershell
git diff --check
python .\.trellis\scripts\task.py validate .trellis\tasks\07-21-k1-6-core-kernel-integration-gate
git status --short --branch
```

Expected: gates pass; only pre-existing unrelated untracked paths remain.

---

## Task 5: Hand Off for Independent Acceptance

**Files:**

- No production or test modification.
- Do not archive or mark accepted in this task.

**Interfaces:**

- Produces the reviewer evidence package.
- Does not authorize Guitar Domain, product implementation, or post-Core milestones.

- [ ] **Step 1: Report the exact candidate evidence**

Provide:

- activation baseline and candidate HEAD;
- commit list and file responsibilities;
- 8/8 focused and exact full test totals;
- `typecheck`, `build`, `npm test`, diff, Trellis, public-export, and forbidden-dependency results;
- proof that `src/**`, package configuration, and accepted public-boundary tests were not modified;
- deterministic trace/event/version/history/dirty/replay summary;
- negative/unsupported/privacy summary;
- unrelated user-owned paths intentionally preserved.

- [ ] **Step 2: State the gate explicitly**

Use the exact conclusion:

```text
K1-6 implementation candidate complete; independent acceptance pending.
Pure Core Kernel V1 is not formally closed until a separate reviewer records an accepted baseline.
Guitar Domain and product-layer implementation remain unauthorized.
```

- [ ] **Step 3: Stop**

Do not run `task.py finish`, archive K1-6, update an accepted baseline, or begin Guitar/Product work until the independent reviewer returns a verdict.
