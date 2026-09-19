import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRecord } from "../src/agent/run-controller.ts";
import {
  getAgentUserInputConsumption,
  projectAgentUserInputConsumptions,
} from "../src/agent/user-input-consumption.ts";

const firstRequest = {
  requestId: "input-1",
  kind: "measure-selection" as const,
  prompt: "请选择小节",
  sourceInvocationId: "invocation-1",
  constraints: { documentId: "score-1", minMeasures: 1, maxMeasures: 32 },
};

const secondRequest = {
  ...firstRequest,
  requestId: "input-2",
  sourceInvocationId: "invocation-2",
};

const selection = {
  kind: "measure-range" as const,
  documentId: "score-1",
  documentVersion: 8,
  startMeasureId: "measure-2",
  endMeasureId: "measure-3",
};

function run(): AgentRunRecord {
  return {
    runId: "run-1",
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 8,
      selection,
    },
    goal: "读取选择区",
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    createdAt: 1,
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: ["score.read-measures"],
      allowedKinds: ["query"],
      maxToolsPerTurn: 1,
      maxCostClass: "range",
      approvalMode: "disallow",
    },
    intent: { kind: "read", requestedCapabilityIds: ["score.read-measures"], scope: "range" },
    events: [
      {
        eventId: "event-required-1",
        runId: "run-1",
        sequence: 1,
        occurredAt: 10,
        event: { type: "user-input.required", input: firstRequest },
      },
      {
        eventId: "event-provided-1",
        runId: "run-1",
        sequence: 2,
        occurredAt: 20,
        event: {
          type: "user-input.provided",
          input: { requestId: "input-1", kind: "measure-selection", selection },
        },
      },
      {
        eventId: "event-required-2",
        runId: "run-1",
        sequence: 3,
        occurredAt: 30,
        event: { type: "user-input.required", input: secondRequest },
      },
    ],
    turns: [],
    invocations: [],
    contextItems: [],
  };
}

test("user input consumption is projected from paired durable Run events", () => {
  const consumptions = projectAgentUserInputConsumptions(run());

  assert.equal(consumptions.length, 1);
  assert.deepEqual(consumptions[0], {
    requestId: "input-1",
    requestEventId: "event-required-1",
    requestedAt: 10,
    providedEventId: "event-provided-1",
    providedAt: 20,
    requiredInput: firstRequest,
    providedInput: { requestId: "input-1", kind: "measure-selection", selection },
  });
  assert.equal(getAgentUserInputConsumption(run(), "input-2"), null);
});
