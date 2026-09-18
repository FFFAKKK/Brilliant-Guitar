export interface CapabilityTransportRequest {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly workspaceId: string;
  readonly input: unknown;
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

export interface ScoreSummaryV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly title: string;
  readonly measureCount: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isScoreSummaryV1(value: unknown): value is ScoreSummaryV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["documentId", "documentVersion", "title", "measureCount"])
    && typeof item.documentId === "string" && item.documentId.length > 0
    && isNonNegativeSafeInteger(item.documentVersion)
    && typeof item.title === "string"
    && isNonNegativeSafeInteger(item.measureCount);
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
