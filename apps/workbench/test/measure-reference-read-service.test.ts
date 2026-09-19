import assert from "node:assert/strict";
import test from "node:test";

import { MeasureReferenceReadService } from "../src/agent/measure-reference-read-service.ts";
import type {
  MeasureIndexPort,
  MeasureRangeReadPort,
} from "../src/agent/measure-reference-read-service.ts";

const index = {
  documentId: "score-1",
  documentVersion: 7,
  measureIds: ["intro-a", "verse-x", "ending-z"],
} as const;

const request = {
  workspaceId: "workspace-1",
  documentId: "score-1",
  documentVersion: 7,
  reference: { kind: "ordinal-range", startOrdinal: 2, endOrdinal: 3 } as const,
  selection: null,
  rangeBudget: 2,
};

function completedRange(input: {
  readonly startMeasureId: string;
  readonly endMeasureId: string;
  readonly maxMeasures: number;
}) {
  return {
    status: "completed" as const,
    invocationId: "range-1",
    capabilityId: "score.read-measure-range",
    contractVersion: 1,
    data: {
      documentId: "score-1",
      documentVersion: 7,
      startMeasureId: input.startMeasureId,
      endMeasureId: input.endMeasureId,
      measureCount: input.maxMeasures,
      measures: index.measureIds.slice(1).map((measureId) => ({
        measureId,
        meter: { numerator: 4, denominator: 4 },
        pickupDuration: null,
      })),
    },
  };
}

test("reference read service composes a version-bound index with one atomic range read", async () => {
  const indexRequests: unknown[] = [];
  const rangeInputs: unknown[] = [];
  const indexPort: MeasureIndexPort = {
    async readMeasureIndex(value) {
      indexRequests.push(value);
      return { status: "completed", index };
    },
  };
  const rangePort: MeasureRangeReadPort = {
    async readMeasureRange(input) {
      rangeInputs.push(input);
      return completedRange(input);
    },
  };

  const result = await new MeasureReferenceReadService(indexPort, rangePort).read(request);

  assert.equal(result.status, "completed");
  assert.deepEqual(indexRequests, [{
    workspaceId: "workspace-1",
    expectedDocumentId: "score-1",
    expectedDocumentVersion: 7,
  }]);
  assert.deepEqual(rangeInputs, [{
    startMeasureId: "verse-x",
    endMeasureId: "ending-z",
    maxMeasures: 2,
  }]);
});

test("a stale index stops before the range capability", async () => {
  let rangeCalls = 0;
  const service = new MeasureReferenceReadService({
    async readMeasureIndex() {
      return { status: "completed", index: { ...index, documentVersion: 6 } };
    },
  }, {
    async readMeasureRange(input) {
      rangeCalls += 1;
      return completedRange(input);
    },
  });

  assert.deepEqual(await service.read(request), {
    status: "failed",
    stage: "measure-index",
    code: "measure-index.stale",
    message: "小节索引与当前文档版本不一致",
    retryable: true,
  });
  assert.equal(rangeCalls, 0);
});

test("an unresolved selection never reaches the range capability", async () => {
  let indexCalls = 0;
  let rangeCalls = 0;
  const service = new MeasureReferenceReadService({
    async readMeasureIndex() {
      indexCalls += 1;
      return { status: "completed", index };
    },
  }, {
    async readMeasureRange(input) {
      rangeCalls += 1;
      return completedRange(input);
    },
  });

  const result = await service.read({
    ...request,
    reference: { kind: "current-selection" },
  });
  assert.equal(result.status, "unresolved");
  assert.equal(result.status === "unresolved" && result.resolution.code, "selection-unavailable");
  assert.equal(indexCalls, 0);
  assert.equal(rangeCalls, 0);
});

test("range results must preserve the resolved document identity and endpoints", async () => {
  const service = new MeasureReferenceReadService({
    async readMeasureIndex() { return { status: "completed", index }; },
  }, {
    async readMeasureRange(input) {
      const result = completedRange(input);
      return { ...result, data: { ...result.data, documentVersion: 8 } };
    },
  });

  assert.deepEqual(await service.read(request), {
    status: "failed",
    stage: "measure-range",
    code: "measure-range.result-mismatch",
    message: "小节范围结果与解析引用不一致",
    retryable: true,
  });
});

test("port failures are classified by stage without exposing thrown details", async () => {
  const indexFailure = await new MeasureReferenceReadService({
    async readMeasureIndex() { throw new Error("private index detail"); },
  }, {
    async readMeasureRange(input) { return completedRange(input); },
  }).read(request);
  assert.deepEqual(indexFailure, {
    status: "failed",
    stage: "measure-index",
    code: "measure-index.failed",
    message: "无法读取当前小节索引",
    retryable: true,
  });

  const rangeFailure = await new MeasureReferenceReadService({
    async readMeasureIndex() { return { status: "completed", index }; },
  }, {
    async readMeasureRange() { throw new Error("private range detail"); },
  }).read(request);
  assert.deepEqual(rangeFailure, {
    status: "failed",
    stage: "measure-range",
    code: "measure-range.failed",
    message: "无法读取当前小节范围",
    retryable: true,
  });
});
