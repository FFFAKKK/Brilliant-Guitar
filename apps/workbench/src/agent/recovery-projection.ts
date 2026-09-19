import type {
  AgentRequiredApproval,
  AgentRequiredUserInput,
  AgentRunState,
} from "./agent-contracts.ts";
import type { AgentRunRecoveryResult } from "./recovery-coordinator.ts";
import { getAgentRunRequiredApproval, getAgentRunRequiredInput } from "./run-controller.ts";

export type AgentRecoveryProjectionKind =
  | "awaiting-user"
  | "ready-to-resume"
  | "retry-available"
  | "reconciliation-required"
  | "terminal"
  | "missing";

export type AgentRecoveryProjectionAction =
  | "approve"
  | "provide-input"
  | "resume"
  | "retry"
  | "reconcile"
  | "dismiss";

export interface AgentRecoveryProjection {
  readonly runId: string;
  readonly workspaceId: string | null;
  readonly goal: string | null;
  readonly kind: AgentRecoveryProjectionKind;
  readonly state: AgentRunState | null;
  readonly invocationId: string | null;
  readonly requiredInput: AgentRequiredUserInput | null;
  readonly requiredApproval: AgentRequiredApproval | null;
  readonly action: AgentRecoveryProjectionAction;
  readonly message: string;
  readonly isBlocking: boolean;
}

export function projectRecovery(result: AgentRunRecoveryResult): AgentRecoveryProjection {
  if (result.status === "missing") {
    return {
      runId: result.runId,
      workspaceId: null,
      goal: null,
      kind: "missing",
      state: null,
      invocationId: null,
      requiredInput: null,
      requiredApproval: null,
      action: "dismiss",
      message: "找不到需要恢复的 Agent Run",
      isBlocking: false,
    };
  }

  const run = result.run;
  if (result.status === "awaiting-user") {
    const requiredInput = result.waitReason === "user-input"
      ? getAgentRunRequiredInput(run)
      : null;
    const requiredApproval = result.waitReason === "approval"
      ? getAgentRunRequiredApproval(run)
      : null;
    return {
      runId: run.runId,
      workspaceId: run.workspace.workspaceId,
      goal: run.goal,
      kind: "awaiting-user",
      state: run.state,
      invocationId: requiredInput?.sourceInvocationId ?? run.invocations.at(-1)?.invocationId ?? null,
      requiredInput,
      requiredApproval,
      action: result.waitReason === "approval" ? "approve" : "provide-input",
      message: result.waitReason === "approval"
        ? "Agent 正在等待你的批准"
        : requiredInput?.prompt ?? "Agent 正在等待你的输入",
      isBlocking: true,
    };
  }
  if (result.status === "ready-to-resume") {
    return {
      runId: run.runId,
      workspaceId: run.workspace.workspaceId,
      goal: run.goal,
      kind: "ready-to-resume",
      state: run.state,
      invocationId: null,
      requiredInput: null,
      requiredApproval: null,
      action: "resume",
      message: "Agent 已完成恢复核对，可以继续",
      isBlocking: true,
    };
  }
  if (result.status === "retry-available") {
    return {
      runId: run.runId,
      workspaceId: run.workspace.workspaceId,
      goal: run.goal,
      kind: "retry-available",
      state: run.state,
      invocationId: result.invocationId,
      requiredInput: null,
      requiredApproval: null,
      action: "retry",
      message: "原能力调用尚未开始，可以在确认后重试",
      isBlocking: true,
    };
  }
  if (result.status === "reconciliation-required") {
    return {
      runId: run.runId,
      workspaceId: run.workspace.workspaceId,
      goal: run.goal,
      kind: "reconciliation-required",
      state: run.state,
      invocationId: result.invocationId,
      requiredInput: null,
      requiredApproval: null,
      action: "reconcile",
      message: result.receiptStatus === "identity-conflict"
        ? "能力调用身份发生冲突，已阻止自动恢复"
        : "无法确认原能力调用是否完成，需要继续核对",
      isBlocking: true,
    };
  }
  return {
    runId: run.runId,
    workspaceId: run.workspace.workspaceId,
    goal: run.goal,
    kind: "terminal",
    state: run.state,
    invocationId: null,
    requiredInput: null,
    requiredApproval: null,
    action: "dismiss",
    message: result.reason === "cancelled" ? "Agent 已取消" : "Agent 已终止",
    isBlocking: false,
  };
}
