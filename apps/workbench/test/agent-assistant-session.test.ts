import assert from "node:assert/strict";
import test from "node:test";

import { AgentAssistantSession } from "../src/agent/agent-assistant-session.ts";
import type { AgentAssistantRuntimePort } from "../src/agent/agent-assistant-session.ts";
import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
import type { AgentRunStorePort } from "../src/agent/agent-store.ts";
import type { AgentPluginRunLease, AgentPluginRuntimeSnapshot } from "../src/agent/agent-plugin-runtime.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import type { AgentProviderPort } from "../src/agent/provider.ts";

const readyRuntimeSnapshot: AgentPluginRuntimeSnapshot = {
  enabled: true,
  status: "ready",
  provider: { status: "ready", providerId: "provider.test", model: "model-1", message: "Provider ready" },
  recovery: { status: "ready", items: [], message: "没有需要处理的 Agent 恢复任务" },
  canStartRun: true,
  message: "Agent 已就绪",
};

class FakeRuntime implements AgentAssistantRuntimePort {
  readonly provider: AgentProviderPort;
  readonly snapshot: AgentPluginRuntimeSnapshot;
  refreshCalls = 0;
  beginCalls = 0;
  continuationCalls = 0;
  releaseCalls = 0;
  cancelCalls = 0;

  constructor(provider: AgentProviderPort, snapshot = readyRuntimeSnapshot) {
    this.provider = provider;
    this.snapshot = snapshot;
  }

  getSnapshot = () => this.snapshot;

  beginRun = (): AgentPluginRunLease | null => {
    this.beginCalls += 1;
    if (!this.snapshot.canStartRun) return null;
    const controller = new AbortController();
    return {
      provider: this.provider,
      signal: controller.signal,
      cancel: () => { this.cancelCalls += 1; controller.abort(); },
      release: () => { this.releaseCalls += 1; },
    };
  };

  beginContinuation = (): AgentPluginRunLease | null => {
    this.continuationCalls += 1;
    const controller = new AbortController();
    return {
      provider: this.provider,
      signal: controller.signal,
      cancel: () => { this.cancelCalls += 1; controller.abort(); },
      release: () => { this.releaseCalls += 1; },
    };
  };

  async refresh(): Promise<void> { this.refreshCalls += 1; }
}

const workspace = {
  workspaceId: "workspace-1",
  documentId: "score-1",
  documentVersion: 7,
  selection: null,
};

test("assistant session composes Provider, controller, capability and durable store", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-summary",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      events: [
        { type: "response.started" },
        { type: "response.text-delta", delta: "《练习曲》共有 " },
        { type: "response.text-delta", delta: "32 小节。" },
        { type: "response.completed" },
      ],
      decision: { kind: "finish", reason: "completed", text: "《练习曲》共有 32 小节。" },
    },
  ]);
  const runtime = new FakeRuntime(provider);
  const store = new InMemoryAgentRunStore();
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-ui-summary",
    createConversationId: () => "conversation-ui-summary",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    }),
  });

  assert.equal(await session.start("读取当前乐谱概要", workspace), true);

  const snapshot = session.getSnapshot();
  assert.equal(snapshot.status, "completed");
  assert.equal(snapshot.runId, "run-ui-summary");
  assert.equal(snapshot.goal, "读取当前乐谱概要");
  assert.equal(snapshot.response, "《练习曲》共有 32 小节。");
  assert.equal(snapshot.message, "任务已完成并通过验证");
  assert.equal(snapshot.conversation.conversationId, "conversation-ui-summary");
  assert.deepEqual(snapshot.conversation.messages.map(({ role, status, content }) => ({ role, status, content })), [
    { role: "user", status: "completed", content: "读取当前乐谱概要" },
    { role: "assistant", status: "completed", content: "《练习曲》共有 32 小节。" },
  ]);
  assert.equal(snapshot.conversation.activities.length, 4);
  assert.equal(snapshot.conversation.activities.every((activity) => activity.status === "completed"), true);
  assert.equal(snapshot.conversation.activeSubmissionId, null);
  assert.equal(runtime.beginCalls, 1);
  assert.equal(runtime.releaseCalls, 1);
  assert.equal(provider.exhausted, true);
  assert.equal((await store.load("run-ui-summary"))?.run.state.lifecycle, "terminal");
});

