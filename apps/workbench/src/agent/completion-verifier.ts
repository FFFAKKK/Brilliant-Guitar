import { isScoreSummaryV1 } from "../contracts/capability.ts";
import type { CapabilityResult } from "../contracts/capability.ts";
import type { AgentContextItem } from "./agent-contracts.ts";
import type { AgentInvocationState } from "./invocation-state.ts";

export interface AgentCompletionInvocation {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly state: AgentInvocationState;
  readonly result: CapabilityResult<unknown> | null;
}

export interface AgentCompletionVerification {
  readonly satisfied: boolean;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface AgentCompletionInput {
  readonly goal: string;
  readonly contextItems: readonly AgentContextItem[];
  readonly invocations: readonly AgentCompletionInvocation[];
}

export type AgentCompletionVerifier = (
  input: AgentCompletionInput,
) => AgentCompletionVerification;

export const verifyScoreSummaryCompletion: AgentCompletionVerifier = (input) => {
  const invocation = input.invocations.find((item) => item.capabilityId === "score.read-summary"
    && item.state.status === "succeeded"
    && item.result?.status === "completed"
    && isScoreSummaryV1(item.result.data));
  if (invocation === undefined || invocation.result?.status !== "completed"
    || !isScoreSummaryV1(invocation.result.data)) {
    return {
      satisfied: false,
      reason: "缺少经过验证的乐谱概要结果",
      evidence: [],
    };
  }
  return {
    satisfied: true,
    reason: "乐谱概要已由应用能力读取并通过合同校验",
    evidence: [
      invocation.invocationId,
      `${invocation.result.data.documentId}@${invocation.result.data.documentVersion}`,
    ],
  };
};
