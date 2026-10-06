/// <reference path="../src/agent/pi/modelcontextprotocol-sdk-shim.d.ts" />

import assert from "node:assert/strict";
import test from "node:test";

import type { CapabilityTransportRequest } from "../src/contracts/capability.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { runPiAgent } from "../src/agent/pi/legacy/adapter.ts";
import { createScoreSummaryFakeStream } from "../src/agent/pi/fake-stream.ts";
import type { PiAgentEvent } from "../src/agent/pi/legacy/types.ts";
import { ApplicationCapabilityGateway } from "../src/services/application-capability-gateway.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { SCORE_APPLICATION_PLUGIN } from "../src/plugins/score-application-plugin.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

const workspace = {
  workspaceId: "workspace-1",
  documentId: "score-1",
  documentVersion: 7,
  selection: null,
} as const;

function createCapabilities(measureCount: number, failure?: { code: string; message: string }) {
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [] });
  platform.register(SCORE_APPLICATION_PLUGIN);
  platform.start();
  const transport = {
    invokeCapability: async (_request: CapabilityTransportRequest): Promise<unknown> => null,
    invokeAgentCapability: async (request: CapabilityTransportRequest): Promise<unknown> => failure
      ? {
          status: "failed" as const,
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          code: failure.code,
          message: failure.message,
        }
      : {
          status: "completed" as const,
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 7,
            title: "测试乐谱",
            measureCount,
          },
        },
  };
  const gateway = new ApplicationCapabilityGateway(platform.applicationCapabilities(), transport);
  return new WorkbenchAgentCapabilityPort(gateway.forCaller("agent"));
}

function eventTypes(events: readonly PiAgentEvent[]): readonly string[] {
  return events.map((event) => event.type);
}

test("Pi Adapter completes a real score.read-summary tool loop", async () => {
  const stream = createScoreSummaryFakeStream();
  const result = await runPiAgent({
    runId: "run-success",
    goal: "告诉我当前乐谱有多少小节",
    workspace,
    capabilities: createCapabilities(12),
    model: stream.model,
    streamFn: stream.streamFn,
  });

  assert.equal(result.status, "completed");
  assert.equal(result.answer, "当前乐谱共有 12 个小节。");
  assert.equal(stream.callCount(), 2);
  assert.deepEqual(eventTypes(result.events), [
    "run.started",
    "tool.started",
    "tool.finished",
    "assistant.completed",
    "run.finished",
  ]);
  assert.equal(result.events.at(-1)?.type, "run.finished");
});

test("the final answer changes with the real score summary", async () => {
  const firstStream = createScoreSummaryFakeStream();
  const secondStream = createScoreSummaryFakeStream();
  const common = {
    runId: "run-dynamic",
    goal: "读取小节数量",
    workspace,
  } as const;
  const first = await runPiAgent({
    ...common,
    capabilities: createCapabilities(3),
    model: firstStream.model,
    streamFn: firstStream.streamFn,
  });
  const second = await runPiAgent({
    ...common,
    capabilities: createCapabilities(21),
    model: secondStream.model,
    streamFn: secondStream.streamFn,
  });

  assert.equal(first.answer, "当前乐谱共有 3 个小节。");
  assert.equal(second.answer, "当前乐谱共有 21 个小节。");
});

test("a capability failure ends the run as failed without an assistant answer", async () => {
  const stream = createScoreSummaryFakeStream();
  const result = await runPiAgent({
    runId: "run-failed",
    goal: "读取乐谱概要",
    workspace,
    capabilities: createCapabilities(12, { code: "score-unavailable", message: "乐谱读取失败" }),
    model: stream.model,
    streamFn: stream.streamFn,
  });

  assert.equal(result.status, "failed");
  assert.equal(result.answer, undefined);
  assert.equal(result.error?.code, "score-unavailable");
  assert.equal(stream.callCount(), 1);
  assert.deepEqual(eventTypes(result.events), ["run.started", "tool.started", "tool.finished", "run.finished"]);
});

test("aborting after the tool prevents the next model request", async () => {
  const stream = createScoreSummaryFakeStream();
  const controller = new AbortController();
  const result = await runPiAgent({
    runId: "run-aborted",
    goal: "读取乐谱概要",
    workspace,
    capabilities: createCapabilities(12),
    model: stream.model,
    streamFn: stream.streamFn,
    signal: controller.signal,
    onEvent: (event) => {
      if (event.type === "tool.finished") controller.abort();
    },
  });

  assert.equal(result.status, "aborted");
  assert.equal(result.answer, undefined);
  assert.equal(stream.callCount(), 1);
  assert.deepEqual(eventTypes(result.events), ["run.started", "tool.started", "tool.finished", "run.finished"]);
  assert.equal(result.events.at(-1)?.type, "run.finished");
});

test("invalid input is rejected before Pi starts", async () => {
  const stream = createScoreSummaryFakeStream();
  await assert.rejects(
    runPiAgent({
      runId: " ",
      goal: "读取乐谱概要",
      workspace,
      capabilities: createCapabilities(12),
      model: stream.model,
      streamFn: stream.streamFn,
    }),
    /runId must not be empty/,
  );
});
