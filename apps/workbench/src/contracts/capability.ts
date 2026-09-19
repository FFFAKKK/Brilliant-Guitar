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

export interface ScoreUpdateTitleInputV1 {
  readonly title: string;
}

export interface ScoreTitleUpdateV1 {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly previousTitle: string;
  readonly title: string;
  readonly undoAvailable: boolean;
}

export interface ScorePrepareTempoChangeInputV1 {
  readonly tempoBpm: number;
}

export interface ScoreTempoChangeSetV1 {
  readonly changeSetId: string;
  readonly kind: "score-tempo";
  readonly documentId: string;
  readonly baseDocumentVersion: number;
  readonly beforeTempoBpm: number;
  readonly afterTempoBpm: number;
}

export interface ScoreCommitTempoChangeInputV1 {
  readonly changeSet: ScoreTempoChangeSetV1;
}

export interface ScoreTempoUpdateV1 {
  readonly changeSetId: string;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly previousTempoBpm: number;
  readonly tempoBpm: number;
  readonly undoAvailable: boolean;
}

export interface ScoreUpdateMetadataInputV1 {
  readonly title?: string;
  readonly tempoBpm?: number;
}

export interface ScoreMetadataSnapshotV1 {
  readonly title: string;
  readonly tempoBpm: number;
}

export type ScoreMetadataTransactionOperationV1 = "set-title" | "set-tempo";

export interface ScoreMetadataTransactionChangeSetV1 {
  readonly changeSetId: string;
  readonly kind: "score-metadata-transaction";
  readonly documentId: string;
  readonly baseDocumentVersion: number;
  readonly operations: readonly ScoreMetadataTransactionOperationV1[];
  readonly before: ScoreMetadataSnapshotV1;
  readonly after: ScoreMetadataSnapshotV1;
}

export interface ScoreCommitMetadataTransactionInputV1 {
  readonly changeSet: ScoreMetadataTransactionChangeSetV1;
}

export interface ScoreMetadataTransactionUpdateV1 {
  readonly changeSetId: string;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly appliedOperations: readonly ScoreMetadataTransactionOperationV1[];
  readonly previous: ScoreMetadataSnapshotV1;
  readonly current: ScoreMetadataSnapshotV1;
  readonly undoAvailable: boolean;
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

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

export function isScoreUpdateTitleInputV1(value: unknown): value is ScoreUpdateTitleInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["title"])
    && typeof item.title === "string"
    && item.title === item.title.trim()
    && item.title.length > 0
    && item.title.length <= 120;
}

export function isScoreTitleUpdateV1(value: unknown): value is ScoreTitleUpdateV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["documentId", "documentVersion", "previousTitle", "title", "undoAvailable"])
    && isStableCapabilityId(item.documentId)
    && isNonNegativeSafeInteger(item.documentVersion)
    && typeof item.previousTitle === "string"
    && typeof item.title === "string"
    && item.title.length > 0
    && item.title.length <= 120
    && typeof item.undoAvailable === "boolean";
}

export function isScorePrepareTempoChangeInputV1(
  value: unknown,
): value is ScorePrepareTempoChangeInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["tempoBpm"])
    && isFinitePositiveNumber(item.tempoBpm);
}

export function isScoreTempoChangeSetV1(value: unknown): value is ScoreTempoChangeSetV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, [
      "changeSetId",
      "kind",
      "documentId",
      "baseDocumentVersion",
      "beforeTempoBpm",
      "afterTempoBpm",
    ])
    && typeof item.changeSetId === "string"
    && /^sha256:[0-9a-f]{64}$/.test(item.changeSetId)
    && item.kind === "score-tempo"
    && isStableCapabilityId(item.documentId)
    && isNonNegativeSafeInteger(item.baseDocumentVersion)
    && isFinitePositiveNumber(item.beforeTempoBpm)
    && isFinitePositiveNumber(item.afterTempoBpm)
    && item.beforeTempoBpm !== item.afterTempoBpm;
}

export function isScoreCommitTempoChangeInputV1(
  value: unknown,
): value is ScoreCommitTempoChangeInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["changeSet"])
    && isScoreTempoChangeSetV1(item.changeSet);
}

