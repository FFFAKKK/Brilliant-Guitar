import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackBehavior,
  cvn6CallbackCounts,
  cvn6CallbackTrace,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("catalog");
  return result.catalog;
}

function documentWithBothBlocks(): ScoreDocument {
  return {
    ...createCoreScoreFixture(),
    extensions: [
      {
        namespace: "fixture.score",
        schemaVersion: 1,
        owner: { kind: "score" },
        payload: { marker: "score" },
      },
      {
        namespace: "fixture.part",
        schemaVersion: 1,
        owner: { kind: "part", partId: "part-1" },
        payload: { marker: "part" },
      },
    ],
  };
}

test("zero compatible blocks invoke zero validators and classifiers", () => {
  resetCvn6Callbacks();
  const created = CommandBus.createIntegrated(createCoreScoreFixture(), catalog());
  assert.equal(created.ok, true);
  assert.equal(cvn6CallbackCounts.validate, 0);
  assert.equal(cvn6CallbackCounts.classify, 0);
});

test("validators complete before classifiers in frozen catalog order", () => {
  resetCvn6Callbacks();
  const created = CommandBus.createIntegrated(documentWithBothBlocks(), catalog());
  assert.equal(created.ok, true);
  assert.deepEqual(cvn6CallbackTrace, [
    "validate:part",
    "validate:score",
    "classify:part",
    "classify:score",
  ]);
});

test("semantic issues aggregate across later validators and suppress all classifiers", () => {
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueModule = "part";
  const created = CommandBus.createIntegrated(documentWithBothBlocks(), catalog());
  assert.equal(created.ok, false);
  if (!created.ok) {
    assert.equal(created.failure.code, "command.contribution-semantic-invalid");
  }
  assert.deepEqual(cvn6CallbackTrace, ["validate:part", "validate:score"]);
});

test("validator and classifier mechanism failures stop later callbacks deterministically", () => {
  resetCvn6Callbacks();
  cvn6CallbackBehavior.throwFamily = "validate";
  const validator = CommandBus.createIntegrated(documentWithBothBlocks(), catalog());
  assert.equal(validator.ok, false);
  if (!validator.ok) {
    assert.equal(validator.failure.code, "command.contribution-internal-error");
  }
  assert.deepEqual(cvn6CallbackTrace, ["validate:part"]);

  resetCvn6Callbacks();
  cvn6CallbackBehavior.malformedFamily = "classify";
  const classifier = CommandBus.createIntegrated(documentWithBothBlocks(), catalog());
  assert.equal(classifier.ok, false);
  if (!classifier.ok) {
    assert.equal(classifier.failure.code, "command.contribution-contract-violation");
  }
  assert.deepEqual(cvn6CallbackTrace, [
    "validate:part",
    "validate:score",
    "classify:part",
  ]);
});
