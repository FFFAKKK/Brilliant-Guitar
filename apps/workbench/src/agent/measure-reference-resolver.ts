import type {
  ScoreMeasureRangeInputV1,
  ScoreMeasureReferenceV1,
} from "../contracts/capability.ts";
import type { AgentMeasureSelection } from "./agent-contracts.ts";

export type MeasureReference = ScoreMeasureReferenceV1;

export interface MeasureIndexSnapshot {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly measureIds: readonly string[];
}

export type MeasureSelectionSnapshot = AgentMeasureSelection;

export interface MeasureReferenceResolutionRequest {
  readonly reference: MeasureReference;
  readonly index: MeasureIndexSnapshot;
  readonly selection: MeasureSelectionSnapshot | null;
  readonly rangeBudget: number;
}

export type MeasureReferenceResolutionCode =
  | "invalid-index"
  | "invalid-reference"
  | "measure-not-found"
  | "ordinal-out-of-range"
  | "selection-unavailable"
  | "selection-stale"
  | "range-budget-exceeded";

export type MeasureReferenceResolution =
  | {
      readonly status: "resolved";
      readonly source: MeasureReference["kind"];
      readonly documentId: string;
      readonly documentVersion: number;
      readonly startOrdinal: number;
      readonly endOrdinal: number;
      readonly measureCount: number;
      readonly input: ScoreMeasureRangeInputV1;
    }
  | {
      readonly status: "unresolved";
      readonly code: MeasureReferenceResolutionCode;
      readonly message: string;
      readonly retryable: boolean;
    };

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validOrdinal(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function unresolved(
  code: MeasureReferenceResolutionCode,
  message: string,
  retryable = false,
): MeasureReferenceResolution {
  return Object.freeze({ status: "unresolved", code, message, retryable });
}

function validIndex(index: MeasureIndexSnapshot): boolean {
  return validId(index.documentId)
    && validVersion(index.documentVersion)
    && index.measureIds.length > 0
    && index.measureIds.every(validId)
    && new Set(index.measureIds).size === index.measureIds.length;
}

interface EndpointIndices {
  readonly startIndex: number;
  readonly endIndex: number;
}

function stableIdEndpoints(
  index: MeasureIndexSnapshot,
  startMeasureId: string,
  endMeasureId: string,
): EndpointIndices | MeasureReferenceResolution {
  if (!validId(startMeasureId) || !validId(endMeasureId)) {
    return unresolved("invalid-reference", "小节标识引用无效");
  }
  const startIndex = index.measureIds.indexOf(startMeasureId);
  const endIndex = index.measureIds.indexOf(endMeasureId);
  if (startIndex < 0 || endIndex < 0) {
    return unresolved("measure-not-found", "引用的小节不在当前文档中");
  }
  return { startIndex, endIndex };
}

function ordinalEndpoints(
  index: MeasureIndexSnapshot,
  startOrdinal: number,
  endOrdinal: number,
): EndpointIndices | MeasureReferenceResolution {
  if (!validOrdinal(startOrdinal) || !validOrdinal(endOrdinal)) {
    return unresolved("invalid-reference", "小节序号必须是正整数");
  }
  if (startOrdinal > index.measureIds.length || endOrdinal > index.measureIds.length) {
    return unresolved("ordinal-out-of-range", "小节序号超出当前乐谱范围");
  }
  return { startIndex: startOrdinal - 1, endIndex: endOrdinal - 1 };
}

function selectionEndpoints(
  index: MeasureIndexSnapshot,
  selection: MeasureSelectionSnapshot | null,
): EndpointIndices | MeasureReferenceResolution {
  if (selection === null) {
    return unresolved("selection-unavailable", "当前没有可用于任务的小节选择区");
  }
  if (selection.documentId !== index.documentId
    || selection.documentVersion !== index.documentVersion) {
    return unresolved("selection-stale", "当前选择区来自其他文档版本", true);
  }
  return stableIdEndpoints(index, selection.startMeasureId, selection.endMeasureId);
}

/** Resolves user-facing measure references against one version-bound authoritative index. */
export function resolveMeasureReference(
  request: MeasureReferenceResolutionRequest,
): MeasureReferenceResolution {
  if (!validIndex(request.index)) {
    return unresolved("invalid-index", "无法使用当前小节索引", true);
  }
  if (!Number.isSafeInteger(request.rangeBudget)
    || request.rangeBudget < 1
    || request.rangeBudget > 32) {
    return unresolved("invalid-reference", "小节范围预算无效");
  }

  let endpoints: EndpointIndices | MeasureReferenceResolution;
  switch (request.reference.kind) {
    case "stable-id-range":
      endpoints = stableIdEndpoints(
        request.index,
        request.reference.startMeasureId,
        request.reference.endMeasureId,
      );
      break;
    case "ordinal-range":
      endpoints = ordinalEndpoints(
        request.index,
        request.reference.startOrdinal,
        request.reference.endOrdinal,
      );
      break;
    case "current-selection":
      endpoints = selectionEndpoints(request.index, request.selection);
      break;
  }
  if ("status" in endpoints) return endpoints;

  const startIndex = Math.min(endpoints.startIndex, endpoints.endIndex);
  const endIndex = Math.max(endpoints.startIndex, endpoints.endIndex);
  const measureCount = endIndex - startIndex + 1;
  if (measureCount > request.rangeBudget) {
    return unresolved("range-budget-exceeded", "小节范围超出本次任务预算");
  }

  const startMeasureId = request.index.measureIds[startIndex]!;
  const endMeasureId = request.index.measureIds[endIndex]!;
  return Object.freeze({
    status: "resolved",
    source: request.reference.kind,
    documentId: request.index.documentId,
    documentVersion: request.index.documentVersion,
    startOrdinal: startIndex + 1,
    endOrdinal: endIndex + 1,
    measureCount,
    input: Object.freeze({ startMeasureId, endMeasureId, maxMeasures: measureCount }),
  });
}
