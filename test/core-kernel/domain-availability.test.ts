import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function scoreOnlyCatalog() {
  const manifest = {
    ...CVN6_MANIFEST,
    modules: CVN6_MANIFEST.modules.filter(
      (module) => module.moduleId !== "fixture.part.module",
    ),
  };
  const entries = CVN6_REGISTRATION_ENTRIES.filter(
    (entry) => entry.ownerModuleId !== "fixture.part.module",
  );
  const result = compileOfficialModuleCatalogV1(manifest, entries);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("catalog");
  return result.catalog;
}

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
} as const;

function withExtensions(extensions: ScoreDocument["extensions"]): ScoreDocument {
  return { ...createCoreScoreFixture(), extensions };
}

test("known absent, incompatible, unknown, and mixed extension states are canonical", () => {
  const catalog = scoreOnlyCatalog();
  const cases = [
    {
      name: "unavailable",
      blocks: [{ namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: {} }],
      reason: "required-contribution-unavailable",
    },
    {
      name: "incompatible",
      blocks: [{ namespace: "fixture.score", schemaVersion: 3, owner: { kind: "score" }, payload: {} }],
      reason: "required-contribution-incompatible",
    },
  ] as const;
  for (const entry of cases) {
    resetCvn6Callbacks();
    const created = CommandBus.createIntegrated(
      withExtensions(entry.blocks as ScoreDocument["extensions"]),
      catalog,
      inventory,
    );
    assert.equal(created.ok, true, entry.name);
    if (!created.ok) continue;
    const read = created.value.read();
    assert.equal(read.ok, true);
    if (!read.ok) continue;
    assert.equal(read.value.writeAvailability.status, "read-only");
    assert.equal(read.value.validationAvailability.status, "incomplete");
    if (read.value.validationAvailability.status === "incomplete") {
      assert.equal(read.value.validationAvailability.facts[0]?.reason, entry.reason);
    }
  }

  const unknown = CommandBus.createIntegrated(
    withExtensions([{ namespace: "fixture.unknown", schemaVersion: 99, owner: { kind: "score" }, payload: { preserved: true } }]),
    catalog,
    inventory,
  );
  assert.equal(unknown.ok, true);
  if (unknown.ok) {
    const read = unknown.value.read();
    assert.equal(read.ok && read.value.writeAvailability.status, "writable");
  }

  const mixed = CommandBus.createIntegrated(
    withExtensions([
      { namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: {} },
      { namespace: "fixture.score", schemaVersion: 3, owner: { kind: "score" }, payload: {} },
    ]),
    catalog,
    inventory,
  );
  assert.equal(mixed.ok, true);
  if (mixed.ok) {
    const read = mixed.value.read();
    assert.equal(read.ok, true);
    if (read.ok && read.value.validationAvailability.status === "incomplete") {
      assert.deepEqual(
        read.value.validationAvailability.facts.map((fact) => [fact.namespace, fact.reason]),
        [
          ["fixture.part", "required-contribution-unavailable"],
          ["fixture.score", "required-contribution-incompatible"],
        ],
      );
    }
  }
});

test("read-only preflight precedes decoding, history, validators, and classifiers", () => {
  const catalog = scoreOnlyCatalog();
  const created = CommandBus.createIntegrated(
    withExtensions([{ namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: {} }]),
    catalog,
    inventory,
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  resetCvn6Callbacks();
  for (const result of [
    created.value.submit({}),
    created.value.undo(),
    created.value.redo(),
  ]) {
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failure.code, "command.required-contribution-unavailable");
    }
  }
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});
