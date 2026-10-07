import type { AgentProviderTurnLimitsV1, AgentProviderUsageV1 } from "./agent-provider-turn.ts";

export type AgentModelMessageV1 =
  | { readonly role: "system" | "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: readonly AgentModelContentBlockV1[] }
  | {
      readonly role: "tool";
      readonly toolCallId: string;
      readonly toolName: string;
      readonly content: string;
      readonly isError: boolean;
    };

export type AgentModelContentBlockV1 =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    };

export type AgentModelOutputBlockV1 =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly name: string;
      readonly arguments: Record<string, unknown>;
    };

export interface AgentModelStreamRequestV1 {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly modelId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly messages: readonly AgentModelMessageV1[];
  readonly tools: readonly {
    readonly name: string;
    readonly description: string;
    readonly parameters: unknown;
  }[];
  readonly limits: AgentProviderTurnLimitsV1;
}

export interface AgentModelStreamEnvelopeV1 {
  readonly schemaVersion: 1;
  readonly providerId: string;
  readonly modelId: string;
  readonly providerRequestId: string;
  readonly output: readonly AgentModelOutputBlockV1[];
  readonly usage: AgentProviderUsageV1 | null;
}

export type AgentModelStreamEventV1 = {
  readonly runId: string;
  readonly turnId: string;
  readonly sequence: number;
} & (
  | { readonly type: "response.started" }
  | { readonly type: "response.text-delta"; readonly delta: string }
  | { readonly type: "response.tool-input-delta"; readonly callId: string; readonly delta: string }
  | ({ readonly type: "response.usage" } & AgentProviderUsageV1)
  | { readonly type: "response.completed" }
  | { readonly type: "response.failed"; readonly code: string }
);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function validUsage(value: unknown): boolean {
  const usage = record(value);
  return usage !== null
    && onlyKeys(usage, ["inputTokens", "outputTokens", "totalTokens"])
    && Number.isSafeInteger(usage.inputTokens) && (usage.inputTokens as number) >= 0
    && Number.isSafeInteger(usage.outputTokens) && (usage.outputTokens as number) >= 0
    && Number.isSafeInteger(usage.totalTokens) && (usage.totalTokens as number) >= 0
    && usage.totalTokens === (usage.inputTokens as number) + (usage.outputTokens as number);
}

function validArguments(value: unknown): value is Record<string, unknown> {
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (Array.isArray(candidate)) return candidate.every(visit);
    const object = record(candidate);
    return object !== null && Object.values(object).every(visit);
  };
  return record(value) !== null && visit(value);
}

function validOutputBlock(value: unknown): value is AgentModelOutputBlockV1 {
  const block = record(value);
  if (block === null || typeof block.type !== "string") return false;
  if (block.type === "text") {
    return onlyKeys(block, ["type", "text"])
      && typeof block.text === "string" && block.text.length > 0 && block.text.length <= 32_768
      && !block.text.includes("\u0000");
  }
  return block.type === "tool-call"
    && onlyKeys(block, ["type", "callId", "name", "arguments"])
    && validText(block.callId, 256)
    && validText(block.name, 256)
    && validArguments(block.arguments);
}

export function isAgentModelStreamEnvelopeV1(value: unknown): value is AgentModelStreamEnvelopeV1 {
  const envelope = record(value);
  if (envelope === null
    || !onlyKeys(envelope, ["schemaVersion", "providerId", "modelId", "providerRequestId", "output", "usage"])
    || envelope.schemaVersion !== 1
    || !validText(envelope.providerId, 160)
    || !validText(envelope.modelId, 160)
    || !validText(envelope.providerRequestId, 256)
    || !Array.isArray(envelope.output)
    || envelope.output.length === 0
    || !envelope.output.every(validOutputBlock)) return false;
  const callIds = new Set<string>();
  for (const block of envelope.output) {
    if (block.type === "tool-call") {
      if (callIds.has(block.callId)) return false;
      callIds.add(block.callId);
    }
  }
  return envelope.usage === null || validUsage(envelope.usage);
}

export function isAgentModelStreamEventV1(value: unknown): value is AgentModelStreamEventV1 {
  const event = record(value);
  if (event === null || !validText(event.runId, 160) || !validText(event.turnId, 160)
    || !Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1
    || typeof event.type !== "string") return false;
  const base = ["type", "runId", "turnId", "sequence"] as const;
  if (event.type === "response.started" || event.type === "response.completed") return onlyKeys(event, base);
  if (event.type === "response.text-delta") {
    return onlyKeys(event, [...base, "delta"]) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.tool-input-delta") {
    return onlyKeys(event, [...base, "callId", "delta"])
      && validText(event.callId, 256) && typeof event.delta === "string" && event.delta.length > 0;
  }
  if (event.type === "response.usage") {
    return onlyKeys(event, [...base, "inputTokens", "outputTokens", "totalTokens"])
      && validUsage({ inputTokens: event.inputTokens, outputTokens: event.outputTokens, totalTokens: event.totalTokens });
  }
  return event.type === "response.failed"
    && onlyKeys(event, [...base, "code"])
    && validText(event.code, 256);
}

export function createAgentModelStreamRequestV1(
  providerId: string,
  modelId: string,
  runId: string,
  turnId: string,
  messages: readonly AgentModelMessageV1[],
  tools: AgentModelStreamRequestV1["tools"],
  limits: AgentProviderTurnLimitsV1,
): AgentModelStreamRequestV1 {
  return { schemaVersion: 1, providerId, modelId, runId, turnId, messages, tools, limits };
}
