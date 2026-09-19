import assert from "node:assert/strict";
import test from "node:test";

import type { AgentContextBudget, RunPolicySnapshot } from "../src/agent/agent-contracts.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import {
  verifyScoreMetadataTransactionCompletion,
  verifyScoreTempoUpdateCompletion,
} from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { isAgentPreparedExecution } from "../src/agent/prepared-mutation.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import {
  AgentRunController,
  getAgentRunRequiredApproval,
} from "../src/agent/run-controller.ts";
import { TauriAgentInvocationReceiptPort } from "../src/agent/tauri-invocation-receipt.ts";
import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";

const changeSetId = `sha256:${"a".repeat(64)}`;
const changeSet = {
  changeSetId,
  kind: "score-tempo" as const,
  documentId: "score-1",
  baseDocumentVersion: 7,
  beforeTempoBpm: 96,
  afterTempoBpm: 132,
};
const metadataChangeSetId = `sha256:${"b".repeat(64)}`;
const metadataChangeSet = {
  changeSetId: metadataChangeSetId,
  kind: "score-metadata-transaction" as const,
  documentId: "score-1",
  baseDocumentVersion: 7,
  operations: ["set-title", "set-tempo"] as const,
  before: { title: "练习曲", tempoBpm: 96 },
  after: { title: "夜曲", tempoBpm: 132 },
};

const policy: RunPolicySnapshot = {
  policyVersion: 1,
  allowedCapabilityIds: ["score.update-tempo"],
  allowedKinds: ["mutation"],
  maxToolsPerTurn: 1,
  maxCostClass: "constant",
  approvalMode: "risk-based",
};

const budget: AgentContextBudget = {
  tokenBudget: 400,
  itemCountBudget: 12,
  toolResultSizeBudget: 4096,
  rangeBudget: 0,
  historyTurnBudget: 2,
};

function idSource(): (kind: "event" | "turn" | "invocation" | "user-input") => string {
  let sequence = 0;
  return (kind) => `${kind}-${++sequence}`;
}

function request() {
  return {
    runId: "run-update-tempo",
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 7,
      selection: null,
    },
    goal: "将速度改为 132 BPM",
    intent: {
      kind: "edit" as const,
      requestedCapabilityIds: ["score.update-tempo"],
      scope: "document" as const,
    },
    policy,
    budget,
    initialContextItems: [],
    maxTurns: 3,
  };
}

test("prepared tempo mutation approves the authoritative ChangeSet before commit", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-tempo"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "update-tempo",
          capabilityId: "score.update-tempo",
          contractVersion: 1,
          input: { tempoBpm: 132 },
        }],
      },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.update-tempo"],
        contextSourceIds: ["score.update-tempo"],
      },
      decision: {
        kind: "finish",
        reason: "completed",
        text: "作品速度已修改为 132 BPM。",
      },
    },
  ]);
  const hostRequests: CapabilityTransportRequest[] = [];
  const capabilities = new WorkbenchAgentCapabilityPort({
    async invokeCapability(hostRequest) {
      hostRequests.push(hostRequest);
      if (hostRequest.capabilityId === "score.prepare-tempo-change") return {
        status: "completed",
        invocationId: hostRequest.invocationId,
        capabilityId: hostRequest.capabilityId,
        contractVersion: hostRequest.contractVersion,
        data: changeSet,
      };
      assert.equal(hostRequest.capabilityId, "score.commit-tempo-change");
      assert.deepEqual(hostRequest.input, { changeSet });
      return {
        status: "completed",
        invocationId: hostRequest.invocationId,
        capabilityId: hostRequest.capabilityId,
        contractVersion: hostRequest.contractVersion,
        data: {
          changeSetId,
          documentId: "score-1",
          documentVersion: 8,
          previousTempoBpm: 96,
          tempoBpm: 132,
          undoAvailable: true,
        },
      };
    },
  });
  const controller = new AgentRunController({
    provider,
    capabilities,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreTempoUpdateCompletion,
    now: () => 100,
    nextId: idSource(),
  });

  const waiting = await controller.run(request());

  assert.deepEqual(hostRequests.map((item) => item.capabilityId), ["score.prepare-tempo-change"]);
  assert.deepEqual(waiting.run.state, {
    lifecycle: "waiting",
    phase: "executing",
    waitReason: "approval",
  });
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.notEqual(approval, null);
  assert.equal(approval!.items[0]?.capabilityId, "score.update-tempo");
  assert.equal(approval!.items[0]?.changeSetId, changeSetId);
  assert.deepEqual(approval!.items[0]?.preview, {
    kind: "field-change",
    field: "score.tempo",
    before: "96 BPM",
    after: "132 BPM",
  });
  const invocation = waiting.run.invocations[0];
  assert.deepEqual(invocation?.input, { tempoBpm: 132 });
  assert.equal(isAgentPreparedExecution(invocation?.preparedExecution), true);
  assert.deepEqual(invocation?.preparedExecution?.commit.input, { changeSet });
  assert.equal(waiting.run.events.some((event) => event.event.type === "turn.tools-accepted"), false);

  const completed = await controller.continueWithApproval(request(), waiting.run, {
    approvalId: approval!.approvalId,
    kind: "capability-execution",
    outcome: "approved",
    decidedBy: "local-user",
  });

  assert.deepEqual(hostRequests.map((item) => item.capabilityId), [
    "score.prepare-tempo-change",
    "score.commit-tempo-change",
  ]);
  assert.equal(completed.run.state.lifecycle, "terminal");
  assert.equal(completed.verification?.satisfied, true);
  assert.deepEqual(completed.verification?.evidence, [
    invocation?.invocationId,
    changeSetId,
    "score-1@8",
    "score.tempo=132",
  ]);
  assert.equal(completed.run.invocations[0]?.result?.capabilityId, "score.update-tempo");
  assert.equal(provider.requests.every((item) => (
    item.toolset.capabilityIds.length === 1
      && item.toolset.capabilityIds[0] === "score.update-tempo"
  )), true);
  assert.equal(FIRST_PARTY_CAPABILITY_CATALOG.some(
    (item) => item.id === "score.prepare-tempo-change" || item.id === "score.commit-tempo-change",
  ), false);
});