test("assistant session routes metadata questions to the metadata capability", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-metadata"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-metadata",
        capabilityId: "score.read-metadata",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-metadata"], contextSourceIds: ["score.read-metadata"] },
      decision: { kind: "finish", reason: "completed", text: "《练习曲》的速度是 120 BPM。" },
    },
  ]);
  const session = new AgentAssistantSession({
    runtime: new FakeRuntime(provider),
    store: new InMemoryAgentRunStore(),
    createRunId: () => "run-ui-metadata",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 7,
            title: "练习曲",
            authors: ["Brilliant"],
            tempoBpm: 120,
          },
        };
      },
    }),
  });

  assert.equal(await session.start("读取当前乐谱的元数据", workspace), true);
  assert.equal(session.getSnapshot().response, "《练习曲》的速度是 120 BPM。");
  assert.equal(provider.exhausted, true);
});

test("assistant session routes structure questions to the structure capability", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-structure"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-structure",
        capabilityId: "score.read-structure",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-structure"], contextSourceIds: ["score.read-structure"] },
      decision: { kind: "finish", reason: "completed", text: "当前乐谱有 32 小节、2 个声部和 2 个谱表。" },
    },
  ]);
  const session = new AgentAssistantSession({
    runtime: new FakeRuntime(provider),
    store: new InMemoryAgentRunStore(),
    createRunId: () => "run-ui-structure",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 7,
            measureCount: 32,
            partCount: 2,
            staffCount: 2,
          },
        };
      },
    }),
  });

  assert.equal(await session.start("读取当前乐谱的声部和谱表结构", workspace), true);
  assert.equal(session.getSnapshot().response, "当前乐谱有 32 小节、2 个声部和 2 个谱表。");
  assert.equal(provider.exhausted, true);
});

test("assistant session routes ordinal measure reads with a control-plane range budget", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-measures",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        input: { reference: { kind: "ordinal-range", startOrdinal: 2, endOrdinal: 4 } },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: ["score.read-measures"] },
      decision: { kind: "finish", reason: "completed", text: "已读取第 2 到第 4 小节。" },
    },
  ]);
  const session = new AgentAssistantSession({
    runtime: new FakeRuntime(provider),
    store: new InMemoryAgentRunStore(),
    createRunId: () => "run-ui-measures",
    capabilities: {
      async invoke(request, context) {
        assert.equal(context?.rangeBudget, 32);
        assert.equal(context?.workspace.documentVersion, 7);
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 7,
            startMeasureId: "measure-2",
            endMeasureId: "measure-4",
            measureCount: 3,
            measures: ["measure-2", "measure-3", "measure-4"].map((measureId) => ({
              measureId,
              meter: { numerator: 4, denominator: 4 },
              pickupDuration: null,
            })),
          },
        };
      },
    },
  });

  assert.equal(await session.start("读取第 2 到第 4 小节", workspace), true);
  assert.equal(session.getSnapshot().response, "已读取第 2 到第 4 小节。");
  assert.equal(provider.exhausted, true);
});

