export interface CapabilityTransportRequest {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly workspaceId: string;
  readonly documentPrecondition: CapabilityDocumentPrecondition | null;
  readonly input: unknown;
}

export interface CapabilityDocumentPrecondition {
  readonly documentId: string;
  readonly documentVersion: number;
}

export type CapabilityDocumentMatch = "exact" | "same-document";

/**
 * A capability may return a document-scoped projection. When it does, the
 * projection must remain inside the request's document scope.
 */
export function matchesCapabilityDocumentPrecondition(
  value: unknown,
  expected: CapabilityDocumentPrecondition | null | undefined,
  match: CapabilityDocumentMatch = "exact",
): boolean {
  if (expected === null || expected === undefined
    || typeof value !== "object" || value === null || Array.isArray(value)) return true;
  const candidate = value as Record<string, unknown>;
  const hasDocumentId = Object.prototype.hasOwnProperty.call(candidate, "documentId");
  const hasDocumentVersion = Object.prototype.hasOwnProperty.call(candidate, "documentVersion");
  if (!hasDocumentId && !hasDocumentVersion) return true;
  return typeof candidate.documentId === "string"
    && typeof candidate.documentVersion === "number"
    && Number.isSafeInteger(candidate.documentVersion)
    && candidate.documentVersion >= 0
    && candidate.documentId === expected.documentId
    && (match === "same-document" || candidate.documentVersion === expected.documentVersion);
}

interface CapabilityIdentity {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
}

export type CapabilityResult<T> =
  | (CapabilityIdentity & { readonly status: "completed"; readonly data: T })
  | (CapabilityIdentity & {
      readonly status: "unavailable" | "rejected" | "failed";
      readonly code: string;
      readonly message: string;
    });

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

export function isCapabilityResult<T>(
  value: unknown,
  isData: (data: unknown) => data is T,
): value is CapabilityResult<T> {
  const item = record(value);
  if (item === undefined
    || typeof item.invocationId !== "string"
    || typeof item.capabilityId !== "string"
    || !Number.isSafeInteger(item.contractVersion)
    || typeof item.status !== "string") return false;
  if (item.status === "completed") {
    return hasOnlyKeys(item, ["status", "invocationId", "capabilityId", "contractVersion", "data"])
      && isData(item.data);
  }
  if (item.status === "unavailable" || item.status === "rejected" || item.status === "failed") {
    return hasOnlyKeys(item, ["status", "invocationId", "capabilityId", "contractVersion", "code", "message"])
      && typeof item.code === "string" && item.code.length > 0
      && typeof item.message === "string" && item.message.length > 0;
  }
  return false;
}