test("denying a prepared tempo ChangeSet never dispatches the commit", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-tempo"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "update-tempo",
          capabilityId: "score.update-tempo",
          contractVersion: 1,
          input: { tempoBpm: 132 },
        }],
      },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.update-tempo"],
        contextSourceIds: ["approval:run-update-tempo:turn-3"],
      },
      decision: { kind: "message", text: "已停止速度修改。" },
    },
  ]);
  const hostCapabilityIds: string[] = [];
  const capabilities = new WorkbenchAgentCapabilityPort({
    async invokeCapability(hostRequest) {
      hostCapabilityIds.push(hostRequest.capabilityId);
      assert.equal(hostRequest.capabilityId, "score.prepare-tempo-change");
      return {
        status: "completed",
        invocationId: hostRequest.invocationId,
        capabilityId: hostRequest.capabilityId,
        contractVersion: hostRequest.contractVersion,
        data: changeSet,
      };
    },
  });
  const controller = new AgentRunController({
    provider,
    capabilities,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreTempoUpdateCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const waiting = await controller.run(request());
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.notEqual(approval, null);

  const denied = await controller.continueWithApproval(request(), waiting.run, {
    approvalId: approval!.approvalId,
    kind: "capability-execution",
    outcome: "denied",
    decidedBy: "local-user",
  });

  assert.deepEqual(hostCapabilityIds, ["score.prepare-tempo-change"]);
  assert.equal(denied.run.invocations[0]?.state.status, "rejected");
  assert.equal(denied.run.invocations[0]?.events.some(
    (event) => event.event.type === "invocation.dispatched",
  ), false);
  assert.equal(denied.response, "已停止速度修改。");
});

test("prepared mutation receipt lookup uses internal commit identity and restores outer identity", async () => {
  const preparedExecution = {
    kind: "change-set" as const,
    changeSetId,
    preparation: {
      invocationId: "prepare-1",
      capabilityId: "score.prepare-tempo-change",
      contractVersion: 1,
    },
    commit: {
      capabilityId: "score.commit-tempo-change",
      contractVersion: 1,
      documentPrecondition: { documentId: "score-1", documentVersion: 7 },
      input: { changeSet },
    },
    approvalSummary: "将作品速度从 96 BPM 修改为 132 BPM",
    approvalPreview: {
      kind: "field-change" as const,
      field: "score.tempo",
      before: "96 BPM",
      after: "132 BPM",
    },
  };
  const receipt = new TauriAgentInvocationReceiptPort(async <T>(_command: string, args?: Record<string, unknown>) => {
    const receiptRequest = args?.request as CapabilityTransportRequest;
    assert.equal(receiptRequest.capabilityId, "score.commit-tempo-change");
    assert.deepEqual(receiptRequest.input, { changeSet });
    return {
      status: "resolved",
      result: {
        status: "completed",
        invocationId: "outer-invocation",
        capabilityId: "score.commit-tempo-change",
        contractVersion: 1,
        data: {
          changeSetId,
          documentId: "score-1",
          documentVersion: 8,
          previousTempoBpm: 96,
          tempoBpm: 132,
          undoAvailable: true,
        },
      },
    } as T;
  });

  const result = await receipt.lookup({
    runId: "run-1",
    workspace: request().workspace,
    invocation: {
      invocationId: "outer-invocation",
      runId: "run-1",
      turnId: "turn-1",
      capabilityId: "score.update-tempo",
      contractVersion: 1,
      input: { tempoBpm: 132 },
      preparedExecution,
      baseDocumentVersion: 7,
      state: { status: "outcome-unknown" },
      result: null,
      events: [],
    },
  });

  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.equal(result.result.capabilityId, "score.update-tempo");
    assert.equal(result.result.invocationId, "outer-invocation");
  }
});

