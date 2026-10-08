import { DEFAULT_MODEL_INPUT_TOKEN_BUDGET } from "./model-input.ts";

/** Host policy, independent of routing configuration and provider-reported capacity. */
export interface ModelInputPolicyV1 {
  readonly schemaVersion: 1;
  readonly inputTokenBudget: number;
  readonly declaredContextWindow: number | null;
}

export const MODEL_INPUT_OUTPUT_RESERVE = 1500;
export const DEFAULT_MODEL_INPUT_POLICY: ModelInputPolicyV1 = Object.freeze({
  schemaVersion: 1, inputTokenBudget: DEFAULT_MODEL_INPUT_TOKEN_BUDGET, declaredContextWindow: null,
});

export function parseModelInputTokenBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1024 || value > 65536) {
    throw new Error("输入估算预算需为1024到65536之间的整数");
  }
  return value;
}

export function parseModelInputPolicy(value: unknown): ModelInputPolicyV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("输入策略格式无效");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 3 || !["schemaVersion", "inputTokenBudget", "declaredContextWindow"].every((key) => Object.hasOwn(item, key))
    || item.schemaVersion !== 1) throw new Error("输入策略版本或字段无效");
  const inputTokenBudget = parseModelInputTokenBudget(item.inputTokenBudget);
  const capacity = item.declaredContextWindow;
  if (capacity !== null && (typeof capacity !== "number" || !Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1048576)) {
    throw new Error("用户声明的上下文容量需为1到1048576之间的整数，或留空表示未知");
  }
  if (capacity !== null && inputTokenBudget + MODEL_INPUT_OUTPUT_RESERVE > capacity) {
    throw new Error("输入估算预算加1500输出预留不能超过用户声明的上下文容量");
  }
  return Object.freeze({ schemaVersion: 1, inputTokenBudget, declaredContextWindow: capacity });
}
