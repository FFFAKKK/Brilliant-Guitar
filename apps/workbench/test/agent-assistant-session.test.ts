import assert from "node:assert/strict";
import test from "node:test";

import { AgentAssistantSession } from "../src/agent/agent-assistant-session.ts";
import type { AgentAssistantRuntimePort } from "../src/agent/agent-assistant-session.ts";
import { InMemoryAgentRunStore } from "../src/agent/agent-store.ts";
import type { AgentRunStorePort } from "../src/agent/agent-store.ts";
import type { AgentPluginRunLease, AgentPluginRuntimeSnapshot } from "../src/agent/agent-plugin-runtime.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import { verifyScoreSummaryCompletion } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import type { AgentProviderPort } from "../src/agent/provider.ts";
import { AgentRunController, getAgentRunRequiredApproval } from "../src/agent/run-controller.ts";
import type { WorkflowDirectory } from "../src/contracts/workflow.ts";

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
  approvalContinuationCalls = 0;
  retryContinuationCalls = 0;
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

  beginApprovalContinuation = (): AgentPluginRunLease | null => {
    this.approvalContinuationCalls += 1;
    const controller = new AbortController();
    return {
      provider: this.provider,
      signal: controller.signal,
      cancel: () => { this.cancelCalls += 1; controller.abort(); },
      release: () => { this.releaseCalls += 1; },
    };
  };

  beginRetryContinuation = (): AgentPluginRunLease | null => {
    this.retryContinuationCalls += 1;
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

const summaryWorkflowDirectory: WorkflowDirectory = {
  get: (id) => id === "score.inspect" ? {
    id: "score.inspect",
    contractVersion: 1,
    name: "检查乐谱",
    description: "读取乐谱信息",
    runtime: "agent-orchestration-v1",
    operationIds: ["score.read-summary"],
    entryOperationIds: ["score.read-summary"],
    ownerPluginId: "brilliant.score",
    ownerPluginVersion: "1.0.0",
  } : undefined,
  list: () => [summaryWorkflowDirectory.get("score.inspect")!],
  listByPlugin: (pluginId) => pluginId === "brilliant.score" ? summaryWorkflowDirectory.list() : [],
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
    workflows: summaryWorkflowDirectory,
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(request) {
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
  const stored = await store.load("run-ui-summary");
  assert.equal(stored?.run.state.lifecycle, "terminal");
  assert.deepEqual(stored?.run.intent.workflow, {
    id: "score.inspect",
    contractVersion: 1,
    ownerPluginId: "brilliant.score",
    ownerPluginVersion: "1.0.0",
  });
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
      async invokeCapability(request) {
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
      async invokeCapability(request) {
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
  const restartedRuntime = new FakeRuntime(provider);
  const restartedSession = new AgentAssistantSession({
    runtime: restartedRuntime,
    store,
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
  assert.equal(await restartedSession.provideRequiredInput(
    "run-selection-resume",
    waiting.requiredInput.requestId,
    selectedWorkspace,
  ), true);

  const completed = restartedSession.getSnapshot();
  assert.equal(completed.status, "completed");
  assert.equal(completed.runId, "run-selection-resume");
  assert.equal(completed.requiredInput, null);
  assert.equal(completed.response, "已读取当前选择。");
  assert.equal(completed.conversation.messages.length, 2);
  assert.equal(completed.conversation.activeRunId, null);
  assert.equal(completed.conversation.activities.every((activity) => activity.status === "completed"), true);
  assert.deepEqual(selections, [null, selectedWorkspace.selection]);
  assert.equal(runtime.beginCalls, 1);
  assert.equal(runtime.continuationCalls, 0);
  assert.equal(runtime.releaseCalls, 1);
  assert.equal(restartedRuntime.continuationCalls, 1);
  assert.equal(restartedRuntime.releaseCalls, 1);
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
      async invokeCapability(request) {
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
      async invokeCapability(request) {
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

test("assistant session routes a title edit through approval, version binding and projection refresh", async () => {
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-title"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "update-title",
        capabilityId: "score.update-title",
        contractVersion: 1,
        input: { title: "夜曲" },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-title"], contextSourceIds: ["score.update-title"] },
      decision: { kind: "finish", reason: "completed", text: "作品标题已经修改为《夜曲》。" },
    },
  ]);
  const runtime = new FakeRuntime(provider);
  const store = new InMemoryAgentRunStore();
  const requests: Parameters<WorkbenchAgentCapabilityPort["invoke"]>[0][] = [];
  const changes: Array<{ documentId: string; documentVersion: number }> = [];
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-update-title",
    createConversationId: () => "conversation-update-title",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(request) {
        requests.push(request);
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            documentId: "score-1",
            documentVersion: 8,
            previousTitle: "练习曲",
            title: "夜曲",
            undoAvailable: true,
          },
        };
      },
    }),
    onDocumentChanged(change) { changes.push(change); },
  });

  assert.equal(await session.start("请把作品标题改为《夜曲》", workspace), false);
  assert.equal(requests.length, 0);
  const waiting = await store.load("run-update-title");
  assert.ok(waiting);
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  assert.equal(approval.items[0]?.summary.includes("夜曲"), true);
  assert.deepEqual(approval.items[0]?.preview, {
    kind: "field-change",
    field: "score.title",
    before: null,
    after: "夜曲",
  });
  assert.equal(approval.items[0]?.policy.decision, "require-approval");

  assert.equal(await session.provideApprovalDecision(
    waiting.run.runId,
    approval.approvalId,
    "approved",
    workspace,
  ), true);
  assert.deepEqual(requests.map((request) => ({
    capabilityId: request.capabilityId,
    documentPrecondition: request.documentPrecondition,
    input: request.input,
  })), [{
    capabilityId: "score.update-title",
    documentPrecondition: { documentId: "score-1", documentVersion: 7 },
    input: { title: "夜曲" },
  }]);
  assert.deepEqual(changes, [{ documentId: "score-1", documentVersion: 8 }]);
  assert.equal(session.getSnapshot().status, "completed");
  assert.equal(session.getSnapshot().response, "作品标题已经修改为《夜曲》。");
  assert.equal(runtime.approvalContinuationCalls, 1);
  assert.equal(provider.exhausted, true);
});

