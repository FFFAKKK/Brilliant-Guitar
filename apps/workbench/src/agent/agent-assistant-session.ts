import { isTauri } from "@tauri-apps/api/core";

import {
  isScoreMeasureRangeV1,
  isScoreMetadataV1,
  isScoreStructureV1,
  isScoreSummaryV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  CapabilityTransportRequest,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
} from "../contracts/capability.ts";
import type {
  AgentContextBudget,
  AgentContextItem,
  AgentRequiredUserInput,
  AgentWorkspaceScope,
  CapabilityScope,
  RunPolicySnapshot,
} from "./agent-contracts.ts";
import { InMemoryAgentRunStore } from "./agent-store.ts";
import type { AgentRunStorePort } from "./agent-store.ts";
import type {
  AgentPluginRunLease,
  AgentPluginRuntime,
  AgentPluginRuntimeSnapshot,
} from "./agent-plugin-runtime.ts";
import {
  createAgentConversation,
  reduceAgentConversation,
} from "./agent-conversation.ts";
import type {
  AgentConversationEvent,
  AgentConversationIssue,
  AgentConversationSnapshot,
} from "./agent-conversation.ts";
import { WorkbenchAgentCapabilityPort } from "./capability-port.ts";
import type { AgentCapabilityPort } from "./capability-port.ts";
import type { AgentCompletionVerifier } from "./completion-verifier.ts";
import {
  verifyScoreMetadataCompletion,
  verifyScoreMeasuresCompletion,
  verifyScoreStructureCompletion,
  verifyScoreSummaryCompletion,
} from "./completion-verifier.ts";
import { projectRunProgressToConversation } from "./conversation-progress.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "./first-party-capabilities.ts";
import {
  AgentIntentRouter,
  DEFAULT_AGENT_INTENT_ROUTER,
} from "./agent-intent-router.ts";
import type { AgentReadCapabilityId } from "./agent-intent-router.ts";
import { AgentRunController, getAgentRunRequiredInput } from "./run-controller.ts";
import type {
  AgentRunOutcome,
  AgentRunRecord,
  AgentRunRequest,
} from "./run-controller.ts";
import {
  createAgentTaskHistoryEntry,
  projectAgentTaskHistoryContext,
} from "./task-history.ts";
import type { AgentTaskHistoryEntry } from "./task-history.ts";
import { TauriAgentRunStore } from "./tauri-agent-run-store.ts";
import { MeasureReferenceAgentCapabilityPort } from "./measure-reference-capability-port.ts";
import { MeasureReferenceReadService } from "./measure-reference-read-service.ts";
import { ScoreMeasureIndexPort } from "./score-measure-index-port.ts";

export type AgentAssistantSessionStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "completed"
  | "waiting"
  | "recovering"
  | "cancelled"
  | "failed";

export interface AgentAssistantSessionSnapshot {
  readonly status: AgentAssistantSessionStatus;
  readonly runId: string | null;
  readonly goal: string;
  readonly response: string | null;
  readonly message: string;
  readonly requiredInput: AgentRequiredUserInput | null;
  readonly conversation: AgentConversationSnapshot;
}

export interface AgentAssistantRuntimePort {
  getSnapshot(): AgentPluginRuntimeSnapshot;
  beginRun(): AgentPluginRunLease | null;
  beginContinuation(runId: string, requestId: string): AgentPluginRunLease | null;
  refresh(): Promise<void>;
}

export interface AgentAssistantCapabilityHost {
  invokeAgentCapability(request: CapabilityTransportRequest): Promise<unknown>;
  readScoreMeasureIndex(
    input: ScoreMeasureIndexInputV1,
  ): Promise<CapabilityResult<ScoreMeasureIndexV1>>;
  readScoreMeasureRange(
    input: ScoreMeasureRangeInputV1,
  ): Promise<CapabilityResult<ScoreMeasureRangeV1>>;
}

export interface AgentAssistantSessionDependencies {
  readonly runtime: AgentAssistantRuntimePort;
  readonly capabilities: AgentCapabilityPort;
  readonly store: AgentRunStorePort;
  readonly createRunId?: () => string;
  readonly createConversationId?: () => string;
  readonly createController?: (lease: AgentPluginRunLease) => AgentRunController;
  readonly intentRouter?: AgentIntentRouter;
  readonly now?: () => number;
}

