import assert from "node:assert/strict";
import test from "node:test";

import type { AgentProviderRuntimeSnapshot, AgentRecoverySessionPort } from "../src/agent/agent-plugin-runtime.ts";
import { AgentPluginRuntime } from "../src/agent/agent-plugin-runtime.ts";
import type { AgentRecoverySessionSnapshot } from "../src/agent/agent-recovery-session.ts";
import type { AgentProviderSessionPort } from "../src/agent/provider-contract.ts";
import type { AgentProviderPort } from "../src/agent/provider.ts";

const recoverySnapshot = (
  status: AgentRecoverySessionSnapshot["status"] = "ready",
  blocking = false,
): AgentRecoverySessionSnapshot => ({
  status,
  items: blocking ? [{
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "分析当前乐谱",
    kind: "ready-to-resume",
    state: { lifecycle: "recovering", phase: "planning", recoveryReason: "host-interrupted" },
    invocationId: null,
    requiredInput: null,
    requiredApproval: null,
    action: "resume",
    message: "Agent 已完成恢复核对，可以继续",
    isBlocking: true,
  }] : [],
  message: blocking ? "有 1 个 Agent Run 需要处理" : "没有需要处理的 Agent 恢复任务",
});

const selectionRecoverySnapshot = (): AgentRecoverySessionSnapshot => ({
  status: "ready",
  items: [{
    runId: "run-selection",
    workspaceId: "workspace-1",
    goal: "读取当前选中的小节",
    kind: "awaiting-user",
    state: { lifecycle: "waiting", phase: "planning", waitReason: "user-input" },
    invocationId: "invocation-selection",
    requiredInput: {
      requestId: "input-selection",
      kind: "measure-selection",
      prompt: "请在当前乐谱中选择要读取的小节",
      sourceInvocationId: "invocation-selection",
      constraints: { documentId: "score-1", minMeasures: 1, maxMeasures: 32 },
    },
    requiredApproval: null,
    action: "provide-input",
    message: "请在当前乐谱中选择要读取的小节",
    isBlocking: true,
  }],
  message: "有 1 个 Agent Run 需要处理",
});

const approvalRecoverySnapshot = (): AgentRecoverySessionSnapshot => ({
  status: "ready",
  items: [{
    runId: "run-approval",
    workspaceId: "workspace-1",
    goal: "修改当前乐谱",
    kind: "awaiting-user",
    state: { lifecycle: "waiting", phase: "executing", waitReason: "approval" },
    invocationId: "invocation-approval",
    requiredInput: null,
    requiredApproval: {
      approvalId: "approval-1",
      kind: "capability-execution",
      prompt: "Agent 请求执行以下能力",
      items: [{
        invocationId: "invocation-approval",
        capabilityId: "score.write-title",
        capabilityName: "修改标题",
        contractVersion: 1,
        summary: "将执行“修改标题”",
        preview: {
          kind: "field-change",
          field: "score.title",
          before: null,
          after: "夜曲",
        },
        riskLevel: "high",
        riskReasons: ["会修改当前乐谱"],
        policy: {
          policyVersion: 1,
          mode: "risk-based",
          capabilityRequirement: "risk-based",
          decision: "require-approval",
        },
        scope: {
          workspaceId: "workspace-1",
          documentId: "score-1",
          documentVersion: 7,
          limit: "document",
        },
        sideEffects: {
          document: "write",
          filesystem: "none",
          network: "none",
          settings: "none",
          playback: "none",
        },
      }],
    },
    action: "approve",
    message: "Agent 正在等待你的批准",
    isBlocking: true,
  }],
  message: "有 1 个 Agent Run 需要处理",
});

const retryRecoverySnapshot = (): AgentRecoverySessionSnapshot => ({
  status: "ready",
  items: [{
    runId: "run-retry",
    workspaceId: "workspace-1",
    goal: "读取当前乐谱",
    kind: "retry-available",
    state: { lifecycle: "recovering", phase: "executing", recoveryReason: "host-interrupted" },
    invocationId: "invocation-retry",
    requiredInput: null,
    requiredApproval: null,
    action: "retry",
    message: "原能力调用尚未开始，可以在确认后重试",
    isBlocking: true,
  }],
  message: "有 1 个 Agent Run 需要处理",
});

