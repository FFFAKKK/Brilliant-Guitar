import assert from "node:assert/strict";
import test from "node:test";

import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { ScoreMeasureIndexPort } from "../src/agent/score-measure-index-port.ts";
import type { ScoreReadPort } from "../src/services/score-read-port.ts";

const request = {
  workspaceId: "workspace-1",
  expectedDocumentId: "score-1",
  expectedDocumentVersion: 7,
} as const;

const unusedReads: Omit<ScoreReadPort, "readMeasureIndex"> = {
  async readSummary() { throw new Error("summary read must not be used"); },
  async readMetadata() { throw new Error("metadata read must not be used"); },
  async readStructure() { throw new Error("structure read must not be used"); },
  async readMeasureRange() { throw new Error("range read must not be used"); },
};

test("internal measure index is absent from the model-visible capability catalog", () => {
  assert.equal(
    FIRST_PARTY_CAPABILITY_CATALOG.some((capability) => capability.id === "score.read-measure-index"),
    false,
  );
  assert.equal(
    FIRST_PARTY_CAPABILITY_CATALOG.some((capability) => capability.id === "score.read-measure-range"),
    false,
  );
  assert.equal(
    FIRST_PARTY_CAPABILITY_CATALOG.some((capability) => capability.id === "score.read-measures"),
    true,
  );
});

test("measure index port calls the typed read port with version-bound identity", async () => {
  const inputs: unknown[] = [];
  const port = new ScoreMeasureIndexPort({
    ...unusedReads,
    async readMeasureIndex(input) {
      inputs.push(input);
      return {
        status: "ready",
        data: {
          documentId: "score-1",
          documentVersion: 7,
          measureIds: ["intro-a", "verse-x", "ending-z"],
        },
      };
    },
  });

  assert.deepEqual(await port.readMeasureIndex(request), {
    status: "completed",
    index: {
      documentId: "score-1",
      documentVersion: 7,
      measureIds: ["intro-a", "verse-x", "ending-z"],
    },
  });
  assert.deepEqual(inputs, [{
    expectedDocumentId: "score-1",
    expectedDocumentVersion: 7,
  }]);
});

test("measure index port preserves stable failures and retryability", async () => {
  const stale = new ScoreMeasureIndexPort({
    ...unusedReads,
    async readMeasureIndex() {
      return {
        status: "failed",
        code: "score.measure-index-stale",
        message: "小节索引与当前文档版本不一致",
      };
    },
  });
  assert.deepEqual(await stale.readMeasureIndex(request), {
    status: "failed",
    code: "score.measure-index-stale",
    message: "小节索引与当前文档版本不一致",
    retryable: true,
  });

  const invalid = new ScoreMeasureIndexPort({
    ...unusedReads,
    async readMeasureIndex() {
      return {
        status: "failed",
        code: "capability.invalid-input",
        message: "能力输入格式无效",
      };
    },
  });
  const invalidResult = await invalid.readMeasureIndex(request);
  assert.notEqual(invalidResult.status, "completed");
  if (invalidResult.status !== "completed") assert.equal(invalidResult.retryable, false);
});
