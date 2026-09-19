import type {
  CapabilityResult,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
} from "../contracts/capability.ts";
import {
  resolveMeasureReference,
} from "./measure-reference-resolver.ts";
import type {
  MeasureIndexSnapshot,
  MeasureReference,
  MeasureReferenceResolution,
  MeasureSelectionSnapshot,
} from "./measure-reference-resolver.ts";

export interface MeasureIndexPortRequest {
  readonly workspaceId: string;
  readonly expectedDocumentId: string;
  readonly expectedDocumentVersion: number;
}

export type MeasureIndexPortResult =
  | { readonly status: "completed"; readonly index: MeasureIndexSnapshot }
  | {
      readonly status: "unavailable" | "failed";
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };

export interface MeasureIndexPort {
  readMeasureIndex(request: MeasureIndexPortRequest): Promise<MeasureIndexPortResult>;
}

export interface MeasureRangeReadPort {
  readMeasureRange(
    input: ScoreMeasureRangeInputV1,
  ): Promise<CapabilityResult<ScoreMeasureRangeV1>>;
}

export interface MeasureReferenceReadRequest {
  readonly workspaceId: string;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly reference: MeasureReference;
  readonly selection: MeasureSelectionSnapshot | null;
  readonly rangeBudget: number;
}

type UnresolvedResolution = Extract<MeasureReferenceResolution, { readonly status: "unresolved" }>;
type ResolvedResolution = Extract<MeasureReferenceResolution, { readonly status: "resolved" }>;

export type MeasureReferenceReadResult =
  | {
      readonly status: "completed";
      readonly resolution: ResolvedResolution;
      readonly data: ScoreMeasureRangeV1;
    }
  | {
      readonly status: "unresolved";
      readonly resolution: UnresolvedResolution;
    }
  | {
      readonly status: "failed";
      readonly stage: "measure-index" | "measure-range";
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };

function failed(
  stage: "measure-index" | "measure-range",
  code: string,
  message: string,
  retryable: boolean,
): MeasureReferenceReadResult {
  return Object.freeze({ status: "failed", stage, code, message, retryable });
}

function rangeMatchesResolution(
  data: ScoreMeasureRangeV1,
  resolution: ResolvedResolution,
): boolean {
  return data.documentId === resolution.documentId
    && data.documentVersion === resolution.documentVersion
    && data.startMeasureId === resolution.input.startMeasureId
    && data.endMeasureId === resolution.input.endMeasureId
    && data.measureCount === resolution.measureCount;
}

/** Composes authoritative reference resolution with the atomic stable-ID range capability. */
export class MeasureReferenceReadService {
  readonly #index: MeasureIndexPort;
  readonly #range: MeasureRangeReadPort;

  constructor(index: MeasureIndexPort, range: MeasureRangeReadPort) {
    this.#index = index;
    this.#range = range;
  }

  async read(request: MeasureReferenceReadRequest): Promise<MeasureReferenceReadResult> {
    if (request.reference.kind === "current-selection" && request.selection === null) {
      return Object.freeze({
        status: "unresolved",
        resolution: Object.freeze({
          status: "unresolved",
          code: "selection-unavailable",
          message: "当前没有可用于任务的小节选择区",
          retryable: false,
        }),
      });
    }

    let indexResult: MeasureIndexPortResult;
    try {
      indexResult = await this.#index.readMeasureIndex({
        workspaceId: request.workspaceId,
        expectedDocumentId: request.documentId,
        expectedDocumentVersion: request.documentVersion,
      });
    } catch {
      return failed("measure-index", "measure-index.failed", "无法读取当前小节索引", true);
    }
    if (indexResult.status !== "completed") {
      return failed(
        "measure-index",
        indexResult.code,
        indexResult.message,
        indexResult.retryable,
      );
    }
    if (indexResult.index.documentId !== request.documentId
      || indexResult.index.documentVersion !== request.documentVersion) {
      return failed(
        "measure-index",
        "measure-index.stale",
        "小节索引与当前文档版本不一致",
        true,
      );
    }

    const resolution = resolveMeasureReference({
      reference: request.reference,
      index: indexResult.index,
      selection: request.selection,
      rangeBudget: request.rangeBudget,
    });
    if (resolution.status === "unresolved") {
      return Object.freeze({ status: "unresolved", resolution });
    }

    let rangeResult: CapabilityResult<ScoreMeasureRangeV1>;
    try {
      rangeResult = await this.#range.readMeasureRange(resolution.input);
    } catch {
      return failed("measure-range", "measure-range.failed", "无法读取当前小节范围", true);
    }
    if (rangeResult.status !== "completed") {
      return failed(
        "measure-range",
        rangeResult.code,
        rangeResult.message,
        rangeResult.status !== "rejected",
      );
    }
    if (!rangeMatchesResolution(rangeResult.data, resolution)) {
      return failed(
        "measure-range",
        "measure-range.result-mismatch",
        "小节范围结果与解析引用不一致",
        true,
      );
    }
    return Object.freeze({ status: "completed", resolution, data: rangeResult.data });
  }
}
