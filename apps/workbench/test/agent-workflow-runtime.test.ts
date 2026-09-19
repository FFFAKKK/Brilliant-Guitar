import assert from "node:assert/strict";
import test from "node:test";

import type { RegisteredWorkflow, WorkflowDirectory } from "../src/contracts/workflow.ts";
import {
  AgentWorkflowResolutionError,
  AgentWorkflowRuntime,
} from "../src/agent/workflow-runtime.ts";

function registered(overrides: Partial<RegisteredWorkflow> = {}): RegisteredWorkflow {
  return {
    id: "score.inspect",
    contractVersion: 1,
    name: "检查乐谱",
    description: "读取乐谱信息",
    runtime: "agent-orchestration-v1",
    operationIds: ["score.read-summary", "score.read-metadata"],
    entryOperationIds: ["score.read-summary", "score.read-metadata"],
    ownerPluginId: "brilliant.score",
    ownerPluginVersion: "1.0.0",
    ...overrides,
  };
}

function directory(items: readonly RegisteredWorkflow[]): WorkflowDirectory {
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    get: (id) => byId.get(id),
    list: () => items,
    listByPlugin: (ownerPluginId) => items.filter((item) => item.ownerPluginId === ownerPluginId),
  };
}

test("Agent workflow runtime resolves an entry operation and pins plugin identity", () => {
  const runtime = new AgentWorkflowRuntime(directory([registered()]), [
    "score.read-summary",
    "score.read-metadata",
  ]);

  const identity = runtime.resolveEntryOperation("score.read-summary");
  assert.deepEqual(identity, {
    id: "score.inspect",
    contractVersion: 1,
    ownerPluginId: "brilliant.score",
    ownerPluginVersion: "1.0.0",
  });
  assert.deepEqual(runtime.resolvePinned(identity, "score.read-metadata"), identity);
});
test("Agent workflow runtime rejects ambiguous entries and unavailable operations", () => {
  const ambiguous = new AgentWorkflowRuntime(directory([
    registered(),
    registered({ id: "score.inspect.alternative", ownerPluginId: "brilliant.alternative" }),
  ]), ["score.read-summary", "score.read-metadata"]);
  assert.throws(
    () => ambiguous.resolveEntryOperation("score.read-summary"),
    (error) => error instanceof AgentWorkflowResolutionError && error.code === "workflow-ambiguous",
  );

  const unavailable = new AgentWorkflowRuntime(directory([registered()]), ["score.read-summary"]);
  assert.throws(
    () => unavailable.resolveEntryOperation("score.read-summary"),
    (error) => error instanceof AgentWorkflowResolutionError && error.code === "workflow-operation-unavailable",
  );
});

test("Agent workflow runtime refuses stale pinned workflow versions", () => {
  const runtime = new AgentWorkflowRuntime(directory([registered()]), [
    "score.read-summary",
    "score.read-metadata",
  ]);
  assert.throws(
    () => runtime.resolvePinned({
      id: "score.inspect",
      contractVersion: 1,
      ownerPluginId: "brilliant.score",
      ownerPluginVersion: "2.0.0",
    }, "score.read-summary"),
    (error) => error instanceof AgentWorkflowResolutionError && error.code === "workflow-version-mismatch",
  );
});
