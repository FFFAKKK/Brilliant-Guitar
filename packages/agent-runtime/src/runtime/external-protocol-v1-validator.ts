import type {
  ExternalAgentCancelV1, ExternalAgentDecisionV1, ExternalAgentErrorCodeV1,
  ExternalAgentHelloV1, ExternalAgentMessageV1, ExternalAgentNegotiatedLimitsV1,
  ExternalAgentTurnRequestV1, ExternalAgentTurnResponseV1, ExternalJsonValueV1,
} from "./external-protocol-v1.ts";
import { EXTERNAL_AGENT_ERROR_CODES_V1, EXTERNAL_AGENT_PROTOCOL_LIMITS as LIMITS } from "./external-protocol-v1.ts";

export class ExternalAgentProtocolError extends Error {
  readonly code: ExternalAgentErrorCodeV1;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(code: ExternalAgentErrorCodeV1, message: string, retryable = false, requestId: string | null = null) {
    super(message);
    this.name = "ExternalAgentProtocolError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

function invalid(message: string): never {
  throw new ExternalAgentProtocolError("protocol-invalid", message);
}

export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function text(value: unknown, max: number = LIMITS.maxStringLength): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

function id(value: unknown): value is string {
  // Context source IDs are opaque; do not impose a capability-name grammar on them.
  return text(value, 256);
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function externalJsonBytes(value: ExternalJsonValueV1): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/** Validate without invoking getters/toJSON, then copy so no shared references cross the boundary. */
export function snapshotExternalJson(value: unknown): ExternalJsonValueV1 {
  let nodes = 0;
  function copy(item: unknown, depth: number): ExternalJsonValueV1 {
    if (++nodes > LIMITS.maxJsonNodes || depth > LIMITS.maxJsonDepth) invalid("External Agent JSON exceeds structural limits");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "string") {
      if (item.length > LIMITS.maxStringLength) invalid("External Agent JSON string is too long");
      return item;
    }
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || item === null) invalid("External Agent payload must contain only JSON values");
    const proto = Object.getPrototypeOf(item);
    if (Array.isArray(item)) {
      if (proto !== Array.prototype || item.length > LIMITS.maxArrayLength) invalid("Invalid External Agent JSON array");
      const keys = Reflect.ownKeys(item);
      if (keys.length !== item.length + 1) invalid("External Agent JSON array contains holes or extra fields");
      const result: ExternalJsonValueV1[] = [];
      for (let index = 0; index < item.length; index++) {
        const field = Object.getOwnPropertyDescriptor(item, String(index));
        if (field === undefined || !field.enumerable || !("value" in field)) invalid("Invalid External Agent array field");
        result.push(copy(field.value, depth + 1));
      }
      return Object.freeze(result);
    }
    if (proto !== Object.prototype && proto !== null) invalid("External Agent payload contains a non-JSON object");
    const keys = Reflect.ownKeys(item);
    if (keys.length > LIMITS.maxJsonNodes) invalid("External Agent object contains too many fields");
    const output: Record<string, ExternalJsonValueV1> = {};
    for (const key of keys) {
      if (typeof key !== "string" || key.length > LIMITS.maxStringLength) invalid("Invalid External Agent object key");
      const field = Object.getOwnPropertyDescriptor(item, key);
      if (field === undefined || !field.enumerable || !("value" in field)) invalid("External Agent payload contains an accessor or hidden field");
      Object.defineProperty(output, key, { value: copy(field.value, depth + 1), enumerable: true });
    }
    return Object.freeze(output);
  }
  return copy(value, 0);
}

function boundedSnapshot(value: unknown, maxBytes: number): ExternalJsonValueV1 {
  const snapshot = snapshotExternalJson(value);
  if (externalJsonBytes(snapshot) > maxBytes) invalid("External Agent message is too large");
  return snapshot;
}

function envelope(value: unknown, messageType: string, maxBytes: number): Record<string, unknown> {
  const item = record(boundedSnapshot(value, maxBytes));
  if (item === null || item.messageType !== messageType) invalid(`Invalid ${messageType} message`);
  if (item.schemaVersion !== 1) throw new ExternalAgentProtocolError("version-unsupported", "Unsupported External Agent schema version");
  return item;
}

function deadline(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return false;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u, (_, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`);
  return new Date(millis).toISOString() === normalized;
}

export function validateHello(value: unknown): ExternalAgentHelloV1 {
  const item = envelope(value, "hello", LIMITS.maxMessageBytes);
  const plugin = record(item.plugin);
  const protocol = record(item.protocol);
  const features = record(item.features);
  const limits = record(item.limits);
  if (!onlyKeys(item, ["schemaVersion", "messageType", "plugin", "protocol", "features", "limits"])
    || plugin === null || !onlyKeys(plugin, ["id", "version", "label"])
    || !id(plugin.id) || !text(plugin.version, 80) || !text(plugin.label, 160)
    || protocol === null || !onlyKeys(protocol, ["supportedVersions"])
    || !Array.isArray(protocol.supportedVersions) || protocol.supportedVersions.length === 0
    || protocol.supportedVersions.length > 16 || !protocol.supportedVersions.every(positive)
    || new Set(protocol.supportedVersions).size !== protocol.supportedVersions.length
    || features === null || !onlyKeys(features, ["progress", "cancellation", "idempotentDecide"])
    || !Object.values(features).every((entry) => typeof entry === "boolean")
    || limits === null || !onlyKeys(limits, ["maxRequestBytes", "maxResponseBytes", "maxContextItems", "maxToolCalls"])
    || !Object.values(limits).every(positive)) invalid("Invalid External Agent hello");
  return item as unknown as ExternalAgentHelloV1;
}

export function negotiateExternalLimits(hello: ExternalAgentHelloV1): ExternalAgentNegotiatedLimitsV1 {
  if (!hello.protocol.supportedVersions.includes(1)) {
    throw new ExternalAgentProtocolError("version-unsupported", "External Agent Protocol v1 is not supported");
  }
  return Object.freeze({
    maxRequestBytes: Math.min(hello.limits.maxRequestBytes, LIMITS.maxMessageBytes),
    maxResponseBytes: Math.min(hello.limits.maxResponseBytes, LIMITS.maxMessageBytes),
    maxContextItems: Math.min(hello.limits.maxContextItems, LIMITS.maxContextItems),
    maxToolCalls: Math.min(hello.limits.maxToolCalls, LIMITS.maxToolCalls),
  });
}

/** Data-only schema subset; Controller capability validators remain the semantic authority. */
function inputSchema(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  const schema = record(value);
  if (schema === null) return false;
  const allowed = ["type", "properties", "required", "additionalProperties", "items", "enum", "const",
    "oneOf", "anyOf", "allOf", "minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum",
    "exclusiveMaximum", "minItems", "maxItems", "minProperties", "maxProperties", "description", "title"];
  for (const [key, entry] of Object.entries(schema)) {
    if (!allowed.includes(key)) return false;
    if (key === "type" && !["object", "array", "string", "number", "integer", "boolean", "null"].includes(String(entry))) return false;
    if (key === "properties") {
      const properties = record(entry);
      if (properties === null || !Object.values(properties).every(inputSchema)) return false;
    }
    if (key === "items" && !inputSchema(entry)) return false;
    if (key === "required" && (!Array.isArray(entry) || !entry.every((field) => text(field, 256))
      || new Set(entry).size !== entry.length)) return false;
    if (key === "additionalProperties" && typeof entry !== "boolean") return false;
    if (["oneOf", "anyOf", "allOf"].includes(key)
      && (!Array.isArray(entry) || entry.length === 0 || !entry.every(inputSchema))) return false;
    if (key === "enum" && (!Array.isArray(entry) || entry.length === 0)) return false;
    if (["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"].includes(key) && !nonnegative(entry)) return false;
    if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"].includes(key) && typeof entry !== "number") return false;
    if (["description", "title"].includes(key) && typeof entry !== "string") return false;
  }
  return true;
}

function contextItem(value: unknown): boolean {
  const item = record(value);
  return item !== null
    && onlyKeys(item, ["id", "kind", "sourceType", "sourceId", "content", "documentId", "documentVersion", "scope", "trustLevel"])
    && id(item.id) && text(item.kind, 80) && text(item.sourceType, 160) && id(item.sourceId)
    && (item.documentId === null && item.documentVersion === null
      || id(item.documentId) && (item.documentVersion === null || nonnegative(item.documentVersion)))
    && text(item.scope, 256)
    && ["authoritative", "user-provided", "derived", "untrusted"].includes(String(item.trustLevel))
    && externalJsonBytes(item.content as ExternalJsonValueV1) <= LIMITS.maxContextItemBytes;
}

function tool(value: unknown): boolean {
  const item = record(value);
  return item !== null && onlyKeys(item, ["id", "contractVersion", "name", "description", "inputSchema", "requiresApproval"])
    && id(item.id) && positive(item.contractVersion) && text(item.name, 160) && text(item.description)
    && inputSchema(item.inputSchema) && externalJsonBytes(item.inputSchema as ExternalJsonValueV1) <= LIMITS.maxSchemaBytes
    && typeof item.requiresApproval === "boolean";
}

export function validateTurnRequest(value: unknown, limits?: ExternalAgentNegotiatedLimitsV1): ExternalAgentTurnRequestV1 {
  const item = envelope(value, "turn.request", limits?.maxRequestBytes ?? LIMITS.maxMessageBytes);
  const context = record(item.context);
  if (!onlyKeys(item, ["schemaVersion", "messageType", "requestId", "runId", "turnId", "pluginId", "deadlineAt", "goal", "context", "tools", "maxToolCalls"])
    || !id(item.requestId) || !id(item.runId) || !id(item.turnId) || !id(item.pluginId)
    || !deadline(item.deadlineAt) || typeof item.goal !== "string" || !item.goal.trim()
    || item.goal.length > LIMITS.maxGoalLength
    || context === null || !onlyKeys(context, ["items"])
    || !Array.isArray(context.items) || context.items.length > (limits?.maxContextItems ?? LIMITS.maxContextItems)
    || !context.items.every(contextItem)
    || new Set(context.items.map((entry) => (entry as Record<string, unknown>).id)).size !== context.items.length
    || externalJsonBytes(context.items as ExternalJsonValueV1) > LIMITS.maxContextBytes
    || !Array.isArray(item.tools) || item.tools.length > LIMITS.maxToolCount || !item.tools.every(tool)
    || new Set(item.tools.map((entry) => (entry as Record<string, unknown>).id)).size !== item.tools.length
    || !nonnegative(item.maxToolCalls) || item.maxToolCalls > (limits?.maxToolCalls ?? LIMITS.maxToolCalls)) {
    invalid("Invalid External Agent turn request");
  }
  return item as unknown as ExternalAgentTurnRequestV1;
}

export function validateExternalDecision(value: unknown, maxCalls: number = LIMITS.maxToolCalls): ExternalAgentDecisionV1 {
  const item = record(boundedSnapshot(value, LIMITS.maxMessageBytes));
  if (item !== null) {
    if (item.kind === "message" && onlyKeys(item, ["kind", "text"])
      && typeof item.text === "string" && item.text.trim().length > 0) return item as unknown as ExternalAgentDecisionV1;
    if (item.kind === "finish" && onlyKeys(item, ["kind", "reason", "text"])
      && (item.reason === "completed" || item.reason === "failed")
      && (item.text === null || typeof item.text === "string")) return item as unknown as ExternalAgentDecisionV1;
    if (item.kind === "tool-calls" && onlyKeys(item, ["kind", "calls"])
      && Array.isArray(item.calls) && item.calls.length > 0 && item.calls.length <= maxCalls) {
      const ids = new Set<string>();
      if (item.calls.every((valueCall) => {
        const call = record(valueCall);
        if (call === null || !onlyKeys(call, ["callId", "capabilityId", "contractVersion", "input"])
          || !id(call.callId) || ids.has(call.callId) || !id(call.capabilityId) || !positive(call.contractVersion)
          || externalJsonBytes(call.input as ExternalJsonValueV1) > LIMITS.maxInputBytes) return false;
        ids.add(call.callId);
        return true;
      })) return item as unknown as ExternalAgentDecisionV1;
    }
  }
  throw new ExternalAgentProtocolError("decision-invalid", "Invalid External Agent decision");
}

export function validateTurnResponse(value: unknown, limits?: ExternalAgentNegotiatedLimitsV1): ExternalAgentTurnResponseV1 {
  const item = envelope(value, "turn.response", limits?.maxResponseBytes ?? LIMITS.maxMessageBytes);
  const result = record(item.result);
  if (!onlyKeys(item, ["schemaVersion", "messageType", "requestId", "runId", "turnId", "result"])
    || !id(item.requestId) || !id(item.runId) || !id(item.turnId) || result === null) invalid("Invalid External Agent turn response");
  if (result.kind === "decision" && onlyKeys(result, ["kind", "decision"])) {
    validateExternalDecision(result.decision, limits?.maxToolCalls);
    return item as unknown as ExternalAgentTurnResponseV1;
  }
  const error = record(result.error);
  if (result.kind !== "error" || !onlyKeys(result, ["kind", "error"]) || error === null
    || !onlyKeys(error, ["code", "message", "retryable"])
    || !EXTERNAL_AGENT_ERROR_CODES_V1.includes(error.code as ExternalAgentErrorCodeV1)
    || !text(error.message, 512) || typeof error.retryable !== "boolean") invalid("Invalid External Agent error response");
  return item as unknown as ExternalAgentTurnResponseV1;
}

export function validateCancel(value: unknown): ExternalAgentCancelV1 {
  const item = envelope(value, "turn.cancel", LIMITS.maxMessageBytes);
  if (!onlyKeys(item, ["schemaVersion", "messageType", "requestId", "runId", "turnId", "reason"])
    || !id(item.requestId) || !id(item.runId) || !id(item.turnId)
    || !["user", "timeout", "runtime-shutdown"].includes(String(item.reason))) invalid("Invalid External Agent cancel");
  return item as unknown as ExternalAgentCancelV1;
}

export function validateMessage(value: unknown, limits?: ExternalAgentNegotiatedLimitsV1): ExternalAgentMessageV1 {
  const snapshot = snapshotExternalJson(value);
  switch (record(snapshot)?.messageType) {
    case "hello": return validateHello(snapshot);
    case "turn.request": return validateTurnRequest(snapshot, limits);
    case "turn.response": return validateTurnResponse(snapshot, limits);
    case "turn.cancel": return validateCancel(snapshot);
    default: return invalid("Unknown External Agent message type");
  }
}

export function encodeExternalMessage(value: unknown, limits?: ExternalAgentNegotiatedLimitsV1): string {
  return JSON.stringify(validateMessage(value, limits));
}

export function decodeExternalMessage(wire: unknown, maxBytes: number = LIMITS.maxMessageBytes,
  limits?: ExternalAgentNegotiatedLimitsV1): ExternalAgentMessageV1 {
  if (typeof wire !== "string" || new TextEncoder().encode(wire).byteLength > Math.min(maxBytes, LIMITS.maxMessageBytes)) {
    invalid("External Agent message is too large or is not JSON text");
  }
  let value: unknown;
  try { value = JSON.parse(wire); } catch { return invalid("Malformed External Agent JSON"); }
  return validateMessage(value, limits);
}
