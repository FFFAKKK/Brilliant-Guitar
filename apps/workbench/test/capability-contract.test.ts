import assert from "node:assert/strict";
import test from "node:test";

import {
  isScoreMeasureIndexInputV1,
  isScoreMeasureIndexV1,
  isScoreMeasureRangeInputV1,
  isScoreMeasureRangeV1,
  isScoreCommitMetadataTransactionInputV1,
  isScoreMetadataTransactionChangeSetV1,
  isScoreMetadataTransactionUpdateV1,
  isScoreReadMeasuresInputV1,
  isScoreMetadataV1,
  isScoreStructureV1,
  isScoreSummaryV1,
  isScoreCommitTempoChangeInputV1,
  isScorePrepareTempoChangeInputV1,
  isScoreTempoChangeSetV1,
  isScoreTempoUpdateV1,
  isScoreTitleUpdateV1,
  isScoreUpdateTitleInputV1,
  isScoreUpdateMetadataInputV1,
} from "../src/contracts/capability.ts";
import {
  verifyScoreMeasureRangeCompletion,
  verifyScoreMeasuresCompletion,
  verifyScoreMetadataCompletion,
  verifyScoreStructureCompletion,
  verifyScoreTitleUpdateCompletion,
} from "../src/agent/completion-verifier.ts";

