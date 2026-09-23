import assert from "node:assert/strict";
import test from "node:test";

import { ScoreReadClient } from "../src/services/score-read-port.ts";
import { TauriWorkbenchHostBridge, WorkbenchRequestError } from "../src/services/workbench-host-bridge.ts";
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

test("ScoreReadPort rejects a document-scoped summary outside the requested document", async () => {
  const reads = new ScoreReadClient({
    async readScoreSummary() {
      return { documentId: "other-score", documentVersion: 99, title: "另一份作品", measureCount: 1 };
    },
  }, workspaceId);

  await assert.rejects(
    reads.readSummary({ documentId: "score-1", documentVersion: 7 }),
    /乐谱读取结果与请求文档不匹配/,
  );
});

test("ScoreReadPort rejects invalid bounded-read input before calling the host", async () => {
  let hostCalls = 0;
  const reads = new ScoreReadClient({
    async readScoreMeasureIndex() { hostCalls += 1; return null; },
    async readScoreMeasureRange() { hostCalls += 1; return null; },
  }, workspaceId);

  await assert.rejects(
    reads.readMeasureIndex({ expectedDocumentId: "", expectedDocumentVersion: -1 }),
    /小节索引读取请求无效/,
  );
  await assert.rejects(
    reads.readMeasureRange({ startMeasureId: "m-1", endMeasureId: "m-2", maxMeasures: 33 }),
    /小节范围读取请求无效/,
  );
  assert.equal(hostCalls, 0);
});

test("ScoreReadPort accepts an index for the requested document and version", async () => {
  const input = { expectedDocumentId: "score-1", expectedDocumentVersion: 7 };
  const index = { documentId: "score-1", documentVersion: 7, measureIds: ["m-1", "m-2"] };
  const reads = new ScoreReadClient({
    async readScoreMeasureIndex(boundWorkspaceId, forwarded) {
      assert.equal(boundWorkspaceId, workspaceId);
      assert.deepEqual(forwarded, input);
      return index;
    },
  }, workspaceId);

  assert.deepEqual(await reads.readMeasureIndex(input), { status: "ready", data: index });
});

for (const mismatch of [{ documentId: "other-score" }, { documentVersion: 8 }]) {
  test(`ScoreReadPort rejects an index with mismatched ${Object.keys(mismatch)[0]}`, async () => {
    const reads = new ScoreReadClient({
      async readScoreMeasureIndex() {
        return { documentId: "score-1", documentVersion: 7, measureIds: ["m-1"], ...mismatch };
      },
    }, workspaceId);

    await assert.rejects(
      reads.readMeasureIndex({ expectedDocumentId: "score-1", expectedDocumentVersion: 7 }),
      /小节索引读取结果与请求不匹配/,
    );
  });
}

for (const count of [1, 32]) {
  test(`ScoreReadPort accepts a matching range at the ${count}-measure budget`, async () => {
    const ids = Array.from({ length: count }, (_, index) => `m-${index + 1}`);
    const range = {
      documentId: "score-1", documentVersion: 7, startMeasureId: "m-1", endMeasureId: `m-${count}`,
      measureCount: count,
      measures: ids.map((measureId) => ({
        measureId, meter: { numerator: 4, denominator: 4 }, pickupDuration: null,
      })),
    };
    const input = { startMeasureId: "m-1", endMeasureId: `m-${count}`, maxMeasures: count };
    const reads = new ScoreReadClient({
      async readScoreMeasureRange(boundWorkspaceId, forwarded) {
        assert.equal(boundWorkspaceId, workspaceId);
        assert.deepEqual(forwarded, input);
        return range;
      },
    }, workspaceId);

    assert.deepEqual(await reads.readMeasureRange(input), { status: "ready", data: range });
  });
}

for (const scenario of [
  { name: "startMeasureId", ids: ["m-2", "m-3"], maxMeasures: 3 },
  { name: "endMeasureId", ids: ["m-1", "m-2"], maxMeasures: 3 },
  { name: "maxMeasures", ids: ["m-1", "m-2", "m-3"], maxMeasures: 2 },
]) {
  test(`ScoreReadPort rejects a range violating the requested ${scenario.name}`, async () => {
    const reads = new ScoreReadClient({
      async readScoreMeasureRange() {
        return {
          documentId: "score-1", documentVersion: 7,
          startMeasureId: scenario.ids[0], endMeasureId: scenario.ids.at(-1),
          measureCount: scenario.ids.length,
          measures: scenario.ids.map((measureId) => ({
            measureId, meter: { numerator: 4, denominator: 4 }, pickupDuration: null,
          })),
        };
      },
    }, workspaceId);

    await assert.rejects(
      reads.readMeasureRange({ startMeasureId: "m-1", endMeasureId: "m-3", maxMeasures: scenario.maxMeasures }),
      /小节范围读取结果与请求不匹配/,
    );
  });
}

for (const scenario of [
  { name: "empty session", error: null, status: "unavailable", code: "score.session-unavailable" },
  { name: "retryable error", error: new WorkbenchRequestError("unavailable", 503), status: "unavailable", code: "score.read-failed" },
  { name: "definite error", error: new WorkbenchRequestError("stale", 409), status: "failed", code: "score.read-failed" },
]) {
  test(`ScoreReadPort preserves bounded-read ${scenario.name} results`, async () => {
    const respond = async () => {
      if (scenario.error !== null) throw scenario.error;
      return null;
    };
    const reads = new ScoreReadClient({
      readScoreMeasureIndex: respond,
      readScoreMeasureRange: respond,
    }, workspaceId);
    const results = [
      await reads.readMeasureIndex({ expectedDocumentId: "score-1", expectedDocumentVersion: 7 }),
      await reads.readMeasureRange({ startMeasureId: "m-1", endMeasureId: "m-1", maxMeasures: 1 }),
    ];

    for (const result of results) {
      assert.equal(result.status, scenario.status);
      assert.notEqual(result.status, "ready");
      if (result.status !== "ready") assert.equal(result.code, scenario.code);
    }
  });
}

test("Direct score tool adapter prefers the typed port and preserves Agent invocation identity", async () => {
  const invocationId = crypto.randomUUID();
  const adapter = new DirectScoreReadAgentPort({
    async invoke() { throw new Error("legacy gateway must not be used"); },
  }, {
    async readSummary() {
      return { status: "ready", data: { documentId: "score-1", documentVersion: 3, title: "直读", measureCount: 1 } };
    },
    async readMetadata() { throw new Error("metadata read must not be used"); },
    async readStructure() { throw new Error("structure read must not be used"); },
    async readMeasureIndex() { throw new Error("index read must not be used"); },
    async readMeasureRange() { throw new Error("range read must not be used"); },
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

test("Direct score tool adapter rejects a result outside the Agent document scope", async () => {
  const reads = new ScoreReadClient({
    async readScoreSummary() {
      return { documentId: "other-score", documentVersion: 99, title: "另一份作品", measureCount: 1 };
    },
  }, workspaceId);
  const adapter = new DirectScoreReadAgentPort({
    async invoke() { throw new Error("fallback must not be used"); },
  }, reads);

  await assert.rejects(
    adapter.invoke({
      invocationId: "inv-summary",
      capabilityId: "score.read-summary",
      contractVersion: 1,
      workspaceId,
      documentPrecondition: { documentId: "score-1", documentVersion: 7 },
      input: {},
    }, {
      workspace: {
        workspaceId,
        documentId: "score-1",
        documentVersion: 7,
        selection: null,
      },
      rangeBudget: 32,
    }),
    /Score read outcome is unknown/,
  );
});
