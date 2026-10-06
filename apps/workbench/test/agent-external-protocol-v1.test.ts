import assert from "node:assert/strict";
import test from "node:test";
import { createFakeExternalHello } from "../src/agent/external-agent-fake-transport.ts";
import { createDecisionResponse, projectTurnRequest } from "../src/agent/external-agent-projection.ts";
import { EXTERNAL_AGENT_PROTOCOL_LIMITS as LIMITS } from "../src/agent/external-protocol-v1.ts";
import {
  decodeExternalMessage, encodeExternalMessage, ExternalAgentProtocolError, negotiateExternalLimits,
  snapshotExternalJson, validateCancel, validateHello, validateTurnRequest, validateTurnResponse,
} from "../src/agent/external-protocol-v1-validator.ts";
import { providerRequest } from "./external-agent-fixture.ts";

function request() { return projectTurnRequest(providerRequest, "example.external.agent", "2026-10-07T00:00:01.000Z", "req-1"); }
function hasCode(code: string) { return (error: unknown) => error instanceof ExternalAgentProtocolError && error.code === code; }

// This file tests the public JSON protocol without loading a concrete Agent SDK.
test("external protocol round-trips all four messages as detached frozen data", () => {
  const turn = request();
  const messages = [createFakeExternalHello(), turn,
    createDecisionResponse(turn, { kind: "message", text: " 多行\n响应 " }),
    { schemaVersion: 1, messageType: "turn.cancel", requestId: turn.requestId, runId: turn.runId, turnId: turn.turnId, reason: "user" }];
  for (const message of messages) {
    const decoded = decodeExternalMessage(encodeExternalMessage(message));
    assert.deepEqual(decoded, message);
    assert.notEqual(decoded, message);
    assert.equal(Object.isFrozen(decoded), true);
  }
  assert.equal("runState" in turn, false);
  assert.equal("budget" in turn.context, false);
  assert.equal("kind" in turn.tools[0]!, false); // No false inference from document reads to mutations.
  assert.equal("snapshotId" in turn, false);
  assert.equal("capabilities" in turn, false);
  assert.equal(turn.tools[0]?.requiresApproval, false);
  assert.equal(turn.maxToolCalls, 1);
  assert.notEqual(turn.context.items[0]?.content, providerRequest.context.contextItems[0]?.content);
  assert.equal(Object.isFrozen(turn.context.items[0]?.content), true);
});

test("protocol and plugin versions are independent and negotiation clamps host limits", () => {
  const hello = createFakeExternalHello();
  const accepted = validateHello({ ...hello, protocol: { supportedVersions: [2, 1] },
    limits: { maxRequestBytes: 999999, maxResponseBytes: 300, maxContextItems: 500, maxToolCalls: 999 } });
  assert.deepEqual(negotiateExternalLimits(accepted), {
    maxRequestBytes: LIMITS.maxMessageBytes, maxResponseBytes: 300, maxContextItems: 128, maxToolCalls: 16,
  });
  assert.throws(() => negotiateExternalLimits(validateHello({ ...hello, protocol: { supportedVersions: [2] } })), hasCode("version-unsupported"));
  for (const versions of [[], [1, 1], [0], [-1], [1.2]]) {
    assert.throws(() => validateHello({ ...hello, protocol: { supportedVersions: versions } }), hasCode("protocol-invalid"));
  }
});

test("strict envelope rejects unknown fields, invalid identities and incompatible schemas", () => {
  assert.throws(() => validateHello({ ...createFakeExternalHello(), extra: true }), hasCode("protocol-invalid"));
  assert.throws(() => validateHello({ ...createFakeExternalHello(), schemaVersion: 2 }), hasCode("version-unsupported"));
  assert.throws(() => validateTurnRequest({ ...request(), requestId: "\u0000invalid" }), hasCode("protocol-invalid"));
  assert.throws(() => validateCancel({ schemaVersion: 1, messageType: "turn.cancel", requestId: "1", runId: "1", turnId: "1", reason: "unknown" }), hasCode("protocol-invalid"));
  for (const deadlineAt of ["2026-10-07Z", "2026-02-30T00:00:00Z", "2026-10-07T25:00:00Z", "2026-10-07T00:00:00+00:00"]) {
    assert.throws(() => validateTurnRequest({ ...request(), deadlineAt }), hasCode("protocol-invalid"));
  }
  assert.doesNotThrow(() => validateTurnRequest({ ...request(), deadlineAt: "2026-10-07T00:00:00Z" }));
});