class FakeRecoverySession implements AgentRecoverySessionPort {
  refreshCalls = 0;
  unsubscribeCalls = 0;
  readonly #listeners = new Set<() => void>();
  #snapshot: AgentRecoverySessionSnapshot;

  constructor(snapshot = recoverySnapshot()) { this.#snapshot = snapshot; }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      if (this.#listeners.delete(listener)) this.unsubscribeCalls += 1;
    };
  };

  async refresh(): Promise<void> { this.refreshCalls += 1; }

  async resume(): Promise<boolean> { return true; }

  publish(snapshot: AgentRecoverySessionSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}

class FakeProviderSession implements AgentProviderSessionPort {
  refreshCalls = 0;
  unsubscribeCalls = 0;
  disposeCalls = 0;
  readonly #listeners = new Set<() => void>();
  #snapshot: AgentProviderRuntimeSnapshot;
  readonly #provider: AgentProviderPort = { async decide() { return { kind: "message", text: "fake" }; } };

  constructor(snapshot: AgentProviderRuntimeSnapshot) { this.#snapshot = snapshot; }

  getSnapshot = () => this.#snapshot;

  getProvider = () => this.#snapshot.status === "ready" ? this.#provider : null;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      if (this.#listeners.delete(listener)) this.unsubscribeCalls += 1;
    };
  };

  async refresh(): Promise<void> { this.refreshCalls += 1; }

  dispose(): void { this.disposeCalls += 1; }

  publish(snapshot: AgentProviderRuntimeSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener();
  }
}

const readyProvider: AgentProviderRuntimeSnapshot = {
  status: "ready",
  providerId: "provider-1",
  model: "model-1",
  message: "Provider 已连接",
};

test("Agent runtime starts disabled and does not construct recovery services", async () => {
  let recoveryFactoryCalls = 0;
  let providerFactoryCalls = 0;
  const runtime = new AgentPluginRuntime({ hostAvailable: true, createRecoverySession: () => {
    recoveryFactoryCalls += 1;
    return new FakeRecoverySession();
  }, createProviderSession: () => {
    providerFactoryCalls += 1;
    return new FakeProviderSession(readyProvider);
  } });

  assert.equal(runtime.getSnapshot().status, "disabled");
  assert.equal(runtime.getSnapshot().enabled, false);
  assert.equal(recoveryFactoryCalls, 0);
  assert.equal(providerFactoryCalls, 0);
  await runtime.setEnabled(false);
  assert.equal(recoveryFactoryCalls, 0);
  assert.equal(providerFactoryCalls, 0);
});

test("unsupported hosts expose unavailable without constructing desktop services", async () => {
  let recoveryFactoryCalls = 0;
  let providerFactoryCalls = 0;
  const runtime = new AgentPluginRuntime({ hostAvailable: false, createRecoverySession: () => {
    recoveryFactoryCalls += 1;
    return new FakeRecoverySession();
  }, createProviderSession: () => {
    providerFactoryCalls += 1;
    return new FakeProviderSession(readyProvider);
  } });

  await runtime.setEnabled(true);

  assert.equal(runtime.getSnapshot().enabled, true);
  assert.equal(runtime.getSnapshot().status, "unavailable");
  assert.equal(runtime.getSnapshot().canStartRun, false);
  assert.equal(recoveryFactoryCalls, 0);
  assert.equal(providerFactoryCalls, 0);
});