test("assistant session prepares and approves an authoritative tempo ChangeSet", async () => {
  const changeSetId = `sha256:${"b".repeat(64)}`;
  const changeSet = {
    changeSetId,
    kind: "score-tempo",
    documentId: "score-1",
    baseDocumentVersion: 7,
    beforeTempoBpm: 96,
    afterTempoBpm: 132,
  };
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-tempo"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "update-tempo",
        capabilityId: "score.update-tempo",
        contractVersion: 1,
        input: { tempoBpm: 132 },
      }] },
    },
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-tempo"], contextSourceIds: ["score.update-tempo"] },
      decision: { kind: "finish", reason: "completed", text: "作品速度已经修改为 132 BPM。" },
    },
  ]);
  const runtime = new FakeRuntime(provider);
  const store = new InMemoryAgentRunStore();
  const requests: Parameters<WorkbenchAgentCapabilityPort["invoke"]>[0][] = [];
  const changes: Array<{ documentId: string; documentVersion: number }> = [];
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-update-tempo",
    createConversationId: () => "conversation-update-tempo",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(request) {
        requests.push(request);
        if (request.capabilityId === "score.prepare-tempo-change") return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: changeSet,
        };
        assert.equal(request.capabilityId, "score.commit-tempo-change");
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            changeSetId,
            documentId: "score-1",
            documentVersion: 8,
            previousTempoBpm: 96,
            tempoBpm: 132,
            undoAvailable: true,
          },
        };
      },
    }),
    onDocumentChanged(change) { changes.push(change); },
  });

  assert.equal(await session.start("请将速度改为 132 BPM", workspace), false);
  assert.deepEqual(requests.map((request) => request.capabilityId), ["score.prepare-tempo-change"]);
  const waiting = await store.load("run-update-tempo");
  assert.ok(waiting);
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  assert.equal(approval.items[0]?.changeSetId, changeSetId);
  assert.deepEqual(approval.items[0]?.preview, {
    kind: "field-change",
    field: "score.tempo",
    before: "96 BPM",
    after: "132 BPM",
  });

  assert.equal(await session.provideApprovalDecision(
    waiting.run.runId,
    approval.approvalId,
    "approved",
    workspace,
  ), true);
  assert.deepEqual(requests.map((request) => request.capabilityId), [
    "score.prepare-tempo-change",
    "score.commit-tempo-change",
  ]);
  assert.deepEqual(requests[1]?.input, { changeSet });
  assert.deepEqual(changes, [{ documentId: "score-1", documentVersion: 8 }]);
  assert.equal(session.getSnapshot().status, "completed");
  assert.equal(session.getSnapshot().response, "作品速度已经修改为 132 BPM。");
  assert.equal(provider.exhausted, true);
});

