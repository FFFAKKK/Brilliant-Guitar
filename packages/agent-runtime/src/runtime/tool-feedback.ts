import type { AgentContextItem, AgentToolCall } from "./agent-contracts.ts";
import type { CapabilityResult } from "../contracts/capability.ts";

/** Controller-created feedback, never inferred from user or resource text. Not persisted. */
export interface AgentToolFeedbackCall {
  readonly call: AgentToolCall;
  readonly invocationId: string;
  readonly result: Extract<CapabilityResult<unknown>, { readonly status: "completed" }>;
  readonly source: Omit<AgentContextItem, "content" | "estimatedTokens">;
}

export interface AgentToolFeedbackGroup {
  readonly runId: string;
  readonly turnId: string;
  readonly calls: readonly AgentToolFeedbackCall[];
}

export function snapshotToolFeedback(groups: readonly AgentToolFeedbackGroup[]): readonly AgentToolFeedbackGroup[] {
  return snapshotAgentValue(groups);
}

/** Detached immutable in-process data; never use for ports or executable descriptors. */
export function snapshotAgentValue<T>(value: T): T {
  const copy = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  };
  freeze(copy);
  return copy;
}