const SUMMARY_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-summary"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  exposeApprovalRequired: false,
});

const METADATA_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-metadata"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  exposeApprovalRequired: false,
});

const STRUCTURE_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-structure"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  exposeApprovalRequired: false,
});

const MEASURES_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-measures"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "range" as const,
  exposeApprovalRequired: false,
});

const SUMMARY_BUDGET: AgentContextBudget = Object.freeze({
  tokenBudget: 800,
  itemCountBudget: 12,
  toolResultSizeBudget: 4096,
  rangeBudget: 0,
  historyTurnBudget: 2,
});

const MEASURES_BUDGET: AgentContextBudget = Object.freeze({
  tokenBudget: 1200,
  itemCountBudget: 12,
  toolResultSizeBudget: 16384,
  rangeBudget: 32,
  historyTurnBudget: 2,
});

const MAX_RETAINED_TASK_HISTORY = 32;

interface ReadCapabilityPlan {
  readonly capabilityId: AgentReadCapabilityId;
  readonly policy: RunPolicySnapshot;
  readonly scope: CapabilityScope;
  readonly budget: AgentContextBudget;
  readonly completionVerifier: AgentCompletionVerifier;
}

const READ_CAPABILITY_PLANS: Readonly<Record<AgentReadCapabilityId, ReadCapabilityPlan>> = Object.freeze({
  "score.read-summary": {
    capabilityId: "score.read-summary",
    policy: SUMMARY_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreSummaryCompletion,
  },
  "score.read-metadata": {
    capabilityId: "score.read-metadata",
    policy: METADATA_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreMetadataCompletion,
  },
  "score.read-structure": {
    capabilityId: "score.read-structure",
    policy: STRUCTURE_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreStructureCompletion,
  },
  "score.read-measures": {
    capabilityId: "score.read-measures",
    policy: MEASURES_POLICY,
    scope: "range",
    budget: MEASURES_BUDGET,
    completionVerifier: verifyScoreMeasuresCompletion,
  },
});

function resolveReadCapability(capabilityId: AgentReadCapabilityId): ReadCapabilityPlan {
  return READ_CAPABILITY_PLANS[capabilityId];
}

function isAgentReadCapabilityId(value: string): value is AgentReadCapabilityId {
  return Object.prototype.hasOwnProperty.call(READ_CAPABILITY_PLANS, value);
}

function idleSnapshot(conversation: AgentConversationSnapshot): AgentAssistantSessionSnapshot {
  return Object.freeze({
    status: "idle",
    runId: null,
    goal: "",
    response: null,
    message: "可以开始新的任务",
    requiredInput: null,
    conversation,
  });
}

function failureMessage(code: string | undefined): string {
  if (code === "provider-failed") return "模型 Provider 未能完成本次决策";
  if (code === "invalid-decision") return "模型返回的动作没有通过控制面校验";
  if (code === "capability-failed") return "应用能力未能完成本次读取";
  if (code === "budget-exceeded") return "任务在限定回合内没有完成";
  if (code === "completion-rejected") return "任务结果没有通过完成校验";
  return "Agent 任务未能完成";
}

function groundedFallback(outcome: AgentRunOutcome): string | null {
  for (const invocation of outcome.run.invocations) {
    const result = invocation.result;
    if (result?.status !== "completed") continue;
    if (invocation.capabilityId === "score.read-summary" && isScoreSummaryV1(result.data)) {
      const title = result.data.title.trim() || "未命名乐谱";
      return `《${title}》当前版本为 ${result.data.documentVersion}，共有 ${result.data.measureCount} 小节。`;
    }
    if (invocation.capabilityId === "score.read-metadata" && isScoreMetadataV1(result.data)) {
      const title = result.data.title.trim() || "未命名乐谱";
      const authors = result.data.authors.length > 0 ? `，作者为 ${result.data.authors.join("、")}` : "";
      return `《${title}》当前版本为 ${result.data.documentVersion}${authors}，速度为 ${result.data.tempoBpm} BPM。`;
    }
    if (invocation.capabilityId === "score.read-structure" && isScoreStructureV1(result.data)) {
      return `当前乐谱共有 ${result.data.measureCount} 小节、${result.data.partCount} 个声部和 ${result.data.staffCount} 个谱表。`;
    }
    if (invocation.capabilityId === "score.read-measures" && isScoreMeasureRangeV1(result.data)) {
      return `已读取 ${result.data.startMeasureId} 到 ${result.data.endMeasureId}，共 ${result.data.measureCount} 个小节。`;
    }
  }
  return null;
}