test("assistant session keeps one submission while waiting for and continuing with a measure selection", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-current-selection-before",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        input: { reference: { kind: "current-selection" } },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-current-selection-after",
        capabilityId: "score.read-measures",
        contractVersion: 1,
        input: { reference: { kind: "current-selection" } },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-measures"], contextSourceIds: ["score.read-measures"] },
      decision: { kind: "finish", reason: "completed", text: "已读取当前选择。" },
    },
  ]);
  const runtime = new FakeRuntime(provider);
  const store = new InMemoryAgentRunStore();
  const selections: unknown[] = [];
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-selection-resume",
    createConversationId: () => "conversation-selection-resume",
    capabilities: {
      async invoke(capabilityRequest, context) {
        selections.push(context?.workspace.selection ?? null);
        if (context?.workspace.selection === null) return {
          status: "rejected",
          invocationId: capabilityRequest.invocationId,
          capabilityId: capabilityRequest.capabilityId,
          contractVersion: capabilityRequest.contractVersion,
          code: "selection-unavailable",
          message: "当前没有可用于任务的小节选择区",
        };
        return {
          status: "completed",
          invocationId: capabilityRequest.invocationId,
          capabilityId: capabilityRequest.capabilityId,
          contractVersion: capabilityRequest.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 8,
            startMeasureId: "measure-2",
            endMeasureId: "measure-2",
            measureCount: 1,
            measures: [{
              measureId: "measure-2",
              meter: { numerator: 4, denominator: 4 },
              pickupDuration: null,
            }],
          },
        };
      },
    },
  });

  assert.equal(await session.start("读取当前选中的小节", workspace), false);
  const waiting = session.getSnapshot();
  assert.equal(waiting.status, "waiting");
  assert.equal(waiting.runId, "run-selection-resume");
  assert.equal(waiting.requiredInput?.kind, "measure-selection");
  assert.equal(waiting.requiredInput?.constraints.documentId, "score-1");
  assert.equal(waiting.requiredInput?.sourceInvocationId.length > 0, true);
  assert.equal(waiting.conversation.activeRunId, "run-selection-resume");
  assert.equal(waiting.conversation.messages.length, 2);
  assert.equal(waiting.conversation.activities.some((activity) => activity.status === "waiting"), true);

  const selectedWorkspace = {
    ...workspace,
    documentVersion: 8,
    selection: {
      kind: "measure-range" as const,
      documentId: "score-1",
      documentVersion: 8,
      startMeasureId: "measure-2",
      endMeasureId: "measure-2",
    },
  };
  assert.equal(await session.provideRequiredInput(
    "run-selection-resume",
    "stale-input-request",
    selectedWorkspace,
  ), false);
  assert.equal(runtime.continuationCalls, 0);
  assert.ok(waiting.requiredInput);
  assert.equal(await session.provideRequiredInput(
    "run-selection-resume",
    waiting.requiredInput.requestId,
    selectedWorkspace,
  ), true);

  const completed = session.getSnapshot();
  assert.equal(completed.status, "completed");
  assert.equal(completed.runId, "run-selection-resume");
  assert.equal(completed.requiredInput, null);
  assert.equal(completed.response, "已读取当前选择。");
  assert.equal(completed.conversation.messages.length, 2);
  assert.equal(completed.conversation.activeRunId, null);
  assert.equal(completed.conversation.activities.every((activity) => activity.status === "completed"), true);
  assert.deepEqual(selections, [null, selectedWorkspace.selection]);
  assert.equal(runtime.beginCalls, 1);
  assert.equal(runtime.continuationCalls, 1);
  assert.equal(runtime.releaseCalls, 2);
  assert.equal((await store.load("run-selection-resume"))?.run.events.filter(
    (event) => event.event.type === "run.created",
  ).length, 1);
  assert.equal(provider.exhausted, true);
});

test("assistant session asks for clarification before starting a conflicting read task", async () => {
  const provider: AgentProviderPort = {
    async decide() {
      throw new Error("ambiguous tasks must not reach the provider");
    },
  };
  const runtime = new FakeRuntime(provider);
  const session = new AgentAssistantSession({
    runtime,
    store: new InMemoryAgentRunStore(),
    capabilities: { async invoke() { throw new Error("ambiguous tasks must not invoke a capability"); } },
  });

  assert.equal(await session.start("读取标题和声部", workspace), false);
  assert.equal(runtime.beginCalls, 0);
  assert.equal(session.getSnapshot().status, "idle");
  assert.equal(session.getSnapshot().goal, "读取标题和声部");
  assert.equal(session.getSnapshot().message, "这个任务同时涉及标题、作者和速度等元数据和声部、谱表和结构信息。请明确你想先读取哪一类信息。");
});

test("assistant session projects completed task summaries into the next run only", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-first",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
      decision: { kind: "finish", reason: "completed", text: "第一次读取完成" },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["submission:run-history-1"] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-second",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.read-summary"],
        contextSourceIds: ["submission:run-history-1", "score.read-summary"],
      },
      decision: { kind: "finish", reason: "completed", text: "第二次读取完成" },
    },
  ]);
  const runIds = ["run-history-1", "run-history-2"];
  const session = new AgentAssistantSession({
    runtime: new FakeRuntime(provider),
    store: new InMemoryAgentRunStore(),
    createRunId: () => runIds.shift() ?? "unexpected-run",
    createConversationId: () => "conversation-history",
    now: () => 100,
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    }),
  });

  assert.equal(await session.start("第一次读取", workspace), true);
  assert.equal(await session.start("结合上次结果再次读取", workspace), true);

  assert.equal(provider.requests[0]?.context.contextItems.some((item) => item.kind === "task-history"), false);
  const history = provider.requests[2]?.context.contextItems.find((item) => item.kind === "task-history");
  assert.equal(history?.sourceId, "submission:run-history-1");
  assert.deepEqual(history?.content, {
    runId: "run-history-1",
    goal: "第一次读取",
    outcome: "completed",
    response: "第一次读取完成",
    failureCode: null,
  });
  assert.equal(provider.exhausted, true);
});

