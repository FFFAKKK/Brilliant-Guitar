import { isTauri } from "@tauri-apps/api/core";

import {
  isScoreMeasureRangeV1,
  isScoreMetadataTransactionUpdateV1,
  isScoreMetadataV1,
  isScoreStructureV1,
  isScoreSummaryV1,
  isScoreTempoUpdateV1,
  isScoreTitleUpdateV1,
} from "../contracts/capability.ts";
import type {
  CapabilityResult,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
} from "../contracts/capability.ts";
import type { ApplicationCapabilityInvoker } from "../contracts/application-capability.ts";
import type { WorkflowDirectory } from "../contracts/workflow.ts";
import type {
  AgentApprovalDecision,
  AgentContextBudget,
  AgentContextItem,
  AgentProvidedUserInput,
  AgentRequiredUserInput,
  AgentWorkspaceScope,
  CapabilityScope,
  RunPolicySnapshot,
  AgentWorkflowIdentity,
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
  verifyScoreMetadataTransactionCompletion,
  verifyScoreMeasuresCompletion,
  verifyScoreStructureCompletion,
  verifyScoreSummaryCompletion,
  verifyScoreTempoUpdateCompletion,
  verifyScoreTitleUpdateCompletion,
} from "./completion-verifier.ts";
import { projectRunProgressToConversation } from "./conversation-progress.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "./first-party-capabilities.ts";
import {
  AgentIntentRouter,
  DEFAULT_AGENT_INTENT_ROUTER,
} from "./agent-intent-router.ts";
import type { AgentCapabilityId, AgentReadCapabilityId } from "./agent-intent-router.ts";
import {
  AgentRunController,
  getAgentRunRequiredApproval,
  getAgentRunRequiredInput,
} from "./run-controller.ts";
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
import type { AgentInvocationReceiptPort } from "./recovery-coordinator.ts";
import { TauriAgentInvocationReceiptPort } from "./tauri-invocation-receipt.ts";
import { AgentWorkflowRuntime } from "./workflow-runtime.ts";

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
  beginApprovalContinuation(runId: string, approvalId: string): AgentPluginRunLease | null;
  beginRetryContinuation(runId: string, invocationId: string): AgentPluginRunLease | null;
  refresh(): Promise<void>;
}

export interface AgentAssistantCapabilityHost {
  agentCapabilities(): ApplicationCapabilityInvoker;
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
  readonly receipts?: AgentInvocationReceiptPort | null;
  readonly createRunId?: () => string;
  readonly createConversationId?: () => string;
  readonly createController?: (lease: AgentPluginRunLease) => AgentRunController;
  readonly intentRouter?: AgentIntentRouter;
  readonly workflows?: WorkflowDirectory;
  readonly now?: () => number;
  readonly onDocumentChanged?: (change: AgentDocumentChange) => void | Promise<void>;
}

export interface AgentDocumentChange {
  readonly documentId: string;
  readonly documentVersion: number;
}

const SUMMARY_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-summary"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
});

const METADATA_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-metadata"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
});

const STRUCTURE_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-structure"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
});

const MEASURES_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.read-measures"]),
  allowedKinds: Object.freeze(["query"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "range" as const,
  approvalMode: "risk-based",
});

const UPDATE_TITLE_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.update-title"]),
  allowedKinds: Object.freeze(["mutation"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
});

const UPDATE_TEMPO_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.update-tempo"]),
  allowedKinds: Object.freeze(["mutation"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
});

