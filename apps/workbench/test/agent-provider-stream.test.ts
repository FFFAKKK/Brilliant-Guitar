import assert from "node:assert/strict";
import test from "node:test";

import type { AgentProviderRequest } from "../src/agent/provider.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import {
  reduceAgentProviderStream,
  type AgentProviderStreamEvent,
  type AgentProviderStreamState,
} from "../src/agent/provider-stream.ts";

const request: AgentProviderRequest = {
  runId: "run-stream",
  turnId: "turn-stream",
  goal: "Read the score",
  runState: { lifecycle: "active", phase: "planning" },
  context: {
    contextItems: [],
    omittedItems: [],
    versionWarnings: [],
    budget: { estimatedTokens: 0, itemCount: 0, tokenBudget: 100, itemCountBudget: 4, exceeded: false },
  },
  toolset: {
    snapshotId: "toolset-1",
    policyVersion: 1,
    toolsetHash: "hash-1",
    capabilityIds: ["score.read-summary"],
    toolDescriptors: [],
    maxCalls: 1,
  },
};

function apply(
  state: AgentProviderStreamState | null,
  event: AgentProviderStreamEvent,
): AgentProviderStreamState {
  const result = reduceAgentProviderStream(state, event);
  if (!result.accepted) assert.fail(result.message);
  return result.state;
}

test("Provider stream accepts one ordered and identity-bound response", () => {
  let state: AgentProviderStreamState | null = null;
  state = apply(state, { type: "response.started", runId: "run-1", turnId: "turn-1", sequence: 1 });
  state = apply(state, {
    type: "response.tool-input-delta",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 2,
    callId: "call-1",
    delta: "{\"title\":" ,
  });
  state = apply(state, {
    type: "response.usage",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 3,
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
  });
  state = apply(state, { type: "response.completed", runId: "run-1", turnId: "turn-1", sequence: 4 });

  assert.equal(state.lifecycle, "terminal");
  assert.equal(state.lastSequence, 4);
  assert.equal(state.lifecycle === "terminal" ? state.reason : null, "completed");
});

test("Provider stream rejects duplicate, out-of-order and cross-turn events", () => {
  const state = apply(null, {
    type: "response.started",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 1,
  });
  const duplicate = reduceAgentProviderStream(state, {
    type: "response.text-delta",
    runId: "run-1",
    turnId: "turn-1",
    sequence: 1,
    delta: "duplicate",
  });
  const wrongTurn = reduceAgentProviderStream(state, {
    type: "response.text-delta",
    runId: "run-1",
    turnId: "turn-2",
    sequence: 2,
    delta: "wrong turn",
  });

  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.code, "sequence-mismatch");
  assert.equal(wrongTurn.accepted, false);
  assert.equal(wrongTurn.code, "identity-mismatch");
});

test("Fake Provider streams progress but returns only the complete decision", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    events: [
      { type: "response.started" },
      { type: "response.text-delta", delta: "Reading" },
      { type: "response.tool-input-delta", callId: "call-1", delta: "{}" },
      { type: "response.completed" },
    ],
    decision: {
      kind: "tool-calls",
      calls: [{ callId: "call-1", capabilityId: "score.read-summary", contractVersion: 1, input: {} }],
    },
  }]);
  const events: AgentProviderStreamEvent[] = [];

  const decision = await provider.decide(request, null, (event) => events.push(event));

  assert.equal(events.length, 4);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.equal(events.every((event) => event.runId === request.runId && event.turnId === request.turnId), true);
  assert.deepEqual(decision, {
    kind: "tool-calls",
    calls: [{ callId: "call-1", capabilityId: "score.read-summary", contractVersion: 1, input: {} }],
  });
});

test("cancelling a streamed Fake Provider prevents a final decision", async () => {
  const provider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
    events: [
      { type: "response.started" },
      { type: "response.text-delta", delta: "partial" },
      { type: "response.completed" },
    ],
    decision: { kind: "finish", reason: "completed", text: "must not be returned" },
  }]);
  const cancellation = new AbortController();
  const observed: string[] = [];

  await assert.rejects(provider.decide(request, cancellation.signal, (event) => {
    observed.push(event.type);
    if (event.type === "response.text-delta") cancellation.abort();
  }), (error: unknown) => error instanceof DOMException && error.name === "AbortError");

  assert.deepEqual(observed, ["response.started", "response.text-delta"]);
  assert.equal(provider.exhausted, true);
});