const completedState = { status: "succeeded" as const };
const tempoChangeSet = {
  changeSetId: `sha256:${"a".repeat(64)}`,
  kind: "score-tempo" as const,
  documentId: "score-1",
  baseDocumentVersion: 3,
  beforeTempoBpm: 96,
  afterTempoBpm: 120,
};
const metadataTransactionChangeSet = {
  changeSetId: `sha256:${"b".repeat(64)}`,
  kind: "score-metadata-transaction" as const,
  documentId: "score-1",
  baseDocumentVersion: 3,
  operations: ["set-title", "set-tempo"] as const,
  before: { title: "练习曲", tempoBpm: 96 },
  after: { title: "夜曲", tempoBpm: 120 },
};

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
  assert.equal(isScoreUpdateTitleInputV1({ title: "夜曲" }), true);
  assert.equal(isScoreTitleUpdateV1({
    documentId: "score-1",
    documentVersion: 4,
    previousTitle: "练习曲",
    title: "夜曲",
    undoAvailable: true,
  }), true);
  assert.equal(isScorePrepareTempoChangeInputV1({ tempoBpm: 120 }), true);
  assert.equal(isScoreTempoChangeSetV1(tempoChangeSet), true);
  assert.equal(isScoreCommitTempoChangeInputV1({ changeSet: tempoChangeSet }), true);
  assert.equal(isScoreTempoUpdateV1({
    changeSetId: tempoChangeSet.changeSetId,
    documentId: "score-1",
    documentVersion: 4,
    previousTempoBpm: 96,
    tempoBpm: 120,
    undoAvailable: true,
  }), true);
  assert.equal(isScoreUpdateMetadataInputV1({ title: "夜曲", tempoBpm: 120 }), true);
  assert.equal(isScoreMetadataTransactionChangeSetV1(metadataTransactionChangeSet), true);
  assert.equal(isScoreCommitMetadataTransactionInputV1({
    changeSet: metadataTransactionChangeSet,
  }), true);
  assert.equal(isScoreMetadataTransactionUpdateV1({
    changeSetId: metadataTransactionChangeSet.changeSetId,
    documentId: "score-1",
    documentVersion: 4,
    appliedOperations: ["set-title", "set-tempo"],
    previous: metadataTransactionChangeSet.before,
    current: metadataTransactionChangeSet.after,
    undoAvailable: true,
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
  assert.equal(isScoreUpdateTitleInputV1({ title: " 夜曲 " }), false);
  assert.equal(isScoreUpdateTitleInputV1({ title: "" }), false);
  assert.equal(isScoreTitleUpdateV1({
    documentId: "score-1",
    documentVersion: 4,
    previousTitle: "练习曲",
    title: "夜曲",
    undoAvailable: true,
    fullDocument: {},
  }), false);
  assert.equal(isScorePrepareTempoChangeInputV1({ tempoBpm: Number.NaN }), false);
  assert.equal(isScorePrepareTempoChangeInputV1({ tempoBpm: 0 }), false);
  assert.equal(isScoreTempoChangeSetV1({
    ...tempoChangeSet,
    changeSetId: "client-invented",
  }), false);
  assert.equal(isScoreTempoChangeSetV1({
    ...tempoChangeSet,
    beforeTempoBpm: 120,
  }), false);
  assert.equal(isScoreCommitTempoChangeInputV1({
    changeSet: tempoChangeSet,
    approved: true,
  }), false);
  assert.equal(isScoreTempoUpdateV1({
    changeSetId: tempoChangeSet.changeSetId,
    documentId: "score-1",
    documentVersion: 4,
    previousTempoBpm: 96,
    tempoBpm: Number.POSITIVE_INFINITY,
    undoAvailable: true,
  }), false);
  assert.equal(isScoreUpdateMetadataInputV1({}), false);
  assert.equal(isScoreUpdateMetadataInputV1({ title: " 夜曲 " }), false);
  assert.equal(isScoreMetadataTransactionChangeSetV1({
    ...metadataTransactionChangeSet,
    operations: ["set-tempo", "set-title"],
  }), false);
  assert.equal(isScoreMetadataTransactionChangeSetV1({
    ...metadataTransactionChangeSet,
    after: metadataTransactionChangeSet.before,
    operations: [],
  }), false);
  assert.equal(isScoreCommitMetadataTransactionInputV1({
    changeSet: metadataTransactionChangeSet,
    approved: true,
  }), false);
});

test("metadata and structure completion require the matching succeeded capability", () => {
  const metadata = verifyScoreMetadataCompletion({
    goal: "读取元数据",
    contextItems: [],
    invocations: [{
      invocationId: "invocation-metadata",
      capabilityId: "score.read-metadata",
      input: {},
      baseDocumentVersion: 3,
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
      input: {},
      baseDocumentVersion: 3,
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
      input: { startMeasureId: "measure-1", endMeasureId: "measure-2", maxMeasures: 2 },
      baseDocumentVersion: 3,
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
      input: {
        reference: {
          kind: "stable-id-range",
          startMeasureId: "measure-1",
          endMeasureId: "measure-2",
        },
      },
      baseDocumentVersion: 3,
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

  const titleInvocation = {
    invocationId: "invocation-title",
    capabilityId: "score.update-title",
    input: { title: "夜曲" },
    baseDocumentVersion: 3,
    state: completedState,
    result: {
      invocationId: "invocation-title",
      capabilityId: "score.update-title",
      contractVersion: 1,
      status: "completed" as const,
      data: {
        documentId: "score-1",
        documentVersion: 4,
        previousTitle: "练习曲",
        title: "夜曲",
        undoAvailable: true,
      },
    },
  };
  const titleUpdate = verifyScoreTitleUpdateCompletion({
    goal: "把标题改为夜曲",
    contextItems: [],
    invocations: [titleInvocation],
  });
  assert.equal(titleUpdate.satisfied, true);
  assert.deepEqual(titleUpdate.evidence, ["invocation-title", "score-1@4", "score.title=夜曲"]);

  const wrongTitle = verifyScoreTitleUpdateCompletion({
    goal: "把标题改为夜曲",
    contextItems: [],
    invocations: [{
      ...titleInvocation,
      result: {
        ...titleInvocation.result,
        data: { ...titleInvocation.result.data, title: "奏鸣曲" },
      },
    }],
  });
  assert.equal(wrongTitle.satisfied, false);
  assert.equal(wrongTitle.reason, "标题修改结果与已批准的目标标题不一致");

  const wrongVersion = verifyScoreTitleUpdateCompletion({
    goal: "把标题改为夜曲",
    contextItems: [],
    invocations: [{
      ...titleInvocation,
      result: {
        ...titleInvocation.result,
        data: { ...titleInvocation.result.data, documentVersion: 5 },
      },
    }],
  });
  assert.equal(wrongVersion.satisfied, false);
  assert.equal(wrongVersion.reason, "标题修改没有产生预期的单次文档版本变更");

  const missingUndo = verifyScoreTitleUpdateCompletion({
    goal: "把标题改为夜曲",
    contextItems: [],
    invocations: [{
      ...titleInvocation,
      result: {
        ...titleInvocation.result,
        data: { ...titleInvocation.result.data, undoAvailable: false },
      },
    }],
  });
  assert.equal(missingUndo.satisfied, false);
  assert.equal(missingUndo.reason, "标题修改完成后没有可用的撤销记录");
});
