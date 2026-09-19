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

export interface ScoreMetadataV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempoBpm: number;
}

export interface ScoreStructureV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly measureCount: number;
  readonly partCount: number;
  readonly staffCount: number;
}

export interface ScoreMeasureIndexInputV1 {
  readonly expectedDocumentId: string;
  readonly expectedDocumentVersion: number;
}

export interface ScoreMeasureIndexV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly measureIds: readonly string[];
}

export interface ScoreMeasureRangeInputV1 {
  readonly startMeasureId: string;
  readonly endMeasureId: string;
  readonly maxMeasures: number;
}

export type ScoreMeasureReferenceV1 =
  | {
      readonly kind: "stable-id-range";
      readonly startMeasureId: string;
      readonly endMeasureId: string;
    }
  | {
      readonly kind: "ordinal-range";
      readonly startOrdinal: number;
      readonly endOrdinal: number;
    }
  | { readonly kind: "current-selection" };

export interface ScoreReadMeasuresInputV1 {
  readonly reference: ScoreMeasureReferenceV1;
}

export interface ScoreMeasureRangeMeasureV1 {
  readonly measureId: string;
  readonly meter: {
    readonly numerator: number;
    readonly denominator: number;
  };
  readonly pickupDuration: {
    readonly numerator: number;
    readonly denominator: number;
  } | null;
}

export interface ScoreMeasureRangeV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly startMeasureId: string;
  readonly endMeasureId: string;
  readonly measureCount: number;
  readonly measures: readonly ScoreMeasureRangeMeasureV1[];
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

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStableCapabilityId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isExactFraction(value: unknown): value is { readonly numerator: number; readonly denominator: number } {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["numerator", "denominator"])
    && typeof item.numerator === "number" && Number.isSafeInteger(item.numerator)
    && isPositiveSafeInteger(item.denominator);
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

export function isScoreMetadataV1(value: unknown): value is ScoreMetadataV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["documentId", "documentVersion", "title", "authors", "tempoBpm"])
    && typeof item.documentId === "string" && item.documentId.length > 0
    && isNonNegativeSafeInteger(item.documentVersion)
    && typeof item.title === "string"
    && Array.isArray(item.authors)
    && item.authors.every((author) => typeof author === "string")
    && isFiniteNonNegativeNumber(item.tempoBpm);
}

export function isScoreStructureV1(value: unknown): value is ScoreStructureV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["documentId", "documentVersion", "measureCount", "partCount", "staffCount"])
    && typeof item.documentId === "string" && item.documentId.length > 0
    && isNonNegativeSafeInteger(item.documentVersion)
    && isNonNegativeSafeInteger(item.measureCount)
    && isNonNegativeSafeInteger(item.partCount)
    && isNonNegativeSafeInteger(item.staffCount);
}

export function isScoreMeasureIndexInputV1(value: unknown): value is ScoreMeasureIndexInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["expectedDocumentId", "expectedDocumentVersion"])
    && isStableCapabilityId(item.expectedDocumentId)
    && isNonNegativeSafeInteger(item.expectedDocumentVersion);
}

export function isScoreMeasureIndexV1(value: unknown): value is ScoreMeasureIndexV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["documentId", "documentVersion", "measureIds"])
    && isStableCapabilityId(item.documentId)
    && isNonNegativeSafeInteger(item.documentVersion)
    && Array.isArray(item.measureIds)
    && item.measureIds.length > 0
    && item.measureIds.every(isStableCapabilityId)
    && new Set(item.measureIds).size === item.measureIds.length;
}

export function isScoreMeasureRangeInputV1(value: unknown): value is ScoreMeasureRangeInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["startMeasureId", "endMeasureId", "maxMeasures"])
    && isStableCapabilityId(item.startMeasureId)
    && isStableCapabilityId(item.endMeasureId)
    && isPositiveSafeInteger(item.maxMeasures)
    && item.maxMeasures <= 32;
}

export function isScoreMeasureReferenceV1(value: unknown): value is ScoreMeasureReferenceV1 {
  const item = record(value);
  if (item === undefined || typeof item.kind !== "string") return false;
  if (item.kind === "stable-id-range") {
    return hasOnlyKeys(item, ["kind", "startMeasureId", "endMeasureId"])
      && isStableCapabilityId(item.startMeasureId)
      && isStableCapabilityId(item.endMeasureId);
  }
  if (item.kind === "ordinal-range") {
    return hasOnlyKeys(item, ["kind", "startOrdinal", "endOrdinal"])
      && isPositiveSafeInteger(item.startOrdinal)
      && isPositiveSafeInteger(item.endOrdinal);
  }
  return item.kind === "current-selection" && hasOnlyKeys(item, ["kind"]);
}

export function isScoreReadMeasuresInputV1(value: unknown): value is ScoreReadMeasuresInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["reference"])
    && isScoreMeasureReferenceV1(item.reference);
}

function isScoreMeasureRangeMeasureV1(value: unknown): value is ScoreMeasureRangeMeasureV1 {
  const item = record(value);
  if (item === undefined
    || !hasOnlyKeys(item, ["measureId", "meter", "pickupDuration"])
    || !isStableCapabilityId(item.measureId)) return false;
  const meter = record(item.meter);
  return meter !== undefined
    && hasOnlyKeys(meter, ["numerator", "denominator"])
    && isPositiveSafeInteger(meter.numerator)
    && isPositiveSafeInteger(meter.denominator)
    && (item.pickupDuration === null || isExactFraction(item.pickupDuration));
}

export function isScoreMeasureRangeV1(value: unknown): value is ScoreMeasureRangeV1 {
  const item = record(value);
  if (item === undefined
    || !hasOnlyKeys(item, [
      "documentId",
      "documentVersion",
      "startMeasureId",
      "endMeasureId",
      "measureCount",
      "measures",
    ])
    || !isStableCapabilityId(item.documentId)
    || !isNonNegativeSafeInteger(item.documentVersion)
    || !isStableCapabilityId(item.startMeasureId)
    || !isStableCapabilityId(item.endMeasureId)
    || !isPositiveSafeInteger(item.measureCount)
    || item.measureCount > 32
    || !Array.isArray(item.measures)
    || item.measures.length !== item.measureCount
    || !item.measures.every(isScoreMeasureRangeMeasureV1)) return false;
  const measureIds = item.measures.map((measure) => measure.measureId);
  return new Set(measureIds).size === measureIds.length
    && measureIds[0] === item.startMeasureId
    && measureIds.at(-1) === item.endMeasureId;
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