test("assistant session commits title and tempo as one approved metadata transaction", async () => {
  const changeSetId = `sha256:${"c".repeat(64)}`;
  const changeSet = {
    changeSetId,
    kind: "score-metadata-transaction",
    documentId: "score-1",
    baseDocumentVersion: 7,
    operations: ["set-title", "set-tempo"],
    before: { title: "练习曲", tempoBpm: 96 },
    after: { title: "夜曲", tempoBpm: 132 },
  };
  const provider = new FakeAgentProvider([
    {
      kind: "decision",
      expect: { capabilityIds: ["score.update-metadata"], contextSourceIds: [] },
      decision: { kind: "tool-calls", calls: [{
        callId: "update-metadata",
        capabilityId: "score.update-metadata",
        contractVersion: 1,
        input: { title: "夜曲", tempoBpm: 132 },
      }] },
    },
    {
      kind: "decision",
      expect: {
        capabilityIds: ["score.update-metadata"],
        contextSourceIds: ["score.update-metadata"],
      },
      decision: {
        kind: "finish",
        reason: "completed",
        text: "标题与速度已经在一个事务中修改。",
      },
    },
  ]);
  const runtime = new FakeRuntime(provider);
  const store = new InMemoryAgentRunStore();
  const requests: Parameters<WorkbenchAgentCapabilityPort["invoke"]>[0][] = [];
  const changes: Array<{ documentId: string; documentVersion: number }> = [];
  const session = new AgentAssistantSession({
    runtime,
    store,
    createRunId: () => "run-update-metadata",
    createConversationId: () => "conversation-update-metadata",
    capabilities: new WorkbenchAgentCapabilityPort({
      async invokeCapability(request) {
        requests.push(request);
        if (request.capabilityId === "score.prepare-metadata-transaction") return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: changeSet,
        };
        assert.equal(request.capabilityId, "score.commit-metadata-transaction");
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: {
            changeSetId,
            documentId: "score-1",
            documentVersion: 8,
            appliedOperations: ["set-title", "set-tempo"],
            previous: changeSet.before,
            current: changeSet.after,
            undoAvailable: true,
          },
        };
      },
    }),
    onDocumentChanged(change) { changes.push(change); },
  });

  assert.equal(await session.start(
    "请把作品标题改为《夜曲》，并将速度改为 132 BPM",
    workspace,
  ), false);
  assert.deepEqual(requests.map((request) => request.capabilityId), [
    "score.prepare-metadata-transaction",
  ]);
  const waiting = await store.load("run-update-metadata");
  assert.ok(waiting);
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  assert.equal(approval.items[0]?.changeSetId, changeSetId);
  assert.equal(approval.items[0]?.preview?.kind, "change-list");

  assert.equal(await session.provideApprovalDecision(
    waiting.run.runId,
    approval.approvalId,
    "approved",
    workspace,
  ), true);
  assert.deepEqual(requests.map((request) => request.capabilityId), [
    "score.prepare-metadata-transaction",
    "score.commit-metadata-transaction",
  ]);
  assert.deepEqual(requests[1]?.input, { changeSet });
  assert.deepEqual(changes, [{ documentId: "score-1", documentVersion: 8 }]);
  assert.equal(session.getSnapshot().status, "completed");
  assert.equal(session.getSnapshot().response, "标题与速度已经在一个事务中修改。");
  assert.equal(provider.exhausted, true);
});