test("assistant session carries failed runs forward without their draft response", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: { kind: "finish", reason: "failed", text: "不稳定草稿不应进入历史" },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["submission:run-failed-1"] },
      decision: { kind: "tool-calls", calls: [{
        callId: "read-after-failure",
        capabilityId: "score.read-summary",
        contractVersion: 1,
        input: {},
      }] },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.read-summary"],
        contextSourceIds: ["submission:run-failed-1", "score.read-summary"],
      },
      decision: { kind: "finish", reason: "completed", text: "恢复后完成" },
    },
  ]);
  const runIds = ["run-failed-1", "run-after-failure"];
  const session = new AgentAssistantSession({
    runtime: new FakeRuntime(provider),
    store: new InMemoryAgentRunStore(),
    createRunId: () => runIds.shift() ?? "unexpected-run",
    now: () => 200,
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 7, title: "练习曲", measureCount: 32 },
        };
      },
    }),
  });

  assert.equal(await session.start("第一次失败", workspace), false);
  assert.equal(await session.start("失败后重试", workspace), true);

  const history = provider.requests[1]?.context.contextItems.find((item) => item.kind === "task-history");
  assert.deepEqual(history?.content, {
    runId: "run-failed-1",
    goal: "第一次失败",
    outcome: "failed",
    response: null,
    failureCode: "completion-rejected",
  });
  assert.equal(JSON.stringify(history).includes("不稳定草稿"), false);
  assert.equal(provider.exhausted, true);
});

test("assistant session refuses a run until runtime and document prerequisites are ready", async () => {
  const runtime = new FakeRuntime({ async decide() { throw new Error("must not run"); } }, {
    ...readyRuntimeSnapshot,
    status: "configuring",
    canStartRun: false,
    message: "需要配置模型 Provider",
  });
  const session = new AgentAssistantSession({
    runtime,
    store: new InMemoryAgentRunStore(),
    capabilities: { async invoke() { throw new Error("must not invoke"); } },
  });

  assert.equal(await session.start("读取当前乐谱概要", workspace), false);
  assert.equal(session.getSnapshot().message, "需要配置模型 Provider");
  assert.equal(runtime.beginCalls, 1);
});

test("assistant cancellation aborts the same leased Provider turn", async () => {
  const provider: AgentProviderPort = {
    decide(_request, signal) {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
      });
    },
  };
  const runtime = new FakeRuntime(provider);
  const session = new AgentAssistantSession({
    runtime,
    store: new InMemoryAgentRunStore(),
    createRunId: () => "run-cancel",
    capabilities: { async invoke() { throw new Error("must not invoke"); } },
  });

  const running = session.start("读取当前乐谱概要", workspace);
  await Promise.resolve();
  session.cancel();
  assert.equal(session.getSnapshot().status, "cancelling");
  assert.equal(await running, false);

  assert.equal(session.getSnapshot().status, "cancelled");
  assert.equal(session.getSnapshot().conversation.messages.at(-1)?.status, "cancelled");
  assert.equal(session.getSnapshot().conversation.activeSubmissionId, null);
  assert.equal(runtime.cancelCalls, 1);
  assert.equal(runtime.releaseCalls, 1);
});

test("assistant session does not expose infrastructure error details", async () => {
  const runtime = new FakeRuntime({ async decide() { throw new Error("must not run"); } });
  const store: AgentRunStorePort = {
    async load() { return null; },
    async commit() { throw new Error("secret provider response body"); },
    async listRecoverable() { return []; },
    async quarantine() { return false; },
  };
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-store-failure",
    capabilities: { async invoke() { throw new Error("must not invoke"); } },
  });

  assert.equal(await session.start("读取当前乐谱概要", workspace), false);
  assert.equal(session.getSnapshot().status, "failed");
  assert.equal(session.getSnapshot().message, "Agent 运行服务暂时不可用，请重试");
  assert.equal(session.getSnapshot().message.includes("secret"), false);
  assert.equal(session.getSnapshot().conversation.issue?.code, "agent.infrastructure-unavailable");
  assert.equal(session.getSnapshot().conversation.issue?.message.includes("secret"), false);
  assert.equal(runtime.releaseCalls, 1);
});