export function isScoreTempoUpdateV1(value: unknown): value is ScoreTempoUpdateV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, [
      "changeSetId",
      "documentId",
      "documentVersion",
      "previousTempoBpm",
      "tempoBpm",
      "undoAvailable",
    ])
    && typeof item.changeSetId === "string"
    && /^sha256:[0-9a-f]{64}$/.test(item.changeSetId)
    && isStableCapabilityId(item.documentId)
    && isNonNegativeSafeInteger(item.documentVersion)
    && isFinitePositiveNumber(item.previousTempoBpm)
    && isFinitePositiveNumber(item.tempoBpm)
    && typeof item.undoAvailable === "boolean";
}

export function isScoreUpdateMetadataInputV1(value: unknown): value is ScoreUpdateMetadataInputV1 {
  const item = record(value);
  if (item === undefined) return false;
  const keys = Object.keys(item);
  return keys.length >= 1
    && keys.length <= 2
    && keys.every((key) => key === "title" || key === "tempoBpm")
    && (!Object.prototype.hasOwnProperty.call(item, "title")
      || typeof item.title === "string"
        && item.title === item.title.trim()
        && item.title.length > 0
        && item.title.length <= 120)
    && (!Object.prototype.hasOwnProperty.call(item, "tempoBpm")
      || isFinitePositiveNumber(item.tempoBpm));
}

export function isScoreMetadataSnapshotV1(value: unknown): value is ScoreMetadataSnapshotV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["title", "tempoBpm"])
    && typeof item.title === "string"
    && item.title === item.title.trim()
    && item.title.length > 0
    && item.title.length <= 120
    && isFinitePositiveNumber(item.tempoBpm);
}

function metadataTransactionOperations(
  before: ScoreMetadataSnapshotV1,
  after: ScoreMetadataSnapshotV1,
): readonly ScoreMetadataTransactionOperationV1[] {
  const operations: ScoreMetadataTransactionOperationV1[] = [];
  if (before.title !== after.title) operations.push("set-title");
  if (before.tempoBpm !== after.tempoBpm) operations.push("set-tempo");
  return operations;
}

export function isScoreMetadataTransactionChangeSetV1(
  value: unknown,
): value is ScoreMetadataTransactionChangeSetV1 {
  const item = record(value);
  if (item === undefined
    || !hasOnlyKeys(item, [
      "changeSetId",
      "kind",
      "documentId",
      "baseDocumentVersion",
      "operations",
      "before",
      "after",
    ])
    || typeof item.changeSetId !== "string"
    || !/^sha256:[0-9a-f]{64}$/.test(item.changeSetId)
    || item.kind !== "score-metadata-transaction"
    || !isStableCapabilityId(item.documentId)
    || !isNonNegativeSafeInteger(item.baseDocumentVersion)
    || !Array.isArray(item.operations)
    || !isScoreMetadataSnapshotV1(item.before)
    || !isScoreMetadataSnapshotV1(item.after)) return false;
  const expected = metadataTransactionOperations(item.before, item.after);
  return expected.length > 0
    && item.operations.length === expected.length
    && item.operations.every((operation, index) => operation === expected[index]);
}

export function isScoreCommitMetadataTransactionInputV1(
  value: unknown,
): value is ScoreCommitMetadataTransactionInputV1 {
  const item = record(value);
  return item !== undefined
    && hasOnlyKeys(item, ["changeSet"])
    && isScoreMetadataTransactionChangeSetV1(item.changeSet);
}

export function isScoreMetadataTransactionUpdateV1(
  value: unknown,
): value is ScoreMetadataTransactionUpdateV1 {
  const item = record(value);
  if (item === undefined
    || !hasOnlyKeys(item, [
      "changeSetId",
      "documentId",
      "documentVersion",
      "appliedOperations",
      "previous",
      "current",
      "undoAvailable",
    ])
    || typeof item.changeSetId !== "string"
    || !/^sha256:[0-9a-f]{64}$/.test(item.changeSetId)
    || !isStableCapabilityId(item.documentId)
    || !isNonNegativeSafeInteger(item.documentVersion)
    || !Array.isArray(item.appliedOperations)
    || !isScoreMetadataSnapshotV1(item.previous)
    || !isScoreMetadataSnapshotV1(item.current)
    || typeof item.undoAvailable !== "boolean") return false;
  const expected = metadataTransactionOperations(item.previous, item.current);
  return expected.length > 0
    && item.appliedOperations.length === expected.length
    && item.appliedOperations.every((operation, index) => operation === expected[index]);
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
