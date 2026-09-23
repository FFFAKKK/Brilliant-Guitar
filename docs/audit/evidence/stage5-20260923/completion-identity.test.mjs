import assert from "node:assert/strict";
import { verifyScoreSummaryCompletion } from "../../../../apps/workbench/src/agent/completion-verifier.ts";

function invocation(data) {
  return {
    invocationId: "inv-summary",
    capabilityId: "score.read-summary",
    input: {},
    preparedExecution: null,
    baseDocumentVersion: 7,
    state: { status: "succeeded" },
    result: {
      invocationId: "inv-summary",
      capabilityId: "score.read-summary",
      contractVersion: 1,
      status: "completed",
      data,
    },
  };
}

function verify(data) {
  return verifyScoreSummaryCompletion({
    goal: "读取当前乐谱概要",
    contextItems: [],
    invocations: [invocation(data)],
  });
}

const sameDocument = verify({
  documentId: "score-1",
  documentVersion: 7,
  title: "当前作品",
  measureCount: 1,
});
assert.equal(sameDocument.satisfied, true);

const differentDocument = verify({
  documentId: "other-score",
  documentVersion: 99,
  title: "另一份作品",
  measureCount: 1,
});
assert.equal(differentDocument.satisfied, true);

console.log(JSON.stringify({
  sameDocument,
  differentDocument,
}));
