import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentActionRuntime,
  AgentActionRuntimeError,
} from "../src/agent/action-runtime.ts";
import { UnavailableAgentPreparedMutationPort } from "../src/agent/prepared-mutation.ts";
import { AgentWorkflowRuntime } from "../src/agent/workflow-runtime.ts";
import type { RegisteredWorkflow, WorkflowDirectory } from "../src/contracts/workflow.ts";

const workflow: RegisteredWorkflow = {
  id: "score.inspect",
  contractVersion: 1,
  name: "检查乐谱",
  description: "读取乐谱信息",
  runtime: "agent-orchestration-v1",
  operationIds: ["score.read-summary", "score.read-metadata"],
  entryOperationIds: ["score.read-summary"],
  ownerPluginId: "brilliant.score",
  ownerPluginVersion: "1.0.0",
};

const directory: WorkflowDirectory = {
  get: (id) => id === workflow.id ? workflow : undefined,
  list: () => [workflow],
  listByPlugin: (ownerPluginId) => ownerPluginId === workflow.ownerPluginId ? [workflow] : [],
};

const workspace = {
  workspaceId: "workspace-1",
  documentId: "score-1",
  documentVersion: 7,
  selection: null,
};

test("Agent action runtime shares one effect boundary for direct and workflow operations", async () => {
  const calls: string[] = [];
  const workflows = new AgentWorkflowRuntime(directory, workflow.operationIds);
  const runtime = new AgentActionRuntime({
    async invoke(request) {
      calls.push(request.capabilityId);
      return {
        status: "completed",
        invocationId: request.invocationId,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: {},
      };
    },
  }, new UnavailableAgentPreparedMutationPort(), workflows);
  const context = runtime.context({
    kind: "read",
    requestedCapabilityIds: ["score.read-summary"],
    scope: "document",
    workflow: workflows.resolveEntryOperation("score.read-summary"),
  }, workspace, 16);

  await runtime.invoke({
    invocationId: "invocation-1",
    capabilityId: "score.read-metadata",
    contractVersion: 1,
    workspaceId: workspace.workspaceId,
    documentPrecondition: {
      documentId: "score-1",
      documentVersion: 7,
    },
    input: {},
  }, workspace, 16, context);

  assert.deepEqual(calls, ["score.read-metadata"]);
  await assert.rejects(
    runtime.invoke({
      invocationId: "invocation-2",
      capabilityId: "score.update-tempo",
      contractVersion: 1,
      workspaceId: workspace.workspaceId,
      documentPrecondition: {
        documentId: "score-1",
        documentVersion: 7,
      },
      input: {},
    }, workspace, 16, context),
    (error) => error instanceof AgentActionRuntimeError
      && error.outcome === "definite-failure",
  );
  assert.deepEqual(calls, ["score.read-metadata"]);
});

test("Agent action runtime keeps direct tools available without a workflow wrapper", async () => {
  let invoked = false;
  const runtime = new AgentActionRuntime({
    async invoke(request) {
      invoked = true;
      return {
        status: "completed",
        invocationId: request.invocationId,
        capabilityId: request.capabilityId,
        contractVersion: request.contractVersion,
        data: {},
      };
    },
  }, new UnavailableAgentPreparedMutationPort());

  const context = runtime.context({
    kind: "read",
    requestedCapabilityIds: ["score.read-summary"],
    scope: "document",
  }, workspace, 4);
  assert.equal(context, null);

  await runtime.invoke({
    invocationId: "invocation-direct",
    capabilityId: "score.read-summary",
    contractVersion: 1,
    workspaceId: workspace.workspaceId,
    documentPrecondition: null,
    input: {},
  }, workspace, 4, context);
  assert.equal(invoked, true);
});
