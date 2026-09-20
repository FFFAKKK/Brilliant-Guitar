import assert from "node:assert/strict";
import test from "node:test";

import { ScoreReadClient } from "../src/services/score-read-port.ts";
import { TauriWorkbenchHostBridge } from "../src/services/workbench-host-bridge.ts";
import { DirectScoreReadAgentPort } from "../src/agent/direct-score-read-agent-port.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";

test("ScoreReadPort uses typed host commands instead of the generic capability RPC", async () => {
  const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
  const invoke = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args: args ?? {} });
    if (command === "workbench_score_read_summary_v1") {
      return { documentId: "score-1", documentVersion: 2, title: "概要", measureCount: 3 } as T;
    }
    if (command === "workbench_score_read_measure_range_v1") {
      return {
        documentId: "score-1", documentVersion: 2, startMeasureId: "m-1", endMeasureId: "m-1",
        measureCount: 1, measures: [{ measureId: "m-1", meter: { numerator: 4, denominator: 4 }, pickupDuration: null }],
      } as T;
    }
    throw new Error(`unexpected command ${command}`);
  };
  const reads = new ScoreReadClient(new TauriWorkbenchHostBridge(invoke), workspaceId);

  const summary = await reads.readSummary();
  const range = await reads.readMeasureRange({ startMeasureId: "m-1", endMeasureId: "m-1", maxMeasures: 1 });
  assert.equal(summary.status, "ready");
  assert.equal(range.status, "ready");
  assert.deepEqual(calls, [
    { command: "workbench_score_read_summary_v1", args: { workspaceId } },
    {
      command: "workbench_score_read_measure_range_v1",
      args: { workspaceId, startMeasureId: "m-1", endMeasureId: "m-1", maxMeasures: 1 },
    },
  ]);
  assert.equal(calls.some(({ command }) => command === "workbench_invoke_capability_v1"), false);
});

test("ScoreReadPort keeps an empty session as an explicit unavailable result", async () => {
  const reads = new ScoreReadClient({
    async readScoreSummary() { return null; },
  }, workspaceId);
  const result = await reads.readSummary();
  assert.deepEqual(result, {
    status: "unavailable",
    code: "score.session-unavailable",
    message: "当前工作区没有可读取的乐谱会话",
  });
});

test("Direct score tool adapter prefers the typed port and preserves Agent invocation identity", async () => {
  const invocationId = crypto.randomUUID();
  const adapter = new DirectScoreReadAgentPort({
    async invoke() { throw new Error("legacy gateway must not be used"); },
  }, {
    scoreReadPort: () => ({
      async readSummary() {
        return { status: "ready", data: { documentId: "score-1", documentVersion: 3, title: "直读", measureCount: 1 } };
      },
      async readMetadata() { return { status: "unavailable", code: "unused", message: "unused" }; },
      async readStructure() { return { status: "unavailable", code: "unused", message: "unused" }; },
      async readMeasureIndex() { return { status: "unavailable", code: "unused", message: "unused" }; },
      async readMeasureRange() { return { status: "unavailable", code: "unused", message: "unused" }; },
    }),
    async readScoreMeasureIndex() { throw new Error("legacy index must not be used"); },
    async readScoreMeasureRange() { throw new Error("legacy range must not be used"); },
  });

  const result = await adapter.invoke({
    invocationId,
    capabilityId: "score.read-summary",
    contractVersion: 1,
    workspaceId,
    documentPrecondition: null,
    input: {},
  });
  assert.equal(result.status, "completed");
  assert.equal(result.invocationId, invocationId);
  if (result.status === "completed") assert.equal((result.data as { title: string }).title, "直读");
});