test("desktop activation lazily refreshes recovery and waits for Provider configuration", async () => {
  const recovery = new FakeRecoverySession();
  const provider = new FakeProviderSession({ status: "unconfigured", providerId: null, model: null,
    message: "尚未配置模型 Provider" });
  let recoveryFactoryCalls = 0;
  let providerFactoryCalls = 0;
  const runtime = new AgentPluginRuntime({ hostAvailable: true, createRecoverySession: () => {
    recoveryFactoryCalls += 1;
    return recovery;
  }, createProviderSession: () => {
    providerFactoryCalls += 1;
    return provider;
  } });

  await runtime.setEnabled(true);
  await runtime.setEnabled(true);

  assert.equal(recoveryFactoryCalls, 1);
  assert.equal(providerFactoryCalls, 1);
  assert.equal(recovery.refreshCalls, 1);
  assert.equal(provider.refreshCalls, 1);
  assert.equal(runtime.getSnapshot().status, "configuring");
  assert.equal(runtime.getSnapshot().message, "尚未配置模型 Provider");
});

test("recovery work takes precedence over a ready Provider", async () => {
  const recovery = new FakeRecoverySession(recoverySnapshot("ready", true));
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => recovery });

  await runtime.setEnabled(true);

  assert.equal(runtime.getSnapshot().status, "recovering");
  assert.equal(runtime.getSnapshot().canStartRun, false);
  assert.equal(runtime.getSnapshot().recovery.items[0]?.runId, "run-1");
});

test("a ready Provider can start runs after recovery is clear", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession() });

  await runtime.setEnabled(true);

  assert.equal(runtime.getSnapshot().status, "ready");
  assert.equal(runtime.getSnapshot().canStartRun, true);
});

test("runtime grants one cancellable run lease and returns to ready after release", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession() });
  await runtime.setEnabled(true);

  const lease = runtime.beginRun();

  assert.ok(lease);
  assert.equal(runtime.getSnapshot().status, "running");
  assert.equal(runtime.getSnapshot().canStartRun, false);
  assert.equal(runtime.beginRun(), null);
  lease.cancel();
  assert.equal(lease.signal.aborted, true);
  lease.release();
  assert.equal(runtime.getSnapshot().status, "ready");
  assert.equal(runtime.getSnapshot().canStartRun, true);
});

test("runtime grants a continuation lease only to the matching input-waiting Run", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession(selectionRecoverySnapshot()) });
  await runtime.setEnabled(true);

  assert.equal(runtime.getSnapshot().canStartRun, false);
  assert.equal(runtime.beginRun(), null);
  assert.equal(runtime.beginContinuation("other-run", "input-selection"), null);
  assert.equal(runtime.beginContinuation("run-selection", "stale-input"), null);

  const lease = runtime.beginContinuation("run-selection", "input-selection");
  assert.ok(lease);
  assert.equal(runtime.getSnapshot().status, "running");
  assert.equal(runtime.beginContinuation("run-selection", "input-selection"), null);
  lease.release();
  assert.equal(runtime.getSnapshot().status, "recovering");
});

test("runtime grants an approval lease only for the persisted approval identity", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession(approvalRecoverySnapshot()) });
  await runtime.setEnabled(true);

  assert.equal(runtime.beginApprovalContinuation("other-run", "approval-1"), null);
  assert.equal(runtime.beginApprovalContinuation("run-approval", "stale-approval"), null);

  const lease = runtime.beginApprovalContinuation("run-approval", "approval-1");
  assert.ok(lease);
  assert.equal(runtime.getSnapshot().status, "running");
  assert.equal(runtime.beginApprovalContinuation("run-approval", "approval-1"), null);
  lease.release();
  assert.equal(runtime.getSnapshot().status, "recovering");
});

test("runtime grants a retry lease only for the projected Invocation identity", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession(retryRecoverySnapshot()) });
  await runtime.setEnabled(true);

  assert.equal(runtime.beginRetryContinuation("other-run", "invocation-retry"), null);
  assert.equal(runtime.beginRetryContinuation("run-retry", "stale-invocation"), null);

  const lease = runtime.beginRetryContinuation("run-retry", "invocation-retry");
  assert.ok(lease);
  assert.equal(runtime.getSnapshot().status, "running");
  assert.equal(runtime.beginRetryContinuation("run-retry", "invocation-retry"), null);
  lease.release();
  assert.equal(runtime.getSnapshot().status, "recovering");
});