test("assistant session approves a persisted Invocation and continues the same submission", async () => {
  const descriptor = FIRST_PARTY_CAPABILITY_CATALOG.find(
    (item) => item.id === "score.read-summary",
  );
  assert.ok(descriptor);
  const catalog = [{
    ...descriptor,
    approvalRequirement: "risk-based" as const,
    sideEffects: { ...descriptor.sideEffects, document: "write" as const },
  }];
  const store = new InMemoryAgentRunStore();
  const preparatoryController = new AgentRunController({
    provider: new FakeAgentProvider([{
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "read-summary",
          capabilityId: "score.read-summary",
          contractVersion: 1,
          input: {},
        }],
      },
    }]),
    capabilities: { async invoke() { throw new Error("approval is required"); } },
    catalog,
    completionVerifier: verifyScoreSummaryCompletion,
    store,
  });
  const waiting = await preparatoryController.run({
    runId: "run-approval-session",
    workspace,
    goal: "读取当前乐谱概要",
    intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: ["score.read-summary"],
      allowedKinds: ["query"],
      maxToolsPerTurn: 1,
      maxCostClass: "constant",
      approvalMode: "risk-based",
    },
    budget: {
      tokenBudget: 800,
      itemCountBudget: 12,
      toolResultSizeBudget: 4096,
      rangeBudget: 0,
      historyTurnBudget: 2,
    },
    initialContextItems: [],
    maxTurns: 4,
  });
  const approval = getAgentRunRequiredApproval(waiting.run);
  assert.ok(approval);
  const continuationProvider = new FakeAgentProvider([{
    kind: "decision",
    expect: { capabilityIds: ["score.read-summary"], contextSourceIds: ["score.read-summary"] },
    decision: { kind: "finish", reason: "completed", text: "批准后的读取已完成。" },
  }]);
  const runtime = new FakeRuntime(continuationProvider, {
    ...readyRuntimeSnapshot,
    status: "recovering",
    canStartRun: false,
    recovery: {
      status: "ready",
      items: [{
        runId: waiting.run.runId,
        workspaceId: workspace.workspaceId,
        goal: waiting.run.goal,
        kind: "awaiting-user",
        state: waiting.run.state,
        invocationId: approval.items[0]?.invocationId ?? null,
        requiredInput: null,
        requiredApproval: approval,
        action: "approve",
        message: "Agent 正在等待你的批准",
        isBlocking: true,
      }],
      message: "有 1 个 Agent Run 需要处理",
    },
    message: "有 Agent 任务等待批准",
  });
  const session = new AgentAssistantSession({
    runtime,
    store,
    capabilities: {
      async invoke(request) {
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: { documentId: "score-1", documentVersion: 8, title: "练习曲", measureCount: 32 },
        };
      },
    },
    createController: (lease) => new AgentRunController({
      provider: lease.provider,
      capabilities: {
        async invoke(request) {
          return {
            status: "completed",
            invocationId: request.invocationId,
            capabilityId: request.capabilityId,
            contractVersion: request.contractVersion,
            data: { documentId: "score-1", documentVersion: 8, title: "练习曲", measureCount: 32 },
          };
        },
      },
      catalog,
      completionVerifier: verifyScoreSummaryCompletion,
      store,
    }),
  });

  assert.equal(await session.provideApprovalDecision(
    waiting.run.runId,
    approval.approvalId,
    "approved",
    workspace,
  ), true);
  assert.equal(session.getSnapshot().status, "completed");
  assert.equal(session.getSnapshot().response, "批准后的读取已完成。");
  assert.equal(session.getSnapshot().conversation.activeSubmissionId, null);
  assert.equal(runtime.approvalContinuationCalls, 1);
  assert.equal((await store.load(waiting.run.runId))?.run.invocations[0]?.state.status, "succeeded");
});

test("assistant session freshly verifies the host receipt before granting a retry lease", async () => {
  const store = new InMemoryAgentRunStore();
  const preparatoryController = new AgentRunController({
    provider: new FakeAgentProvider([{
      kind: "decision",
      expect: { capabilityIds: ["score.read-summary"], contextSourceIds: [] },
      decision: {
        kind: "tool-calls",
        calls: [{
          callId: "read-summary",
          capabilityId: "score.read-summary",
          contractVersion: 1,
          input: {},
        }],
      },
    }]),
    capabilities: { async invoke() { throw new Error("transport outcome is unknown"); } },
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
    completionVerifier: verifyScoreSummaryCompletion,
    store,
  });
  const recovering = await preparatoryController.run({
    runId: "run-retry-session",
    workspace,
    goal: "读取当前乐谱概要",
    intent: { kind: "read", requestedCapabilityIds: ["score.read-summary"], scope: "document" },
    policy: {
      policyVersion: 1,
      allowedCapabilityIds: ["score.read-summary"],
      allowedKinds: ["query"],
      maxToolsPerTurn: 1,
      maxCostClass: "constant",
      approvalMode: "disallow",
    },
    budget: {
      tokenBudget: 800,
      itemCountBudget: 12,
      toolResultSizeBudget: 4096,
      rangeBudget: 0,
      historyTurnBudget: 2,
    },
    initialContextItems: [],
    maxTurns: 4,
  });
  assert.equal(recovering.run.state.lifecycle, "recovering");
  const invocationId = recovering.run.invocations[0]?.invocationId;
  assert.ok(invocationId);
  const runtime = new FakeRuntime(new FakeAgentProvider([]));
  let receiptLookups = 0;
  const session = new AgentAssistantSession({
    runtime,
    store,
    receipts: {
      async lookup() {
        receiptLookups += 1;
        return { status: "started" };
      },
    },
    capabilities: { async invoke(): Promise<never> { throw new Error("must not retry"); } },
  });

  assert.equal(await session.retryInvocation(recovering.run.runId, invocationId, workspace), false);
  assert.equal(receiptLookups, 1);
  assert.equal(runtime.retryContinuationCalls, 0);
  assert.equal(session.getSnapshot().message, "无法证明原能力调用尚未开始，请先重新核对");
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
