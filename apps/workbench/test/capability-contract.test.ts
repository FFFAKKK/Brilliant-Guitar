import assert from "node:assert/strict";
import test from "node:test";

import {
  isScoreMeasureIndexInputV1,
  isScoreMeasureIndexV1,
  isScoreMeasureRangeInputV1,
  isScoreMeasureRangeV1,
  isScoreReadMeasuresInputV1,
  isScoreMetadataV1,
  isScoreStructureV1,
  isScoreSummaryV1,
} from "../src/contracts/capability.ts";
import {
  verifyScoreMeasureRangeCompletion,
  verifyScoreMeasuresCompletion,
  verifyScoreMetadataCompletion,
  verifyScoreStructureCompletion,
} from "../src/agent/completion-verifier.ts";

const completedState = { status: "succeeded" as const };

test("score capability contracts accept only minimal versioned projections", () => {
  assert.equal(isScoreSummaryV1({
    documentId: "score-1",
    documentVersion: 3,
    title: "练习曲",
    measureCount: 8,
  }), true);
  assert.equal(isScoreMetadataV1({
    documentId: "score-1",
    documentVersion: 3,
    title: "练习曲",
    authors: ["Brilliant"],
    tempoBpm: 120,
  }), true);
  assert.equal(isScoreStructureV1({
    documentId: "score-1",
    documentVersion: 3,
    measureCount: 8,
    partCount: 1,
    staffCount: 2,
  }), true);
  assert.equal(isScoreMeasureIndexInputV1({
    expectedDocumentId: "score-1",
    expectedDocumentVersion: 3,
  }), true);
  assert.equal(isScoreMeasureIndexV1({
    documentId: "score-1",
    documentVersion: 3,
    measureIds: ["intro-a", "verse-x", "ending-z"],
  }), true);
  assert.equal(isScoreMeasureRangeInputV1({
    startMeasureId: "measure-2",
    endMeasureId: "measure-4",
    maxMeasures: 3,
  }), true);
  assert.equal(isScoreReadMeasuresInputV1({
    reference: { kind: "ordinal-range", startOrdinal: 2, endOrdinal: 4 },
  }), true);
  assert.equal(isScoreReadMeasuresInputV1({
    reference: { kind: "current-selection" },
  }), true);
  assert.equal(isScoreMeasureRangeV1({
    documentId: "score-1",
    documentVersion: 3,
    startMeasureId: "measure-2",
    endMeasureId: "measure-4",
    measureCount: 3,
    measures: ["measure-2", "measure-3", "measure-4"].map((measureId) => ({
      measureId,
      meter: { numerator: 4, denominator: 4 },
      pickupDuration: null,
    })),
  }), true);
});

test("score capability contracts reject unknown fields and invalid numeric values", () => {
  assert.equal(isScoreMeasureIndexInputV1({
    expectedDocumentId: "score-1",
    expectedDocumentVersion: -1,
  }), false);
  assert.equal(isScoreMeasureIndexV1({
    documentId: "score-1",
    documentVersion: 3,
    measureIds: ["measure-1", "measure-1"],
  }), false);
  assert.equal(isScoreMetadataV1({
    documentId: "score-1",
    documentVersion: 3,
    title: "练习曲",
    authors: [],
    tempoBpm: 120,
    notation: [],
  }), false);
  assert.equal(isScoreMetadataV1({
    documentId: "score-1",
    documentVersion: 3,
    title: "练习曲",
    authors: [],
    tempoBpm: Number.NaN,
  }), false);
  assert.equal(isScoreStructureV1({
    documentId: "score-1",
    documentVersion: 3,
    measureCount: 8.5,
    partCount: 1,
    staffCount: 2,
  }), false);
  assert.equal(isScoreSummaryV1({
    documentId: "score-1",
    documentVersion: -1,
    title: "练习曲",
    measureCount: 8,
  }), false);
  assert.equal(isScoreMeasureRangeInputV1({
    startMeasureId: "measure-1",
    endMeasureId: "measure-40",
    maxMeasures: 40,
  }), false);
  assert.equal(isScoreReadMeasuresInputV1({
    reference: { kind: "ordinal-range", startOrdinal: 0, endOrdinal: 2 },
  }), false);
  assert.equal(isScoreReadMeasuresInputV1({
    reference: { kind: "current-selection", measureId: "forged" },
  }), false);
  assert.equal(isScoreMeasureRangeV1({
    documentId: "score-1",
    documentVersion: 3,
    startMeasureId: "measure-1",
    endMeasureId: "measure-2",
    measureCount: 2,
    measures: [{
      measureId: "measure-1",
      meter: { numerator: 4, denominator: 4 },
      pickupDuration: null,
    }],
  }), false);
});

test("metadata and structure completion require the matching succeeded capability", () => {
  const metadata = verifyScoreMetadataCompletion({
    goal: "读取元数据",
    contextItems: [],
    invocations: [{
      invocationId: "invocation-metadata",
      capabilityId: "score.read-metadata",
      state: completedState,
      result: {
        invocationId: "invocation-metadata",
        capabilityId: "score.read-metadata",
        contractVersion: 1,
        status: "completed",
        data: {
          documentId: "score-1",
          documentVersion: 3,
          title: "练习曲",
          authors: [],
          tempoBpm: 100,
        },
      },
    }],
  });
  assert.equal(metadata.satisfied, true);
  assert.deepEqual(metadata.evidence, ["invocation-metadata", "score-1@3"]);

  const structure = verifyScoreStructureCompletion({
    goal: "读取结构",
    contextItems: [],
    invocations: [{
      invocationId: "invocation-summary",
      capabilityId: "score.read-summary",
      state: completedState,
      result: {
        invocationId: "invocation-summary",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        status: "completed",
        data: {
          documentId: "score-1",
          documentVersion: 3,
          title: "练习曲",
          measureCount: 8,
        },
      },
    }],
  });
  assert.equal(structure.satisfied, false);

  const range = verifyScoreMeasureRangeCompletion({
    goal: "读取小节范围",
    contextItems: [],
    invocations: [{
      invocationId: "invocation-range",
      capabilityId: "score.read-measure-range",
      state: completedState,
      result: {
        invocationId: "invocation-range",
        capabilityId: "score.read-measure-range",
        contractVersion: 1,
        status: "completed",
        data: {
          documentId: "score-1",
          documentVersion: 3,
          startMeasureId: "measure-1",
          endMeasureId: "measure-2",
          measureCount: 2,
          measures: ["measure-1", "measure-2"].map((measureId) => ({
            measureId,
            meter: { numerator: 4, denominator: 4 },
            pickupDuration: null,
          })),
        },
      },
    }],
  });
  assert.equal(range.satisfied, true);
  assert.deepEqual(range.evidence, ["invocation-range", "score-1@3"]);

  const measures = verifyScoreMeasuresCompletion({
    goal: "读取第 1 到第 2 小节",
    contextItems: [],
    invocations: [{
      invocationId: "invocation-measures",
      capabilityId: "score.read-measures",
      state: completedState,
      result: {
        invocationId: "invocation-measures",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        status: "completed",
        data: {
          documentId: "score-1",
          documentVersion: 3,
          startMeasureId: "measure-1",
          endMeasureId: "measure-2",
          measureCount: 2,
          measures: ["measure-1", "measure-2"].map((measureId) => ({
            measureId,
            meter: { numerator: 4, denominator: 4 },
            pickupDuration: null,
          })),
        },
      },
    }],
  });
  assert.equal(measures.satisfied, true);
  assert.deepEqual(measures.evidence, ["invocation-measures", "score-1@3"]);
});