test("JSON boundary rejects non-data objects, accessors, sparse arrays and cycles", () => {
  let accessed = false;
  const accessor = { get secret() { accessed = true; return 1; } };
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const value of [undefined, () => {}, 1n, NaN, Infinity, new Date(), new Map(), new Set(),
    accessor, { toJSON: () => ({}) }, [undefined], Array(2), cycle,
    Object.defineProperty({}, "hidden", { value: 1 }), { [Symbol("hidden")]: 1 }]) {
    assert.throws(() => snapshotExternalJson(value), hasCode("protocol-invalid"));
  }
  assert.equal(accessed, false);
  const protoKey = JSON.parse('{"__proto__":{"x":1}}');
  const copy = snapshotExternalJson(protoKey);
  assert.deepEqual(copy, protoKey);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
});

test("bounded JSON rejects bytes, depth, nodes, strings and collection overflows", () => {
  let nested: unknown = 0;
  for (let i = 0; i <= LIMITS.maxJsonDepth; i++) nested = { nested };
  const nodes = Array.from({ length: 800 }, () => [1, 2, 3, 4, 5]);
  for (const value of [nested, nodes, "x".repeat(LIMITS.maxStringLength + 1), Array(LIMITS.maxArrayLength + 1).fill(0)]) {
    assert.throws(() => snapshotExternalJson(value), hasCode("protocol-invalid"));
  }
  assert.throws(() => decodeExternalMessage("x".repeat(LIMITS.maxMessageBytes + 1)), hasCode("protocol-invalid"));
  assert.throws(() => decodeExternalMessage("{broken}"), hasCode("protocol-invalid"));
  assert.throws(() => decodeExternalMessage({}), hasCode("protocol-invalid"));
  assert.throws(() => validateTurnResponse({ ...createDecisionResponse(request(), { kind: "message", text: "ok" }),
    extra: Array(50).fill("中".repeat(4096)) }), hasCode("protocol-invalid"));
  const limits = { ...createFakeExternalHello().limits, maxRequestBytes: 20 };
  assert.throws(() => validateTurnRequest(request(), limits), hasCode("protocol-invalid"));
  const largeContent = Array(8).fill("中".repeat(1024));
  assert.throws(() => validateTurnRequest({ ...request(), context: { items: [{ ...request().context.items[0], content: largeContent }] } }), hasCode("protocol-invalid"));
});

test("projection preserves real capability schemas and fails rather than substituting null", () => {
  const turn = request();
  assert.deepEqual(turn.tools[0]?.inputSchema, { type: "object", properties: {}, additionalProperties: false });
  for (const inputSchema of [() => {}, { $ref: "https://example.invalid/schema" }, { type: "invalid" }]) {
    assert.throws(() => projectTurnRequest({ ...providerRequest, toolset: { ...providerRequest.toolset,
      toolDescriptors: [{ ...providerRequest.toolset.toolDescriptors[0]!, inputSchema }] } }, turn.pluginId, turn.deadlineAt, "request"), hasCode("protocol-invalid"));
  }
  assert.throws(() => projectTurnRequest({ ...providerRequest, context: { ...providerRequest.context,
    contextItems: [{ ...providerRequest.context.contextItems[0]!, content: { fn: () => {} } }] } }, turn.pluginId, turn.deadlineAt, "request"), hasCode("protocol-invalid"));
  const zero = projectTurnRequest({ ...providerRequest, toolset: { ...providerRequest.toolset, maxCalls: 0 } }, turn.pluginId, turn.deadlineAt, "request");
  assert.equal(zero.maxToolCalls, 0);
});

test("decision schemas reject forged cancellation, duplicates and nested unknown fields", () => {
  const response = createDecisionResponse(request(), { kind: "message", text: "ok" });
  const call = { callId: "call-1", capabilityId: "score.read-summary", contractVersion: 1, input: {} };
  for (const decision of [
    { kind: "finish", reason: "cancelled", text: null }, { kind: "message", text: "   " },
    { kind: "tool-calls", calls: [] }, { kind: "tool-calls", calls: [call, call] },
    { kind: "tool-calls", calls: [{ ...call, extra: true }] }, { kind: "tool-calls", calls: [{ ...call, contractVersion: 0 }] },
  ]) assert.throws(() => validateTurnResponse({ ...response, result: { kind: "decision", decision } }), hasCode("decision-invalid"));
  assert.throws(() => validateTurnResponse({ ...response, result: { kind: "error", error: { code: "unknown", message: "bad", retryable: true } } }), hasCode("protocol-invalid"));
  assert.throws(() => createDecisionResponse(request(), { kind: "tool-calls", calls: [{ ...call, input: () => {} }] }), hasCode("protocol-invalid"));
});
