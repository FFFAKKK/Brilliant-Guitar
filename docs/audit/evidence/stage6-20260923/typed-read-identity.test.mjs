import assert from "node:assert/strict";
import { DirectScoreReadAgentPort } from "../../../../apps/workbench/src/agent/direct-score-read-agent-port.ts";
import { ScoreReadClient } from "../../../../apps/workbench/src/services/score-read-port.ts";

const workspaceId = "workspace-1";
const expected = { documentId: "score-1", documentVersion: 7 };
const wrongSummary = {
  documentId: "other-score",
  documentVersion: 99,
  title: "另一份作品",
  measureCount: 1,
};

const reads = new ScoreReadClient({
  async readScoreSummary() {
    return wrongSummary;
  },
}, workspaceId);

const typedResult = await reads.readSummary();
assert.equal(typedResult.status, "ready");
if (typedResult.status === "ready") {
  assert.deepEqual(
    { documentId: typedResult.data.documentId, documentVersion: typedResult.data.documentVersion },
    { documentId: "other-score", documentVersion: 99 },
  );
}

const port = new DirectScoreReadAgentPort({
  async invoke() {
    throw new Error("fallback must not be used");
  },
}, reads);

const agentResult = await port.invoke({
  invocationId: "inv-summary",
  capabilityId: "score.read-summary",
  contractVersion: 1,
  workspaceId,
  documentPrecondition: expected,
  input: {},
}, {
  workspace: {
    workspaceId,
    documentId: expected.documentId,
    documentVersion: expected.documentVersion,
    selection: null,
  },
  rangeBudget: 32,
});

assert.equal(agentResult.status, "completed");
if (agentResult.status === "completed") {
  assert.deepEqual(
    { documentId: agentResult.data.documentId, documentVersion: agentResult.data.documentVersion },
    { documentId: "other-score", documentVersion: 99 },
  );
}

console.log(JSON.stringify({ typedResult, agentResult }));
