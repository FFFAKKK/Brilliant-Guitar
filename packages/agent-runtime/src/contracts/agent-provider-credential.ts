import { isAgentProviderId } from "./agent-provider-settings.ts";

export type AgentProviderCredentialStatus = "configured" | "missing" | "unavailable";

export interface AgentProviderCredentialSnapshot {
  readonly providerId: string;
  readonly present: boolean;
  readonly status: AgentProviderCredentialStatus;
  readonly message: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isAgentProviderCredentialSnapshot(value: unknown): value is AgentProviderCredentialSnapshot {
  const snapshot = record(value);
  return snapshot !== null
    && onlyKeys(snapshot, ["providerId", "present", "status", "message"])
    && isAgentProviderId(snapshot.providerId)
    && typeof snapshot.present === "boolean"
    && (snapshot.status === "configured" || snapshot.status === "missing" || snapshot.status === "unavailable")
    && ((snapshot.status === "configured") === snapshot.present)
    && typeof snapshot.message === "string" && snapshot.message.length > 0 && snapshot.message.length <= 240;
}

export function isAgentProviderCredentialSecret(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && new TextEncoder().encode(value).length <= 5 * 512
    && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

export function unavailableAgentProviderCredential(providerId: string): AgentProviderCredentialSnapshot {
  return Object.freeze({
    providerId,
    present: false,
    status: "unavailable",
    message: "系统凭据库仅在桌面宿主中可用",
  });
}
