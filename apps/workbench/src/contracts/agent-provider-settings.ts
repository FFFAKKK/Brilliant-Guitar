export interface AgentProviderSelection {
  readonly providerId: string;
  readonly modelId: string;
}

const providerIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && value.trim() === value
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

/** Persisted non-secret model choice. Credentials deliberately live outside application settings. */
export function isAgentProviderId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && providerIdPattern.test(value);
}

export function isAgentProviderSelection(value: unknown): value is AgentProviderSelection {
  const selection = record(value);
  return selection !== null
    && onlyKeys(selection, ["providerId", "modelId"])
    && isAgentProviderId(selection.providerId)
    && validText(selection.modelId, 160);
}

export function sameAgentProviderSelection(
  left: AgentProviderSelection | null,
  right: AgentProviderSelection | null,
): boolean {
  return left === right || (left !== null && right !== null
    && left.providerId === right.providerId && left.modelId === right.modelId);
}
