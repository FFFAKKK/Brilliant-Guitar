import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  createKernelRegistry,
  createScoreDocument,
  encodeScoreDocumentJson,
  migrateKernelExtension,
  replayKernelCommands,
  validateScoreDocumentSemantics,
  type IntegratedKernelEvent,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import * as moduleSdk from "../../src/core-kernel/module-sdk/index";
import {
  CVN7_D4,
  createRepresentativeCvn7Score,
} from "./fixtures/cvn-7-qualification-score";
import { createCvn7QualificationModules } from "./fixtures/cvn-7-qualification-modules";

function setup() {
  const fixture = createRepresentativeCvn7Score();
  const modules = createCvn7QualificationModules(moduleSdk);
  const compiled = moduleSdk.compileOfficialModuleCatalogV1(
    modules.manifest,
    modules.registrationEntries,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("CVN-7 catalog must compile");
  const created = CommandBus.createIntegrated(
    fixture.document,
    compiled.catalog,
    modules.knownRequirementInventory,
  );
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("CVN-7 integrated bus must construct");
  return { fixture, modules, catalog: compiled.catalog, bus: created.value };
}

function read(bus: ReturnType<typeof setup>["bus"]) {
  const result = bus.read();
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("CVN-7 bus read must succeed");
  return result.value;
}

function metadataCommand(documentId: string, title: string): unknown {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId },
    payload: {
      metadata: {
        title,
        authors: ["Brilliant Guitar Qualification"],
        tempo: { bpm: 120 },
      },
    },
  };
}

function mixedBatch(
  runtime: ReturnType<typeof setup>,
): { readonly batch: unknown; readonly children: readonly unknown[] } {
  const { fixture, modules } = runtime;
  const children: unknown[] = [
    modules.createScoreCommand(
      fixture.document.id,
      fixture.firstNote.noteId,
      CVN7_D4,
      "cvn7-batch-score",
    ),
  ];
  for (let childIndex = 1; childIndex < 99; childIndex += 1) {
    children.push(metadataCommand(
      fixture.document.id,
      childIndex % 2 === 0 ? "CVN-7 Batch Even" : "CVN-7 Batch Odd",
    ));
  }
  children.push(modules.createPartCommand(
    fixture.lastPartId,
    fixture.lastNote.noteId,
    CVN7_D4,
    "cvn7-batch-part",
  ));
  return {
    children,
    batch: {
      commandVersion: 1,
      commandId: "core.transaction.batch",
      target: { kind: "document", documentId: fixture.document.id },
      payload: { commands: children },
    },
  };
}

function encode(document: ScoreDocument): string {
  const result = encodeScoreDocumentJson(document);
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("CVN-7 document must encode");
  return result.value;
}

test("CVN7-D-FC141 batch qualification matrix is complete", () => {
  const runtime = setup();
  const initialDocument = structuredClone(runtime.fixture.document);
  const { batch, children } = mixedBatch(runtime);
  assert.equal(children.length, 100);
  assert.equal((children[0] as { commandId?: string }).commandId, runtime.modules.scoreCommandId);
  assert.equal((children[99] as { commandId?: string }).commandId, runtime.modules.partCommandId);

  const events: IntegratedKernelEvent[] = [];
  assert.equal(runtime.bus.subscribe((event: IntegratedKernelEvent) => events.push(event)).status, "subscribed");
  runtime.modules.resetTrace();
  const committed = runtime.bus.submit(batch);
  assert.equal(committed.status, "committed");
  assert.equal(committed.documentVersion, 1);
  assert.equal(committed.undoDepth, 1);
  assert.equal(committed.redoDepth, 0);
  assert.deepEqual(runtime.modules.readTrace(), [
    "commandDecode:score", "commandPrepare:score", "effectDecode:score",
    "effectTransform:score", "commandDecode:part", "commandPrepare:part",
    "effectDecode:part", "effectTransform:part", "validate:part",
    "validate:score", "classify:part", "classify:score",
  ]);
  const afterCommit = read(runtime.bus);
  assert.equal(afterCommit.snapshot.documentVersion, 1);
  assert.deepEqual(afterCommit.history, { undoDepth: 1, redoDepth: 0 });
  assert.equal(
    events.filter(({ eventType }) => eventType === "core.document.committed").length,
    1,
  );
  assert.equal(afterCommit.snapshot.document.extensions.at(-1)?.namespace, "fixture.cvn7.unknown");

  assert.equal(runtime.bus.undo().status, "committed");
  assert.deepEqual(read(runtime.bus).snapshot.document, initialDocument);
  assert.equal(runtime.bus.redo().status, "committed");
  const afterRedo = read(runtime.bus).snapshot.document;
  assert.deepEqual(afterRedo, afterCommit.snapshot.document);

  const replayed = replayKernelCommands(
    initialDocument,
    [batch],
    runtime.catalog,
    runtime.modules.knownRequirementInventory,
  );
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") assert.fail("mixed batch replay must pass");
  assert.equal(replayed.documentVersion, 1);
  assert.deepEqual(replayed.finalDocument, afterCommit.snapshot.document);
  assert.equal(replayed.results.length, 1);
  assert.equal(replayed.results[0]?.status, "committed");
});