test("disabling the plugin aborts an active run lease", async () => {
  const runtime = new AgentPluginRuntime({ hostAvailable: true,
    createProviderSession: () => new FakeProviderSession(readyProvider),
    createRecoverySession: () => new FakeRecoverySession() });
  await runtime.setEnabled(true);
  const lease = runtime.beginRun();
  assert.ok(lease);

  await runtime.setEnabled(false);

  assert.equal(lease.signal.aborted, true);
  assert.equal(runtime.getSnapshot().status, "disabled");
  lease.release();
  assert.equal(runtime.getSnapshot().status, "disabled");
});

test("deactivation releases Provider and recovery subscriptions and ignores stale publications", async () => {
  const recovery = new FakeRecoverySession();
  const provider = new FakeProviderSession(readyProvider);
  const runtime = new AgentPluginRuntime({ hostAvailable: true, createProviderSession: () => provider,
    createRecoverySession: () => recovery });
  await runtime.setEnabled(true);

  await runtime.setEnabled(false);
  recovery.publish(recoverySnapshot("error", true));
  provider.publish({ ...readyProvider, status: "error", message: "stale Provider error" });

  assert.equal(recovery.unsubscribeCalls, 1);
  assert.equal(provider.unsubscribeCalls, 1);
  assert.equal(provider.disposeCalls, 1);
  assert.equal(runtime.getSnapshot().enabled, false);
  assert.equal(runtime.getSnapshot().status, "disabled");
  assert.equal(runtime.getSnapshot().recovery.items.length, 0);
});

test("Provider control status updates the plugin without recreating the runtime", async () => {
  const provider = new FakeProviderSession({
    status: "authentication-required", providerId: "openai", model: "model-1", message: "需要配置 API Key",
  });
  const runtime = new AgentPluginRuntime({ hostAvailable: true, createProviderSession: () => provider,
    createRecoverySession: () => new FakeRecoverySession() });
  await runtime.setEnabled(true);
  assert.equal(runtime.getSnapshot().status, "configuring");

  provider.publish(readyProvider);

  assert.equal(runtime.getSnapshot().status, "ready");
  assert.equal(runtime.getSnapshot().canStartRun, true);
});

test("changing model hot-swaps only the Provider session", async () => {
  const recovery = new FakeRecoverySession();
  const first = new FakeProviderSession({ ...readyProvider, providerId: "provider.example", model: "model-1" });
  const second = new FakeProviderSession({ ...readyProvider, providerId: "provider.example", model: "model-2" });
  const runtime = new AgentPluginRuntime({
    hostAvailable: true,
    createRecoverySession: () => recovery,
    createProviderSession: (selection) => selection?.modelId === "model-2" ? second : first,
  });

  await runtime.setProviderSelection({ providerId: "provider.example", modelId: "model-1" });
  await runtime.setEnabled(true);
  await runtime.setProviderSelection({ providerId: "provider.example", modelId: "model-2" });

  assert.equal(first.unsubscribeCalls, 1);
  assert.equal(first.disposeCalls, 1);
  assert.equal(second.refreshCalls, 1);
  assert.equal(recovery.refreshCalls, 1);
  assert.equal(recovery.unsubscribeCalls, 0);
  assert.equal(runtime.getSnapshot().provider.model, "model-2");
  assert.equal(runtime.getSnapshot().status, "ready");
});

test("partial activation failures dispose Provider resources and publish a stable error", async () => {
  const provider = new FakeProviderSession(readyProvider);
  const runtime = new AgentPluginRuntime({
    hostAvailable: true,
    createProviderSession: () => provider,
    createRecoverySession: () => { throw new Error("Recovery storage unavailable"); },
  });

  await runtime.setEnabled(true);

  assert.equal(provider.disposeCalls, 1);
  assert.equal(runtime.getSnapshot().enabled, true);
  assert.equal(runtime.getSnapshot().status, "error");
  assert.equal(runtime.getSnapshot().canStartRun, false);
  assert.equal(runtime.getSnapshot().message, "Recovery storage unavailable");
});
