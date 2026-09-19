import type {
  AgentApprovalPolicyMode,
  AgentApprovalRiskLevel,
  AgentCapabilityDescriptor,
  CapabilitySideEffects,
  RunPolicySnapshot,
} from "./agent-contracts.ts";

export type AgentApprovalPolicyDecision = "allow" | "require-approval" | "deny";

export interface AgentApprovalPolicyEvaluation {
  readonly decision: AgentApprovalPolicyDecision;
  readonly riskLevel: AgentApprovalRiskLevel;
  readonly riskReasons: readonly string[];
  readonly policyVersion: number;
  readonly mode: AgentApprovalPolicyMode;
  readonly capabilityRequirement: AgentCapabilityDescriptor["approvalRequirement"];
}

function riskLevel(sideEffects: CapabilitySideEffects): AgentApprovalRiskLevel {
  if (sideEffects.document === "write"
    || sideEffects.filesystem === "write"
    || sideEffects.network === "write"
    || sideEffects.settings === "write") return "high";
  if (sideEffects.filesystem === "read"
    || sideEffects.network === "read"
    || sideEffects.settings === "read"
    || sideEffects.playback !== "none") return "medium";
  return "low";
}

function sideEffectReasons(sideEffects: CapabilitySideEffects): string[] {
  const reasons: string[] = [];
  if (sideEffects.document === "write") reasons.push("会修改当前乐谱");
  if (sideEffects.filesystem === "write") reasons.push("会写入本地文件");
  else if (sideEffects.filesystem === "read") reasons.push("会读取本地文件");
  if (sideEffects.network === "write") reasons.push("会向网络发送或修改数据");
  else if (sideEffects.network === "read") reasons.push("会访问网络");
  if (sideEffects.settings === "write") reasons.push("会修改软件设置");
  else if (sideEffects.settings === "read") reasons.push("会读取软件设置");
  if (sideEffects.playback === "start") reasons.push("会开始或改变播放");
  else if (sideEffects.playback === "stop") reasons.push("会停止播放");
  return reasons;
}

export function evaluateCapabilityApproval(
  descriptor: AgentCapabilityDescriptor,
  policy: Pick<RunPolicySnapshot, "policyVersion" | "approvalMode">,
): AgentApprovalPolicyEvaluation {
  const level = riskLevel(descriptor.sideEffects);
  const baselineRequiresApproval = descriptor.approvalRequirement === "always" || level !== "low";
  const requiresApproval = policy.approvalMode === "always" || baselineRequiresApproval;
  const decision: AgentApprovalPolicyDecision = !requiresApproval
    ? "allow"
    : policy.approvalMode === "disallow"
      ? "deny"
      : "require-approval";
  const reasons = sideEffectReasons(descriptor.sideEffects);
  if (reasons.length === 0 && decision !== "allow") {
    reasons.push(descriptor.approvalRequirement === "always"
      ? "该能力被声明为始终需要批准"
      : "当前任务策略要求逐次批准每项能力");
  }
  return Object.freeze({
    decision,
    riskLevel: level,
    riskReasons: Object.freeze([...reasons]),
    policyVersion: policy.policyVersion,
    mode: policy.approvalMode,
    capabilityRequirement: descriptor.approvalRequirement,
  });
}