test("prepared metadata transaction binds two changes to one approval and one commit", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-metadata"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "update-metadata",
          capabilityId: "score.update-metadata",
          contractVersion: 1,
          input: { title: "夜曲", tempoBpm: 132 },
        }],
      },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.update-metadata"],
        contextSourceIds: ["score.update-metadata"],
      },
      decision: {
        kind: "finish",
        reason: "completed",
        text: "标题与速度已在一个事务中修改。",
      },
    },
  ]);
  const hostRequests: CapabilityTransportRequest[] = [];
  const capabilities = new WorkbenchAgentCapabilityPort({
    async invokeCapability(hostRequest) {
      hostRequests.push(hostRequest);
      if (hostRequest.capabilityId === "score.prepare-metadata-transaction") return {
        status: "completed",
        invocationId: hostRequest.invocationId,
        capabilityId: hostRequest.capabilityId,
        contractVersion: hostRequest.contractVersion,
        data: metadataChangeSet,
      };
      assert.equal(hostRequest.capabilityId, "score.commit-metadata-transaction");
      assert.deepEqual(hostRequest.input, { changeSet: metadataChangeSet });
      return {
        status: "completed",
        invocationId: hostRequest.invocationId,
        capabilityId: hostRequest.capabilityId,
        contractVersion: hostRequest.contractVersion,
        data: {
          changeSetId: metadataChangeSetId,
          documentId: "score-1",
          documentVersion: 8,
          appliedOperations: ["set-title", "set-tempo"],
          previous: metadataChangeSet.before,
          current: metadataChangeSet.after,
          undoAvailable: true,
        },
      };
    },
  });
  const controller = new AgentRunController({
    provider,
    capabilities,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreMetadataTransactionCompletion,
    now: () => 100,
    nextId: idSource(),
  });
  const metadataRequest = {
    ...request(),
    runId: "run-update-metadata",
    goal: "把标题改成夜曲，同时把速度改成 132 BPM",
    intent: {
      kind: "edit" as const,
      requestedCapabilityIds: ["score.update-metadata"],
      scope: "document" as const,
    },
    policy: {
      ...policy,
      allowedCapabilityIds: ["score.update-metadata"],
    },
  };

  const waiting = await controller.run(metadataRequest);
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.notEqual(approval, null);
  assert.deepEqual(hostRequests.map((item) => item.capabilityId), [
    "score.prepare-metadata-transaction",
  ]);
  assert.equal(approval!.items[0]?.changeSetId, metadataChangeSetId);
  assert.deepEqual(approval!.items[0]?.preview, {
    kind: "change-list",
    changes: [{
      kind: "field-change",
      field: "score.title",
      before: "练习曲",
      after: "夜曲",
    }, {
      kind: "field-change",
      field: "score.tempo",
      before: "96 BPM",
      after: "132 BPM",
    }],
  });
  const prepared = waiting.run.invocations[0]?.preparedExecution;
  assert.ok(prepared);
  assert.equal(isAgentPreparedExecution(prepared), true);
  assert.equal(isAgentPreparedExecution({
    ...prepared,
    approvalPreview: {
      kind: "change-list",
      changes: [{
        kind: "field-change",
        field: "score.title",
        before: "练习曲",
        after: "被篡改的标题",
      }, {
        kind: "field-change",
        field: "score.tempo",
        before: "96 BPM",
        after: "132 BPM",
      }],
    },
  }), false);

  const completed = await controller.continueWithApproval(metadataRequest, waiting.run, {
    approvalId: approval!.approvalId,
    kind: "capability-execution",
    outcome: "approved",
    decidedBy: "local-user",
  });
  assert.deepEqual(hostRequests.map((item) => item.capabilityId), [
    "score.prepare-metadata-transaction",
    "score.commit-metadata-transaction",
  ]);
  assert.equal(completed.verification?.satisfied, true);
  assert.deepEqual(completed.verification?.evidence, [
    completed.run.invocations[0]?.invocationId,
    metadataChangeSetId,
    "score-1@8",
    "operations=set-title,set-tempo",
  ]);
  assert.equal(completed.run.invocations[0]?.result?.capabilityId, "score.update-metadata");
  assert.equal(FIRST_PARTY_CAPABILITY_CATALOG.some((item) => (
    item.id === "score.prepare-metadata-transaction"
      || item.id === "score.commit-metadata-transaction"
  )), false);
});
