export type ExternalJsonPrimitiveV1 = string | number | boolean | null;
export type ExternalJsonValueV1 = ExternalJsonPrimitiveV1 | readonly ExternalJsonValueV1[] | {
  readonly [key: string]: ExternalJsonValueV1;
};

export type ExternalAgentErrorCodeV1 =
  | "protocol-invalid"
  | "version-unsupported"
  | "plugin-unavailable"
  | "plugin-timeout"
  | "plugin-cancelled"
  | "plugin-rejected"
  | "decision-invalid"
  | "capability-not-exposed"
  | "internal-error";

export interface ExternalAgentHelloV1 {
  readonly schemaVersion: 1;
  readonly messageType: "hello";
  readonly plugin: Readonly<{ id: string; version: string; label: string }>;
  readonly protocol: Readonly<{ supportedVersions: readonly number[] }>;
  readonly features: Readonly<{
    progress: boolean;
    cancellation: boolean;
    idempotentDecide: boolean;
  }>;
  readonly limits: Readonly<{
    maxRequestBytes: number;
    maxResponseBytes: number;
    maxContextItems: number;
    maxToolCalls: number;
  }>;
}

export interface ExternalAgentContextItemV1 {
  readonly id: string;
  readonly kind: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly content: ExternalJsonValueV1;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly scope: string;
  readonly trustLevel: "authoritative" | "user-provided" | "derived" | "untrusted";
}

export interface ExternalAgentToolDescriptorV1 {
  readonly id: string;
  readonly contractVersion: number;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ExternalJsonValueV1;
  readonly requiresApproval: boolean;
}

export interface ExternalAgentTurnRequestV1 {
  readonly schemaVersion: 1;
  readonly messageType: "turn.request";
  readonly requestId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly pluginId: string;
  readonly deadlineAt: string;
  readonly goal: string;
  readonly context: Readonly<{ items: readonly ExternalAgentContextItemV1[] }>;
  readonly tools: readonly ExternalAgentToolDescriptorV1[];
  readonly maxToolCalls: number;
}

export type ExternalAgentDecisionV1 =
  | Readonly<{ kind: "message"; text: string }>
  | Readonly<{
      kind: "tool-calls";
      calls: readonly Readonly<{
        callId: string;
        capabilityId: string;
        contractVersion: number;
        input: ExternalJsonValueV1;
      }>[];
    }>
  | Readonly<{ kind: "finish"; reason: "completed" | "failed"; text: string | null }>;

export interface ExternalAgentErrorV1 {
  readonly code: ExternalAgentErrorCodeV1;
  readonly message: string;
  readonly retryable: boolean;
}

export interface ExternalAgentTurnResponseV1 {
  readonly schemaVersion: 1;
  readonly messageType: "turn.response";
  readonly requestId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly result:
    | Readonly<{ kind: "decision"; decision: ExternalAgentDecisionV1 }>
    | Readonly<{ kind: "error"; error: ExternalAgentErrorV1 }>;
}

export interface ExternalAgentCancelV1 {
  readonly schemaVersion: 1;
  readonly messageType: "turn.cancel";
  readonly requestId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly reason: "user" | "timeout" | "runtime-shutdown";
}

export type ExternalAgentMessageV1 =
  | ExternalAgentHelloV1
  | ExternalAgentTurnRequestV1
  | ExternalAgentTurnResponseV1
  | ExternalAgentCancelV1;

export const EXTERNAL_AGENT_PROTOCOL_VERSION = 1 as const;
export const EXTERNAL_AGENT_PROTOCOL_LIMITS = Object.freeze({
  maxMessageBytes: 256 * 1024,
  maxGoalLength: 8_192,
  maxStringLength: 8_192,
  maxContextItems: 128,
  maxToolCount: 64,
  maxToolCalls: 16,
  maxJsonDepth: 16,
  maxJsonNodes: 4_096,
  maxArrayLength: 1_024,
  maxContextItemBytes: 16 * 1024,
  maxContextBytes: 128 * 1024,
  maxInputBytes: 16 * 1024,
  maxSchemaBytes: 16 * 1024,
  maxTimeoutMs: 120_000,
});

export type ExternalAgentNegotiatedLimitsV1 = ExternalAgentHelloV1["limits"];

export const EXTERNAL_AGENT_ERROR_CODES_V1: readonly ExternalAgentErrorCodeV1[] = Object.freeze([
  "protocol-invalid", "version-unsupported", "plugin-unavailable", "plugin-timeout",
  "plugin-cancelled", "plugin-rejected", "decision-invalid", "capability-not-exposed", "internal-error",
]);