const UPDATE_METADATA_POLICY: RunPolicySnapshot = Object.freeze({
  policyVersion: 1,
  allowedCapabilityIds: Object.freeze(["score.update-metadata"]),
  allowedKinds: Object.freeze(["mutation"] as const),
  maxToolsPerTurn: 1,
  maxCostClass: "constant" as const,
  approvalMode: "risk-based",
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

interface CapabilityPlan {
  readonly capabilityId: AgentCapabilityId;
  readonly intentKind: "read" | "edit";
  readonly policy: RunPolicySnapshot;
  readonly scope: CapabilityScope;
  readonly budget: AgentContextBudget;
  readonly completionVerifier: AgentCompletionVerifier;
}

interface ResolvedCapabilityPlan extends CapabilityPlan {
  readonly workflow: AgentWorkflowIdentity | null;
}

const CAPABILITY_PLANS: Readonly<Record<AgentCapabilityId, CapabilityPlan>> = Object.freeze({
  "score.read-summary": {
    capabilityId: "score.read-summary",
    intentKind: "read",
    policy: SUMMARY_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreSummaryCompletion,
  },
  "score.read-metadata": {
    capabilityId: "score.read-metadata",
    intentKind: "read",
    policy: METADATA_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreMetadataCompletion,
  },
  "score.read-structure": {
    capabilityId: "score.read-structure",
    intentKind: "read",
    policy: STRUCTURE_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreStructureCompletion,
  },
  "score.read-measures": {
    capabilityId: "score.read-measures",
    intentKind: "read",
    policy: MEASURES_POLICY,
    scope: "range",
    budget: MEASURES_BUDGET,
    completionVerifier: verifyScoreMeasuresCompletion,
  },
  "score.update-title": {
    capabilityId: "score.update-title",
    intentKind: "edit",
    policy: UPDATE_TITLE_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreTitleUpdateCompletion,
  },
  "score.update-tempo": {
    capabilityId: "score.update-tempo",
    intentKind: "edit",
    policy: UPDATE_TEMPO_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreTempoUpdateCompletion,
  },
  "score.update-metadata": {
    capabilityId: "score.update-metadata",
    intentKind: "edit",
    policy: UPDATE_METADATA_POLICY,
    scope: "document",
    budget: SUMMARY_BUDGET,
    completionVerifier: verifyScoreMetadataTransactionCompletion,
  },
});

function resolveCapability(capabilityId: AgentCapabilityId): CapabilityPlan {
  return CAPABILITY_PLANS[capabilityId];
}

function isAgentReadCapabilityId(value: string): value is AgentReadCapabilityId {
  return value.startsWith("score.read-")
    && Object.prototype.hasOwnProperty.call(CAPABILITY_PLANS, value);
}

function isAgentCapabilityId(value: string): value is AgentCapabilityId {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_PLANS, value);
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
    if (invocation.capabilityId === "score.update-title" && isScoreTitleUpdateV1(result.data)) {
      return `作品标题已从《${result.data.previousTitle}》修改为《${result.data.title}》。`;
    }
    if (invocation.capabilityId === "score.update-tempo" && isScoreTempoUpdateV1(result.data)) {
      return `作品速度已从 ${result.data.previousTempoBpm} BPM 修改为 ${result.data.tempoBpm} BPM。`;
    }
    if (invocation.capabilityId === "score.update-metadata"
      && isScoreMetadataTransactionUpdateV1(result.data)) {
      const changes: string[] = [];
      if (result.data.appliedOperations.includes("set-title")) {
        changes.push(`标题由《${result.data.previous.title}》改为《${result.data.current.title}》`);
      }
      if (result.data.appliedOperations.includes("set-tempo")) {
        changes.push(`速度由 ${result.data.previous.tempoBpm} BPM 改为 ${result.data.current.tempoBpm} BPM`);
      }
      return `作品元数据事务已完成：${changes.join("，")}。`;
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
  plan: ResolvedCapabilityPlan,
): AgentRunRequest {
  return {
    runId,
    workspace,
    goal,
    intent: {
      kind: plan.intentKind,
      requestedCapabilityIds: [plan.capabilityId],
      scope: plan.scope,
      ...(plan.workflow === null ? {} : { workflow: plan.workflow }),
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
  readonly #receipts: AgentInvocationReceiptPort | null;
  readonly #createRunId: () => string;
  readonly #createController: ((lease: AgentPluginRunLease) => AgentRunController) | null;
  readonly #intentRouter: AgentIntentRouter;
  readonly #workflowRuntime: AgentWorkflowRuntime | null;
  readonly #now: () => number;
  readonly #onDocumentChanged: ((change: AgentDocumentChange) => void | Promise<void>) | null;
  readonly #listeners = new Set<() => void>();
  #snapshot: AgentAssistantSessionSnapshot;
  #taskHistory: readonly AgentTaskHistoryEntry[] = [];
  #lease: AgentPluginRunLease | null = null;
  #disposed = false;

  constructor(dependencies: AgentAssistantSessionDependencies) {
    this.#runtime = dependencies.runtime;
    this.#store = dependencies.store;
    this.#capabilities = dependencies.capabilities;
    this.#receipts = dependencies.receipts ?? null;
    this.#createRunId = dependencies.createRunId ?? (() => crypto.randomUUID());
    this.#createController = dependencies.createController ?? null;
    this.#intentRouter = dependencies.intentRouter ?? DEFAULT_AGENT_INTENT_ROUTER;
    this.#workflowRuntime = dependencies.workflows === undefined
      ? null
      : new AgentWorkflowRuntime(
          dependencies.workflows,
          FIRST_PARTY_CAPABILITY_CATALOG.map((descriptor) => descriptor.id),
        );
    this.#now = dependencies.now ?? (() => Date.now());
    this.#onDocumentChanged = dependencies.onDocumentChanged ?? null;
    const createConversationId = dependencies.createConversationId ?? (() => crypto.randomUUID());
    this.#snapshot = idleSnapshot(createAgentConversation(createConversationId()));
  }

  getSnapshot = (): AgentAssistantSessionSnapshot => this.#snapshot;

  #resolveCapabilityPlan(
    capabilityId: AgentCapabilityId,
    expectedWorkflow?: AgentWorkflowIdentity,
  ): ResolvedCapabilityPlan | null {
    const base = resolveCapability(capabilityId);
    if (this.#workflowRuntime === null) {
      return expectedWorkflow === undefined ? { ...base, workflow: null } : null;
    }
    try {
      const workflow = expectedWorkflow === undefined
        ? this.#workflowRuntime.resolveEntryOperation(capabilityId)
        : this.#workflowRuntime.resolvePinned(expectedWorkflow, capabilityId);
      return { ...base, workflow };
    } catch {
      return null;
    }
  }

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
    const plan = this.#resolveCapabilityPlan(route.capabilityId);
    if (plan === null) {
      this.#publish({ ...this.#snapshot, goal, message: "当前插件会话没有可执行这个任务的工作流" });
      return false;
    }
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
    if (workspace.documentId === null || workspace.documentVersion === null) {
      this.#publish({ ...this.#snapshot, message: "请先打开原任务对应的乐谱" });
      return false;
    }
    const selection = workspace.selection;
    if (selection === null
      || selection.documentId !== workspace.documentId
      || selection.documentVersion !== workspace.documentVersion) {
      this.#publish({ ...this.#snapshot, message: "请先在当前乐谱中选择小节" });
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
    if (workspace.documentId !== storedRequiredInput.constraints.documentId) {
      this.#publish({ ...this.#snapshot, message: "请切回原任务对应的乐谱后继续" });
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
    const plan = this.#resolveCapabilityPlan(capabilityId, storedRun.intent.workflow);
    if (plan === null) {
      this.#publish({ ...this.#snapshot, message: "原任务的工作流版本或所有者已经变化" });
      return false;
    }
    const conversation = this.#conversationForWaitingInvocation(
      storedRun,
      storedRequiredInput.sourceInvocationId,
      "等待用户输入",
    );
    if (conversation === null) {
      this.#publish({ ...this.#snapshot, message: "另一个 Agent 任务仍在当前对话中等待处理" });
      return false;
    }
    const lease = this.#runtime.beginContinuation(runId, requestId);
    if (lease === null) {
      this.#publish({
        status: "waiting",
        runId,
        goal: storedRun.goal,
        response: null,
        message: this.#runtime.getSnapshot().message,
        requiredInput: storedRequiredInput,
        conversation,
      });
      return false;
    }
    const identity = submissionIdentity(runId);
    const providedInput: AgentProvidedUserInput = {
      requestId,
      kind: "measure-selection",
      selection: { ...selection },
    };
    this.#lease = lease;
    this.#publish({
      status: "running",
      runId,
      goal: storedRun.goal,
      response: null,
      message: "已取得选择区，正在继续任务",
      requiredInput: null,
      conversation: this.#completeWaitingActivities(runId, conversation),
    });
    return this.#executeLeasedRun(
      lease,
      request(runId, storedRun.goal, workspace, [], plan),
      plan,
      identity,
      storedRun,
      providedInput,
    );
  };

  provideApprovalDecision = async (
    runId: string,
    approvalId: string,
    outcome: AgentApprovalDecision["outcome"],
    workspace: AgentWorkspaceScope,
  ): Promise<boolean> => {
    if (this.#disposed || this.#lease !== null) return false;
    if (workspace.documentId === null || workspace.documentVersion === null) {
      this.#publish({ ...this.#snapshot, message: "请先打开原任务对应的乐谱" });
      return false;
    }

    let storedRun: AgentRunRecord;
    try {
      const entry = await this.#store.load(runId);
      if (entry === null) {
        this.#publish({ ...this.#snapshot, message: "找不到需要批准的 Agent 任务" });
        return false;
      }
      storedRun = entry.run;
    } catch {
      this.#publish({ ...this.#snapshot, message: "暂时无法读取 Agent 任务状态" });
      return false;
    }
    const approval = getAgentRunRequiredApproval(storedRun);
    if (approval?.approvalId !== approvalId) {
      this.#publish({ ...this.#snapshot, message: "Agent 任务已不再等待这个批准请求" });
      return false;
    }
    if (storedRun.workspace.workspaceId !== workspace.workspaceId
      || storedRun.workspace.documentId !== workspace.documentId) {
      this.#publish({ ...this.#snapshot, message: "请切回原任务对应的乐谱后处理" });
      return false;
    }
    if (outcome === "approved" && approval.items.some(
      (item) => item.scope.documentVersion !== workspace.documentVersion,
    )) {
      this.#publish({ ...this.#snapshot, message: "乐谱版本已经变化，请重新发起任务" });
      return false;
    }
    const capabilityId = storedRun.intent.requestedCapabilityIds[0];
    if (storedRun.intent.requestedCapabilityIds.length !== 1
      || capabilityId === undefined
      || !isAgentCapabilityId(capabilityId)) {
      this.#publish({ ...this.#snapshot, message: "这个任务暂时不能从批准点继续" });
      return false;
    }
    const plan = this.#resolveCapabilityPlan(capabilityId, storedRun.intent.workflow);
    if (plan === null) {
      this.#publish({ ...this.#snapshot, message: "原任务的工作流版本或所有者已经变化" });
      return false;
    }
    const sourceInvocationId = approval.items[0]?.invocationId;
    if (sourceInvocationId === undefined) {
      this.#publish({ ...this.#snapshot, message: "批准请求没有可执行的能力" });
      return false;
    }
    const conversation = this.#conversationForWaitingInvocation(
      storedRun,
      sourceInvocationId,
      "等待用户批准",
    );
    if (conversation === null) {
      this.#publish({ ...this.#snapshot, message: "另一个 Agent 任务仍在当前对话中等待处理" });
      return false;
    }
    const lease = this.#runtime.beginApprovalContinuation(runId, approvalId);
    if (lease === null) {
      this.#publish({
        status: "waiting",
        runId,
        goal: storedRun.goal,
        response: null,
        message: this.#runtime.getSnapshot().message,
        requiredInput: null,
        conversation,
      });
      return false;
    }
    const identity = submissionIdentity(runId);
    const decision: AgentApprovalDecision = {
      approvalId,
      kind: "capability-execution",
      outcome,
      decidedBy: "local-user",
    };
    this.#lease = lease;
    this.#publish({
      status: "running",
      runId,
      goal: storedRun.goal,
      response: null,
      message: outcome === "approved" ? "已批准，正在执行能力" : "已拒绝，正在重新规划",
      requiredInput: null,
      conversation: this.#completeWaitingActivities(runId, conversation),
    });
    return this.#executeLeasedRun(
      lease,
      request(runId, storedRun.goal, workspace, [], plan),
      plan,
      identity,
      storedRun,
      null,
      decision,
    );
  };

  retryInvocation = async (
    runId: string,
    invocationId: string,
    workspace: AgentWorkspaceScope,
  ): Promise<boolean> => {
    if (this.#disposed || this.#lease !== null) return false;
    if (workspace.documentId === null || workspace.documentVersion === null) {
      this.#publish({ ...this.#snapshot, message: "请先打开原任务对应的乐谱" });
      return false;
    }
    if (this.#receipts === null) {
      this.#publish({ ...this.#snapshot, message: "当前宿主无法核对能力调用回执" });
      return false;
    }

    let storedRun: AgentRunRecord;
    try {
      const entry = await this.#store.load(runId);
      if (entry === null) {
        this.#publish({ ...this.#snapshot, message: "找不到需要重试的 Agent 任务" });
        return false;
      }
      storedRun = entry.run;
    } catch {
      this.#publish({ ...this.#snapshot, message: "暂时无法读取 Agent 任务状态" });
      return false;
    }
    const invocation = storedRun.invocations.find((item) => item.invocationId === invocationId);
    if (storedRun.state.lifecycle !== "recovering"
      || storedRun.state.phase !== "executing"
      || invocation === undefined
      || !["dispatched", "running", "outcome-unknown"].includes(invocation.state.status)) {
      this.#publish({ ...this.#snapshot, message: "这个能力调用已不再处于可重试状态" });
      return false;
    }
    if (storedRun.workspace.workspaceId !== workspace.workspaceId
      || storedRun.workspace.documentId !== workspace.documentId
      || storedRun.workspace.documentVersion !== workspace.documentVersion) {
      this.#publish({ ...this.#snapshot, message: "乐谱已经变化，请重新发起任务" });
      return false;
    }
    let receiptStatus: Awaited<ReturnType<AgentInvocationReceiptPort["lookup"]>>["status"];
    try {
      const receipt = await this.#receipts.lookup({
        runId,
        workspace: storedRun.workspace,
        invocation,
      });
      receiptStatus = receipt.status;
    } catch {
      receiptStatus = "unavailable";
    }
    if (receiptStatus !== "not-started") {
      this.#publish({
        ...this.#snapshot,
        message: receiptStatus === "resolved"
          ? "能力调用已有结果，请刷新恢复状态"
          : "无法证明原能力调用尚未开始，请先重新核对",
      });
      return false;
    }
    const capabilityId = storedRun.intent.requestedCapabilityIds[0];
    if (storedRun.intent.requestedCapabilityIds.length !== 1
      || capabilityId === undefined
      || !isAgentCapabilityId(capabilityId)) {
      this.#publish({ ...this.#snapshot, message: "这个任务暂时不能从重试点继续" });
      return false;
    }
    const plan = this.#resolveCapabilityPlan(capabilityId, storedRun.intent.workflow);
    if (plan === null) {
      this.#publish({ ...this.#snapshot, message: "原任务的工作流版本或所有者已经变化" });
      return false;
    }
    const conversation = this.#conversationForWaitingInvocation(
      storedRun,
      invocationId,
      "等待用户确认重试",
    );
    if (conversation === null) {
      this.#publish({ ...this.#snapshot, message: "另一个 Agent 任务仍在当前对话中等待处理" });
      return false;
    }
    const lease = this.#runtime.beginRetryContinuation(runId, invocationId);
    if (lease === null) {
      this.#publish({ ...this.#snapshot, message: this.#runtime.getSnapshot().message });
      return false;
    }
    const identity = submissionIdentity(runId);
    this.#lease = lease;
    this.#publish({
      status: "running",
      runId,
      goal: storedRun.goal,
      response: null,
      message: "已确认原调用未开始，正在重试",
      requiredInput: null,
      conversation: this.#completeWaitingActivities(runId, conversation),
    });
    return this.#executeLeasedRun(
      lease,
      request(runId, storedRun.goal, workspace, [], plan),
      plan,
      identity,
      storedRun,
      null,
      null,
      invocationId,
    );
  };

  async #executeLeasedRun(
    lease: AgentPluginRunLease,
    runRequest: AgentRunRequest,
    plan: ResolvedCapabilityPlan,
    identity: AgentAssistantSubmissionIdentity,
    resumeFrom: AgentRunRecord | null = null,
    providedInput: AgentProvidedUserInput | null = null,
    approvalDecision: AgentApprovalDecision | null = null,
    retryInvocationId: string | null = null,
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
        : approvalDecision !== null
          ? await controller.continueWithApproval(
              runRequest,
              resumeFrom,
              approvalDecision,
              lease.signal,
              observe,
            )
          : retryInvocationId !== null
            ? await controller.retryInvocation(
                runRequest,
                resumeFrom,
                retryInvocationId,
                lease.signal,
                observe,
              )
          : providedInput === null
          ? await controller.resume(runRequest, resumeFrom, lease.signal, observe)
          : await controller.continueWithInput(
              runRequest,
              resumeFrom,
              providedInput,
              lease.signal,
              observe,
            );
      if (!this.#disposed) {
        await this.#publishDocumentChange(outcome);
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

  async #publishDocumentChange(outcome: AgentRunOutcome): Promise<void> {
    if (this.#onDocumentChanged === null
      || outcome.run.state.lifecycle !== "terminal"
      || outcome.run.state.terminalReason !== "completed") return;
    const mutation = [...outcome.run.invocations].reverse().find((invocation) => {
      const descriptor = FIRST_PARTY_CAPABILITY_CATALOG.find(
        (candidate) => candidate.id === invocation.capabilityId,
      );
      return descriptor?.sideEffects.document === "write"
        && invocation.state.status === "succeeded"
        && invocation.result?.status === "completed";
    });
    const data = mutation?.result?.status === "completed" ? mutation.result.data : null;
    if (typeof data !== "object" || data === null || Array.isArray(data)) return;
    const identity = data as Record<string, unknown>;
    if (typeof identity.documentId !== "string"
      || !Number.isSafeInteger(identity.documentVersion)
      || (identity.documentVersion as number) < 0) return;
    try {
      await this.#onDocumentChanged({
        documentId: identity.documentId,
        documentVersion: identity.documentVersion as number,
      });
    } catch {
      // The host mutation is authoritative; projection refresh can be retried independently.
    }
  }

  #conversationForWaitingInvocation(
    run: AgentRunRecord,
    sourceInvocationId: string,
    fallbackLabel: string,
  ): AgentConversationSnapshot | null {
    const current = this.#snapshot.conversation;
    if (current.activeRunId === run.runId) return current;
    if (current.activeRunId !== null || current.activeSubmissionId !== null) return null;

    const identity = submissionIdentity(run.runId);
    const started = reduceAgentConversation(current, {
      type: "submission.started",
      runId: run.runId,
      ...identity,
      content: run.goal,
      occurredAt: run.createdAt,
    });
    if (!started.accepted) return null;
    const invocation = run.invocations.find(
      (item) => item.invocationId === sourceInvocationId,
    );
    const descriptor = invocation === undefined
      ? undefined
      : FIRST_PARTY_CAPABILITY_CATALOG.find((item) => item.id === invocation.capabilityId);
    const activityId = `capability:${sourceInvocationId}`;
    const activity = reduceAgentConversation(started.snapshot, {
      type: "activity.started",
      submissionId: identity.submissionId,
      runId: run.runId,
      activityId,
      kind: descriptor?.kind === "query" ? "reading" : "executing",
      label: descriptor?.name ?? invocation?.capabilityId ?? fallbackLabel,
    });
    if (!activity.accepted) return null;
    const waiting = reduceAgentConversation(activity.snapshot, {
      type: "activity.waiting",
      submissionId: identity.submissionId,
      runId: run.runId,
      activityId,
    });
    return waiting.accepted ? waiting.snapshot : null;
  }

  #completeWaitingActivities(
    runId: string,
    source: AgentConversationSnapshot = this.#snapshot.conversation,
  ): AgentConversationSnapshot {
    let conversation = source;
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
  workflows: WorkflowDirectory,
  onDocumentChanged?: (change: AgentDocumentChange) => void | Promise<void>,
): AgentAssistantSession {
  const atomicCapabilities = new WorkbenchAgentCapabilityPort(host.agentCapabilities());
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
    receipts: isTauri() ? new TauriAgentInvocationReceiptPort() : null,
    workflows,
    ...(onDocumentChanged === undefined ? {} : { onDocumentChanged }),
  });
}