test("CVN7-D-FC142 structure qualification matrix is complete", () => {
  const representative = createRepresentativeCvn7Score();
  const initialMeasure = representative.document.measureDefinitions[0];
  assert.notEqual(initialMeasure, undefined);
  const created = createScoreDocument({
    factoryVersion: 1,
    documentId: "cvn7-factory-seed",
    metadata: representative.document.metadata,
    initialMeasure,
    initialParts: representative.document.parts.map((part) => ({
      id: `${part.id}-factory`,
      name: part.name,
      instrument: part.instrument,
      staves: part.staves.map((staff) => ({
        ...staff,
        id: `${staff.id}-factory`,
      })),
      voices: part.measureContents[0]?.voices.map((voice) => ({
        ...voice,
        id: `${voice.id}-factory`,
        defaultStaffId: `${voice.defaultStaffId}-factory`,
        sequence: {
          ...voice.sequence,
          events: voice.sequence.events.map((event) => ({
            ...event,
            id: `${event.id}-factory`,
            content: event.content.kind === "rest"
              ? event.content
              : {
                  ...event.content,
                  notes: event.content.notes.map((note) => ({
                    ...note,
                    id: `${note.id}-factory`,
                  })),
                },
          })),
        },
      })) ?? [],
    })),
    extensions: [],
  });
  assert.equal(created.status, "created");
  if (created.status !== "created") assert.fail("representative slice factory must pass");
  assert.equal(created.document.parts.length, 8);
  assert.equal(created.document.measureDefinitions.length, 1);
  assert.deepEqual(validateScoreDocumentSemantics(created.document), {
    ok: true,
    diagnostics: [],
  });
  assert.deepEqual(validateScoreDocumentSemantics(representative.document), {
    ok: true,
    diagnostics: [],
  });
  assert.equal(representative.document.parts.every(
    (part) => part.measureContents.length === 200 && part.staves.length === 1,
  ), true);
  assert.equal(new Set(representative.canonicalNotes.map(({ noteId }) => noteId)).size, 12_800);
  assert.equal(encode(representative.document), encode(createRepresentativeCvn7Score().document));
});

test("CVN7-D-FC143 module qualification matrix is complete", () => {
  const runtime = setup();
  assert.deepEqual(runtime.modules.inputRegistrationOrder, [
    "fixture.cvn7.score.module", "fixture.cvn7.part.module",
  ]);
  assert.deepEqual(
    runtime.modules.registrationEntries.map(({ ownerModuleId }) => ownerModuleId),
    runtime.modules.inputRegistrationOrder,
  );
  assert.deepEqual(runtime.modules.expectedCanonicalOrder, [
    "fixture.cvn7.part.module", "fixture.cvn7.score.module",
  ]);
  assert.deepEqual(runtime.modules.readTrace(), [
    "validate:part", "validate:score", "classify:part", "classify:score",
  ]);

  const registry = createKernelRegistry(
    runtime.catalog,
    runtime.modules.knownRequirementInventory,
  );
  assert.equal(registry.ok, true);
  if (!registry.ok) assert.fail("integrated Registry must construct");
  const gateway = registry.registry.createGateway(
    "fixture.cvn7.score.module",
    runtime.bus,
  );
  assert.equal(gateway.ok, true);

  const beforeMigration = structuredClone(read(runtime.bus));
  const detached = structuredClone(beforeMigration.snapshot.document);
  runtime.modules.resetTrace();
  const migration = migrateKernelExtension(
    detached,
    {
      migrationVersion: 1,
      moduleId: "fixture.cvn7.score.module",
      contributionId: "fixture.cvn7.score.contribution.v1",
      effectKind: "fixture.cvn7.score.replace",
      namespace: "fixture.cvn7.score",
      owner: { kind: "score" },
      sourceSchemaVersion: 1,
      targetSchemaVersion: 2,
      payload: {
        marker: "cvn7-migration",
        generatorVersion: 1,
        schemaVersion: 2,
      },
    },
    runtime.catalog,
  );
  assert.equal(migration.status, "migrated");
  if (migration.status !== "migrated") assert.fail("owned score block must migrate");
  const sourceExtensions = detached.extensions;
  const migratedExtensions = migration.document.extensions;
  assert.equal(migratedExtensions[0]?.schemaVersion, 2);
  assert.deepEqual(migratedExtensions[0]?.payload, {
    marker: "cvn7-migration",
    generatorVersion: 1,
  });
  assert.deepEqual(migratedExtensions.slice(1), sourceExtensions.slice(1));
  assert.deepEqual(
    { ...migration.document, extensions: [] },
    { ...detached, extensions: [] },
  );
  assert.deepEqual(runtime.modules.readTrace(), [
    "effectDecode:score", "effectTransform:score", "validate:part",
    "validate:score",
  ]);
  assert.deepEqual(read(runtime.bus), beforeMigration);
  assert.equal(
    beforeMigration.snapshot.document.extensions.at(-1)?.namespace,
    "fixture.cvn7.unknown",
  );
});
