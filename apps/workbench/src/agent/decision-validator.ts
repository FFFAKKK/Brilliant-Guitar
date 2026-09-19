import type {
  AgentDecision,
  AgentRunState,
  AgentToolCall,
  DecisionRejection,
  RequiredUserInput,
  ToolsetResolutionResult,
  ValidatedAction,
  ValidatedActions,
} from "./agent-contracts.ts";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseCall(value: unknown): AgentToolCall | null {
  const item = record(value);
  if (item === undefined || !hasOnlyKeys(item, ["callId", "capabilityId", "contractVersion", "input"])
    || !nonEmptyString(item.callId) || !nonEmptyString(item.capabilityId)
    || typeof item.contractVersion !== "number" || !Number.isSafeInteger(item.contractVersion)) return null;
  return {
    callId: item.callId,
    capabilityId: item.capabilityId,
    contractVersion: item.contractVersion,
    input: item.input,
  };
}

function parseDecision(value: unknown): AgentDecision | null {
  const item = record(value);
  if (item === undefined || typeof item.kind !== "string") return null;
  if (item.kind === "message" && hasOnlyKeys(item, ["kind", "text"]) && nonEmptyString(item.text)) {
    return { kind: "message", text: item.text };
  }
  if (item.kind === "tool-calls" && hasOnlyKeys(item, ["kind", "calls"]) && Array.isArray(item.calls)) {
    const calls = item.calls.map(parseCall);
    return calls.every((call): call is AgentToolCall => call !== null)
      ? { kind: "tool-calls", calls }
      : null;
  }
  if (item.kind === "finish" && hasOnlyKeys(item, ["kind", "reason", "text"])
    && (item.reason === "completed" || item.reason === "failed" || item.reason === "cancelled")
    && (item.text === null || typeof item.text === "string")) {
    return { kind: "finish", reason: item.reason, text: item.text };
  }
  return null;
}

function rejection(
  callId: string | null,
  code: DecisionRejection["code"],
  message: string,
): DecisionRejection {
  return { callId, code, message };
}

export function validateDecision(
  value: unknown,
  toolset: Pick<ToolsetResolutionResult,
    "snapshot" | "inputValidators" | "rangeBudget" | "rangeEstimators">,
  runState: AgentRunState,
): ValidatedActions {
  const { snapshot, inputValidators, rangeBudget, rangeEstimators } = toolset;
  const decision = parseDecision(value);
  if (decision === null) return {
    acceptedActions: [],
    rejectedActions: [rejection(null, "invalid-decision", "模型决策格式无效")],
    requiredUserInput: [],
  };
  if (runState.lifecycle !== "active") return {
    acceptedActions: [],
    rejectedActions: [rejection(null, "run-not-active", "当前任务不允许继续执行")],
    requiredUserInput: [],
  };
  if (decision.kind === "message") return {
    acceptedActions: [{ kind: "message", text: decision.text }],
    rejectedActions: [],
    requiredUserInput: [],
  };
  if (decision.kind === "finish") return {
    acceptedActions: [{
      kind: "finish-request",
      reason: decision.reason,
      text: decision.text,
      completionCheckRequired: true,
    }],
    rejectedActions: [],
    requiredUserInput: [],
  };

  if (decision.calls.length > snapshot.maxCalls) return {
    acceptedActions: [],
    rejectedActions: [rejection(null, "too-many-calls", "本回合工具调用数量超出限制")],
    requiredUserInput: [],
  };

  const accepted: ValidatedAction[] = [];
  const rejected: DecisionRejection[] = [];
  const required: RequiredUserInput[] = [];
  const seen = new Set<string>();
  const descriptors = new Map(snapshot.toolDescriptors.map((descriptor) => [descriptor.id, descriptor]));
  for (const call of decision.calls) {
    if (seen.has(call.callId)) {
      rejected.push(rejection(call.callId, "duplicate-call-id", "工具调用标识重复"));
      continue;
    }
    seen.add(call.callId);
    const descriptor = descriptors.get(call.capabilityId);
    if (descriptor === undefined) {
      rejected.push(rejection(call.callId, "capability-not-exposed", "该能力未在当前回合开放"));
      continue;
    }
    if (call.contractVersion !== descriptor.contractVersion) {
      rejected.push(rejection(call.callId, "contract-version-mismatch", "能力合同版本不匹配"));
      continue;
    }
    const validator = inputValidators.get(call.capabilityId);
    let inputValid = false;
    try {
      inputValid = validator?.(call.input) === true;
    } catch {
      inputValid = false;
    }
    if (!inputValid) {
      rejected.push(rejection(call.callId, "invalid-input", "工具输入不符合能力合同"));
      continue;
    }
    const estimateRangeUnits = rangeEstimators.get(call.capabilityId);
    if (estimateRangeUnits !== undefined) {
      let rangeUnits: number | null = null;
      try {
        rangeUnits = estimateRangeUnits(call.input);
      } catch {
        rangeUnits = null;
      }
      if (rangeUnits === null || !Number.isSafeInteger(rangeUnits) || rangeUnits < 0) {
        rejected.push(rejection(call.callId, "invalid-input", "工具范围输入无法估算"));
        continue;
      }
      if (rangeUnits > rangeBudget) {
        rejected.push(rejection(call.callId, "range-budget-exceeded", "工具读取范围超出本次任务预算"));
        continue;
      }
    }
    accepted.push({
      kind: "tool-call",
      callId: call.callId,
      capabilityId: call.capabilityId,
      contractVersion: call.contractVersion,
      input: call.input,
      requiresApproval: descriptor.requiresApproval,
    });
    if (descriptor.requiresApproval) required.push({
      kind: "approval",
      callId: call.callId,
      capabilityId: call.capabilityId,
    });
  }
  return { acceptedActions: accepted, rejectedActions: rejected, requiredUserInput: required };
}
