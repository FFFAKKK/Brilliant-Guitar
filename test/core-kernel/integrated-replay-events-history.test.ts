import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  replayKernelCommands,
  type ReplayKernelCommandsResult,
} from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

const command = {
  commandVersion: 1,
  commandId: "fixture.score.apply",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    noteId: "note-1",
    pitch: { step: "E", alter: 0, octave: 4 },
    schemaVersion: 1,
    marker: "replay",
  },
} as const;

test("integrated replay routes semantic envelopes through the live pipeline", () => {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  resetCvn6Callbacks();
  const replayed = replayKernelCommands(
    createCoreScoreFixture(),
    [command],
    compiled.catalog,
  );
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") return;
  assert.equal(replayed.documentVersion, 1);
  assert.equal(replayed.results[0]?.status, "committed");

  const live = CommandBus.createIntegrated(createCoreScoreFixture(), compiled.catalog);
  assert.equal(live.ok, true);
  if (!live.ok) return;
  const liveResult = live.value.submit(command);
  const liveRead = live.value.read();
  assert.deepEqual(replayed.results[0], liveResult);
  assert.equal(liveRead.ok, true);
  if (liveRead.ok) {
    assert.deepEqual(replayed.finalDocument, liveRead.value.snapshot.document);
  }
});

test("empty replay preserves a read-only document without attempting a write", () => {
  const manifest = {
    ...CVN6_MANIFEST,
    modules: CVN6_MANIFEST.modules.filter(
      (module) => module.moduleId !== "fixture.part.module",
    ),
  };
  const entries = CVN6_REGISTRATION_ENTRIES.filter(
    (entry) => entry.ownerModuleId !== "fixture.part.module",
  );
  const compiled = compileOfficialModuleCatalogV1(manifest, entries);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const document = {
    ...createCoreScoreFixture(),
    extensions: [{
      namespace: "fixture.part",
      schemaVersion: 1,
      owner: { kind: "part" as const, partId: "part-1" },
      payload: {},
    }],
  };
  const inventory = {
    inventoryVersion: 1,
    requirements: [
      {
        requirementVersion: 1,
        namespace: "fixture.score",
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
        supportedSchemaVersions: [1, 2],
        requiredForWrite: true,
      },
      {
        requirementVersion: 1,
        namespace: "fixture.part",
        moduleId: "fixture.part.module",
        contributionId: "fixture.part.contribution.v1",
        supportedSchemaVersions: [1, 2],
        requiredForWrite: true,
      },
    ],
  };
  const result = replayKernelCommands(document, [], compiled.catalog, inventory);
  assert.equal(result.status, "replayed");
  if (result.status === "replayed") {
    assert.equal(result.writeAvailability.status, "read-only");
    assert.deepEqual(result.finalDocument, document);
  }
});

test("replay strictly captures its dense command sequence without Proxy gets or alias drift", () => {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const second = {
    ...command,
    payload: { ...command.payload, marker: "second" },
  };
  let getCalls = 0;
  const source = [command, second];
  const proxied = new Proxy(source, {
    get(target, key, receiver) {
      getCalls += 1;
      if (key === "1") throw new Error("sequence index trap executed");
      return Reflect.get(target, key, receiver);
    },
  });
  const result = replayKernelCommands(
    createCoreScoreFixture(),
    proxied,
    compiled.catalog,
  );
  assert.equal(result.status, "replayed");
  assert.equal(getCalls, 0);
  if (result.status === "replayed") {
    assert.equal(result.documentVersion, 2);
    source[0] = { ...command, payload: { ...command.payload, marker: "mutated" } };
    assert.equal(result.finalDocument.extensions[0]?.payload.marker, "second");
  }
});

test("replay maps sparse, accessor, and throwing sequence containers to stable rejection", () => {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  const sparse: unknown[] = [];
  sparse.length = 2;
  sparse[0] = command;
  let getterCalls = 0;
  const accessor = [command, command];
  Object.defineProperty(accessor, "1", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      return command;
    },
  });
  const throwing = new Proxy([command], {
    ownKeys() {
      throw new Error("sequence ownKeys trap");
    },
  });
  for (const sequence of [sparse, accessor, throwing]) {
    const result: ReplayKernelCommandsResult = replayKernelCommands(
      createCoreScoreFixture(),
      sequence,
      compiled.catalog,
    );
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failedCommandIndex, 0);
      assert.equal(result.documentVersion, 0);
      assert.deepEqual(result.results, []);
      assert.deepEqual(result.failure, { code: "command.invalid-envelope" });
    }
  }
  assert.equal(getterCalls, 0);
});