type AgentAssistantOutcomeProjection = Omit<AgentAssistantSessionSnapshot, "conversation">;

function projectOutcome(outcome: AgentRunOutcome): AgentAssistantOutcomeProjection {
  const state = outcome.run.state;
  const response = outcome.response ?? groundedFallback(outcome);
  if (state.lifecycle === "terminal") {
    if (state.terminalReason === "completed") return Object.freeze({
      status: "completed",
      runId: outcome.run.runId,
      goal: outcome.run.goal,
      response,
      message: "任务已完成并通过验证",
      requiredInput: null,
    });
    if (state.terminalReason === "cancelled") return Object.freeze({
      status: "cancelled",
      runId: outcome.run.runId,
      goal: outcome.run.goal,
      response: null,
      message: "任务已取消",
      requiredInput: null,
    });
    return Object.freeze({
      status: "failed",
      runId: outcome.run.runId,
      goal: outcome.run.goal,
      response,
      message: failureMessage("failureCode" in state ? state.failureCode : undefined),
      requiredInput: null,
    });
  }
  if (state.lifecycle === "recovering") return Object.freeze({
    status: "recovering",
    runId: outcome.run.runId,
    goal: outcome.run.goal,
    response,
    message: "能力调用结果需要恢复核对",
    requiredInput: null,
  });
  const requiredInput = getAgentRunRequiredInput(outcome.run);
  return Object.freeze({
    status: "waiting",
    runId: outcome.run.runId,
    goal: outcome.run.goal,
    response,
    message: requiredInput?.prompt
      ?? (state.lifecycle === "waiting" && state.waitReason === "approval"
        ? "任务正在等待批准"
        : "任务正在等待后续输入"),
    requiredInput,
  });
}

function failureIssue(code: string | undefined): AgentConversationIssue {
  const scope = code === "provider-failed"
    ? "provider" as const
    : code === "capability-failed"
      ? "capability" as const
      : "run" as const;
  return Object.freeze({
    code: code ?? "agent.run-failed",
    scope,
    retryable: code !== "invalid-decision" && code !== "completion-rejected",
    message: failureMessage(code),
  });
}

interface AgentAssistantSubmissionIdentity {
  readonly submissionId: string;
  readonly userMessageId: string;
  readonly assistantMessageId: string;
}

function submissionIdentity(runId: string): AgentAssistantSubmissionIdentity {
  return {
    submissionId: `submission:${runId}`,
    userMessageId: `message:user:${runId}`,
    assistantMessageId: `message:assistant:${runId}`,
  };
}

function request(
  runId: string,
  goal: string,
  workspace: AgentWorkspaceScope,
  initialContextItems: readonly AgentContextItem[],
  plan: ReadCapabilityPlan,
): AgentRunRequest {
  return {
    runId,
    workspace,
    goal,
    intent: {
      kind: "read",
      requestedCapabilityIds: [plan.capabilityId],
      scope: plan.scope,
    },
    policy: plan.policy,
    budget: plan.budget,
    initialContextItems,
    maxTurns: 4,
  };
}

export class AgentAssistantSession {
  readonly #runtime: AgentAssistantRuntimePort;
  readonly #store: AgentRunStorePort;
  readonly #capabilities: AgentCapabilityPort;
  readonly #createRunId: () => string;
  readonly #createController: ((lease: AgentPluginRunLease) => AgentRunController) | null;
  readonly #intentRouter: AgentIntentRouter;
  readonly #now: () => number;
  readonly #listeners = new Set<() => void>();
  #snapshot: AgentAssistantSessionSnapshot;
  #taskHistory: readonly AgentTaskHistoryEntry[] = [];
  #lease: AgentPluginRunLease | null = null;
  #disposed = false;

