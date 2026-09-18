import assert from "node:assert/strict";
import test from "node:test";

import { BrowserWorkbenchHostBridge, TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { ScoreCapabilityClient } from "../src/services/score-capability-client.ts";

test("score capability client uses the versioned Tauri gateway without exposing caller identity", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, ...(args ? { args } : {}) });
    const request = args?.request as Record<string, unknown>;
    return {
      status: "completed",
      invocationId: request.invocationId,
      capabilityId: request.capabilityId,
      contractVersion: request.contractVersion,
      data: { documentId: "score-1", documentVersion: 4, title: "能力概要", measureCount: 8 },
    } as T;
  };
  const client = new ScoreCapabilityClient(
    new TauriWorkbenchHostBridge(invoke),
    "11111111-1111-4111-8111-111111111111",
  );

  const result = await client.readSummary();
  assert.equal(result.status, "completed");
  if (result.status === "completed") assert.equal(result.data.measureCount, 8);
  assert.equal(calls[0]?.command, "workbench_invoke_capability_v1");
  const request = calls[0]?.args?.request as Record<string, unknown>;
  assert.equal(request.capabilityId, "score.read-summary");
  assert.equal(request.contractVersion, 1);
  assert.deepEqual(request.input, {});
  assert.equal("caller" in request, false);
});

test("browser development host reports capability unavailability instead of fabricating a summary", async () => {
  const client = new ScoreCapabilityClient(
    new BrowserWorkbenchHostBridge(),
    "11111111-1111-4111-8111-111111111111",
  );
  const result = await client.readSummary();
  if (result.status === "completed") assert.fail("browser host must not fabricate a score summary");
  assert.equal(result.code, "capability.host-unsupported");
});

test("score capability client rejects malformed or mismatched gateway output", async () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  await assert.rejects(
    new ScoreCapabilityClient({ async invokeCapability() { return { status: "completed" }; } }, workspaceId)
      .readSummary(),
    /能力调用结果无效/,
  );
  await assert.rejects(
    new ScoreCapabilityClient({ async invokeCapability(request) { return {
      status: "completed", invocationId: crypto.randomUUID(), capabilityId: request.capabilityId,
      contractVersion: request.contractVersion,
      data: { documentId: "score-1", documentVersion: 0, title: "x", measureCount: 1 },
    }; } }, workspaceId).readSummary(),
    /能力调用结果与请求不匹配/,
  );
});