  constructor(dependencies: AgentAssistantSessionDependencies) {
    this.#runtime = dependencies.runtime;
    this.#store = dependencies.store;
    this.#capabilities = dependencies.capabilities;
    this.#createRunId = dependencies.createRunId ?? (() => crypto.randomUUID());
    this.#createController = dependencies.createController ?? null;
    this.#intentRouter = dependencies.intentRouter ?? DEFAULT_AGENT_INTENT_ROUTER;
    this.#now = dependencies.now ?? (() => Date.now());
    const createConversationId = dependencies.createConversationId ?? (() => crypto.randomUUID());
    this.#snapshot = idleSnapshot(createAgentConversation(createConversationId()));
  }

  getSnapshot = (): AgentAssistantSessionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start = async (rawGoal: string, workspace: AgentWorkspaceScope): Promise<boolean> => {
    if (this.#disposed || this.#lease !== null) return false;
    const goal = rawGoal.trim();
    if (goal.length === 0 || goal.length > 1200) {
      this.#publish({ ...this.#snapshot, message: goal.length === 0 ? "请输入任务" : "任务描述最多 1200 个字符" });
      return false;
    }
    if (workspace.documentId === null || workspace.documentVersion === null) {
      this.#publish({ ...this.#snapshot, goal, message: "请先打开一份乐谱" });
      return false;
    }
    if (this.#snapshot.conversation.activeSubmissionId !== null) {
      this.#publish({ ...this.#snapshot, message: "当前任务仍在等待处理" });
      return false;
    }
    const route = this.#intentRouter.route(goal);
    if (route.requiresClarification || route.capabilityId === null) {
      this.#publish({
        ...this.#snapshot,
        goal,
        response: null,
        message: route.clarificationMessage ?? "请明确你想读取的乐谱信息",
      });
      return false;
    }
    const plan = resolveReadCapability(route.capabilityId);
    const lease = this.#runtime.beginRun();
    if (lease === null) {
      this.#publish({ ...this.#snapshot, goal, message: this.#runtime.getSnapshot().message });
      return false;
    }
    const runId = this.#createRunId();
    const identity = submissionIdentity(runId);
    const started = reduceAgentConversation(this.#snapshot.conversation, {
      type: "submission.started",
      runId,
      ...identity,
      content: goal,
      occurredAt: this.#now(),
    });
    if (!started.accepted) {
      lease.release();
      this.#publish({ ...this.#snapshot, goal, message: "无法创建新的 Agent 任务，请重试" });
      return false;
    }
    this.#lease = lease;
    this.#publish({
      status: "running",
      runId,
      goal,
      response: null,
      message: "正在处理任务",
      requiredInput: null,
      conversation: started.snapshot,
    });
    const initialContextItems = projectAgentTaskHistoryContext(this.#taskHistory, workspace);
    return this.#executeLeasedRun(
      lease,
      request(runId, goal, workspace, initialContextItems, plan),
      plan,
      identity,
    );
  };

  provideRequiredInput = async (
    runId: string,
    requestId: string,
    workspace: AgentWorkspaceScope,
  ): Promise<boolean> => {
    if (this.#disposed || this.#lease !== null) return false;
    const requiredInput = this.#snapshot.requiredInput;
    if (this.#snapshot.runId !== runId
      || requiredInput?.requestId !== requestId
      || requiredInput.kind !== "measure-selection"
      || this.#snapshot.conversation.activeRunId !== runId) {
      this.#publish({ ...this.#snapshot, message: "这个输入请求已经失效，请刷新任务状态" });
      return false;
    }
    if (workspace.documentId === null || workspace.documentVersion === null) {
      this.#publish({ ...this.#snapshot, message: "请先打开原任务对应的乐谱" });
      return false;
    }
    if (workspace.selection === null
      || workspace.selection.documentId !== workspace.documentId
      || workspace.selection.documentVersion !== workspace.documentVersion) {
      this.#publish({ ...this.#snapshot, message: "请先在当前乐谱中选择小节" });
      return false;
    }
    if (workspace.documentId !== requiredInput.constraints.documentId) {
      this.#publish({ ...this.#snapshot, message: "请切回原任务对应的乐谱后继续" });
      return false;
    }

    let storedRun: AgentRunRecord;
    try {
      const entry = await this.#store.load(runId);
      if (entry === null) {
        this.#publish({ ...this.#snapshot, message: "找不到需要继续的 Agent 任务" });
        return false;
      }
      storedRun = entry.run;
    } catch {
      this.#publish({ ...this.#snapshot, message: "暂时无法读取 Agent 任务状态" });
      return false;
    }
    const storedRequiredInput = getAgentRunRequiredInput(storedRun);
    if (storedRequiredInput?.requestId !== requestId
      || storedRequiredInput.kind !== "measure-selection") {
      this.#publish({ ...this.#snapshot, message: "Agent 任务已不再等待这个输入请求" });
      return false;
    }
    if (storedRun.workspace.workspaceId !== workspace.workspaceId
      || storedRun.workspace.documentId !== workspace.documentId) {
      this.#publish({ ...this.#snapshot, message: "请切回原任务对应的乐谱后继续" });
      return false;
    }
    const capabilityId = storedRun.intent.requestedCapabilityIds[0];
    if (storedRun.intent.requestedCapabilityIds.length !== 1
      || capabilityId === undefined
      || !isAgentReadCapabilityId(capabilityId)) {
      this.#publish({ ...this.#snapshot, message: "这个任务暂时不能从选择区继续" });
      return false;
    }
    const lease = this.#runtime.beginContinuation(runId, requestId);
    if (lease === null) {
      this.#publish({ ...this.#snapshot, message: this.#runtime.getSnapshot().message });
      return false;
    }
    const plan = resolveReadCapability(capabilityId);
    const identity = submissionIdentity(runId);
    this.#lease = lease;
    this.#publish({
      status: "running",
      runId,
      goal: storedRun.goal,
      response: null,
      message: "已取得选择区，正在继续任务",
      requiredInput: null,
      conversation: this.#completeWaitingActivities(runId),
    });
    return this.#executeLeasedRun(
      lease,
      request(runId, storedRun.goal, workspace, [], plan),
      plan,
      identity,
      storedRun,
    );
  };

  async #executeLeasedRun(
    lease: AgentPluginRunLease,
    runRequest: AgentRunRequest,
    plan: ReadCapabilityPlan,
    identity: AgentAssistantSubmissionIdentity,
    resumeFrom: AgentRunRecord | null = null,
  ): Promise<boolean> {
    const { runId, goal } = runRequest;
    let outcome: AgentRunOutcome | null = null;
    try {
      const controller = this.#createController?.(lease) ?? new AgentRunController({
        provider: lease.provider,
        capabilities: this.#capabilities,
        catalog: FIRST_PARTY_CAPABILITY_CATALOG,
        completionVerifier: plan.completionVerifier,
        store: this.#store,
      });
      const observe = (event: Parameters<typeof projectRunProgressToConversation>[0]): void => {
        if (this.#disposed || event.runId !== runId) return;
        const projected = projectRunProgressToConversation(event, identity);
        if (projected !== null) this.#publishConversationEvent(projected);
      };
      outcome = resumeFrom === null
        ? await controller.run(runRequest, lease.signal, observe)
        : await controller.resume(runRequest, resumeFrom, lease.signal, observe);
      if (!this.#disposed) {
        const projection = projectOutcome(outcome);
        const state = outcome.run.state;
        const historyEntry = createAgentTaskHistoryEntry({
          submissionId: identity.submissionId,
          runId,
          goal: outcome.run.goal,
          state,
          response: projection.response,
          workspace: outcome.run.workspace,
          completedAt: outcome.run.events.at(-1)?.occurredAt ?? this.#now(),
        });
        if (historyEntry !== null) {
          this.#taskHistory = [...this.#taskHistory, historyEntry].slice(-MAX_RETAINED_TASK_HISTORY);
        }
        let finalEvent: AgentConversationEvent | null = null;
        if (state.lifecycle === "terminal" && state.terminalReason === "completed") finalEvent = projection.response === null
          ? {
              type: "submission.completed",
              submissionId: identity.submissionId,
              runId,
              messageId: identity.assistantMessageId,
            }
          : {
              type: "submission.completed",
              submissionId: identity.submissionId,
              runId,
              messageId: identity.assistantMessageId,
              content: projection.response,
            };
        else if (state.lifecycle === "terminal" && state.terminalReason === "cancelled") finalEvent = {
          type: "submission.cancelled",
          submissionId: identity.submissionId,
          runId,
          messageId: identity.assistantMessageId,
        };
        else if (state.lifecycle === "terminal") finalEvent = {
          type: "submission.failed",
          submissionId: identity.submissionId,
          runId,
          messageId: identity.assistantMessageId,
          issue: failureIssue("failureCode" in state ? state.failureCode : undefined),
        };
        const conversation = finalEvent === null
          ? this.#snapshot.conversation
          : this.#reduceConversation(finalEvent);
        this.#publish({ ...projection, conversation });
      }
      return outcome.run.state.lifecycle === "terminal"
        && outcome.run.state.terminalReason === "completed";
    } catch {
      if (!this.#disposed) {
        const cancelled = lease.signal.aborted;
        const conversation = this.#reduceConversation(cancelled ? {
          type: "submission.cancelled",
          submissionId: identity.submissionId,
          runId,
          messageId: identity.assistantMessageId,
        } : {
          type: "submission.failed",
          submissionId: identity.submissionId,
          runId,
          messageId: identity.assistantMessageId,
          issue: {
            code: "agent.infrastructure-unavailable",
            scope: "run",
            retryable: true,
            message: "Agent 运行服务暂时不可用，请重试",
          },
        });
        this.#publish({
          status: cancelled ? "cancelled" : "failed",
          runId,
          goal,
          response: null,
          message: cancelled ? "任务已取消" : "Agent 运行服务暂时不可用，请重试",
          requiredInput: null,
          conversation,
        });
      }
      return false;
    } finally {
      if (this.#lease === lease) this.#lease = null;
      lease.release();
      if (outcome?.run.state.lifecycle === "waiting" || outcome?.run.state.lifecycle === "recovering") {
        await this.#runtime.refresh();
      }
    }
  }

  #completeWaitingActivities(runId: string): AgentConversationSnapshot {
    let conversation = this.#snapshot.conversation;
    for (const activity of conversation.activities) {
      if (activity.runId !== runId || activity.status !== "waiting") continue;
      const transition = reduceAgentConversation(conversation, {
        type: "activity.completed",
        submissionId: activity.submissionId,
        runId,
        activityId: activity.activityId,
      });
      if (transition.accepted) conversation = transition.snapshot;
    }
    return conversation;
  }

  cancel = (): void => {
    if (this.#lease === null) return;
    this.#lease.cancel();
    this.#publish({ ...this.#snapshot, status: "cancelling", message: "正在取消任务" });
  };

  dispose(): void {
    this.#disposed = true;
    this.#lease?.cancel();
    this.#listeners.clear();
  }

  #publish(snapshot: AgentAssistantSessionSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }

  #reduceConversation(event: AgentConversationEvent): AgentConversationSnapshot {
    const transition = reduceAgentConversation(this.#snapshot.conversation, event);
    return transition.accepted ? transition.snapshot : this.#snapshot.conversation;
  }

  #publishConversationEvent(event: AgentConversationEvent): void {
    const conversation = this.#reduceConversation(event);
    if (conversation !== this.#snapshot.conversation) {
      this.#publish({ ...this.#snapshot, conversation });
    }
  }
}

export function createAgentAssistantSession(
  runtime: AgentPluginRuntime,
  host: AgentAssistantCapabilityHost,
): AgentAssistantSession {
  const atomicCapabilities = new WorkbenchAgentCapabilityPort(host);
  const capabilities = new MeasureReferenceAgentCapabilityPort(
    atomicCapabilities,
    new MeasureReferenceReadService(new ScoreMeasureIndexPort(host), {
      readMeasureRange: (input) => host.readScoreMeasureRange(input),
    }),
  );
  return new AgentAssistantSession({
    runtime,
    capabilities,
    store: isTauri() ? new TauriAgentRunStore() : new InMemoryAgentRunStore(),
  });
}
