import {
  isScoreMeasureIndexInputV1,
  isScoreMeasureIndexV1,
  isScoreMeasureRangeInputV1,
  isScoreMeasureRangeV1,
  isScoreMetadataV1,
  isScoreStructureV1,
  isScoreSummaryV1,
} from "../contracts/capability.ts";
import type {
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
  ScoreMetadataV1,
  ScoreStructureV1,
  ScoreSummaryV1,
} from "../contracts/capability.ts";
import { WorkbenchRequestError } from "./workbench-host-bridge.ts";

/**
 * The smallest read surface that the score UI and direct Agent tools need.
 */
export type ScoreReadResult<T> =
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "unavailable" | "failed"; readonly code: string; readonly message: string };

export interface ScoreReadPort {
  readSummary(): Promise<ScoreReadResult<ScoreSummaryV1>>;
  readMetadata(): Promise<ScoreReadResult<ScoreMetadataV1>>;
  readStructure(): Promise<ScoreReadResult<ScoreStructureV1>>;
  readMeasureIndex(input: ScoreMeasureIndexInputV1): Promise<ScoreReadResult<ScoreMeasureIndexV1>>;
  readMeasureRange(input: ScoreMeasureRangeInputV1): Promise<ScoreReadResult<ScoreMeasureRangeV1>>;
}

interface ScoreReadHost {
  readScoreSummary?(workspaceId: string): Promise<unknown | null>;
  readScoreMetadata?(workspaceId: string): Promise<unknown | null>;
  readScoreStructure?(workspaceId: string): Promise<unknown | null>;
  readScoreMeasureIndex?(workspaceId: string, input: ScoreMeasureIndexInputV1): Promise<unknown | null>;
  readScoreMeasureRange?(workspaceId: string, input: ScoreMeasureRangeInputV1): Promise<unknown | null>;
}

const EMPTY_INPUT = Object.freeze({});

function unavailable<T>(): ScoreReadResult<T> {
  return Object.freeze({
    status: "unavailable",
    code: "score.session-unavailable",
    message: "当前工作区没有可读取的乐谱会话",
  });
}

function hostFailure<T>(error: unknown): ScoreReadResult<T> | undefined {
  if (!(error instanceof WorkbenchRequestError)) return undefined;
  const code = error.issue?.code ?? "score.read-failed";
  const retryable = error.issue?.retryable ?? error.status >= 500;
  return Object.freeze({
    status: retryable ? "unavailable" : "failed",
    code,
    message: error.issue?.message ?? error.message,
  });
}

/** Direct typed client for the score read commands exposed by the host. */
export class ScoreReadClient implements ScoreReadPort {
  readonly #host: ScoreReadHost;
  readonly #workspaceId: string;

  constructor(host: ScoreReadHost, workspaceId: string) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }

  readSummary(): Promise<ScoreReadResult<ScoreSummaryV1>> {
    const method = this.#host.readScoreSummary === undefined
      ? undefined
      : (workspaceId: string) => this.#host.readScoreSummary!(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreSummaryV1);
  }

  readMetadata(): Promise<ScoreReadResult<ScoreMetadataV1>> {
    const method = this.#host.readScoreMetadata === undefined
      ? undefined
      : (workspaceId: string) => this.#host.readScoreMetadata!(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreMetadataV1);
  }

  readStructure(): Promise<ScoreReadResult<ScoreStructureV1>> {
    const method = this.#host.readScoreStructure === undefined
      ? undefined
      : (workspaceId: string) => this.#host.readScoreStructure!(workspaceId);
    return this.read(method, EMPTY_INPUT, isScoreStructureV1);
  }

  async readMeasureIndex(input: ScoreMeasureIndexInputV1): Promise<ScoreReadResult<ScoreMeasureIndexV1>> {
    if (!isScoreMeasureIndexInputV1(input)) {
      throw new Error("乐谱小节索引读取请求无效");
    }
    const { expectedDocumentId, expectedDocumentVersion } = input;
    const method = this.#host.readScoreMeasureIndex === undefined
      ? undefined
      : (workspaceId: string, value?: unknown) =>
        this.#host.readScoreMeasureIndex!(workspaceId, value as ScoreMeasureIndexInputV1);
    const result = await this.read(method, input, isScoreMeasureIndexV1);
    if (result.status === "ready"
      && (result.data.documentId !== expectedDocumentId
        || result.data.documentVersion !== expectedDocumentVersion)) {
      throw new Error("乐谱小节索引读取结果与请求不匹配");
    }
    return result;
  }

  async readMeasureRange(input: ScoreMeasureRangeInputV1): Promise<ScoreReadResult<ScoreMeasureRangeV1>> {
    if (!isScoreMeasureRangeInputV1(input)) {
      throw new Error("乐谱小节范围读取请求无效");
    }
    const { startMeasureId, endMeasureId, maxMeasures } = input;
    const method = this.#host.readScoreMeasureRange === undefined
      ? undefined
      : (workspaceId: string, value?: unknown) =>
        this.#host.readScoreMeasureRange!(workspaceId, value as ScoreMeasureRangeInputV1);
    const result = await this.read(method, input, isScoreMeasureRangeV1);
    if (result.status === "ready"
      && (result.data.startMeasureId !== startMeasureId
        || result.data.endMeasureId !== endMeasureId
        || result.data.measureCount > maxMeasures)) {
      throw new Error("乐谱小节范围读取结果与请求不匹配");
    }
    return result;
  }

  private async read<T>(
    method: ((workspaceId: string, input?: unknown) => Promise<unknown | null>) | undefined,
    input: unknown,
    isData: (value: unknown) => value is T,
  ): Promise<ScoreReadResult<T>> {
    if (method === undefined) throw new Error("当前宿主未提供乐谱类型化读取端口");
    let value: unknown | null;
    try {
      value = input === EMPTY_INPUT
        ? await method(this.#workspaceId)
        : await method(this.#workspaceId, input);
    } catch (error) {
      const failure = hostFailure<T>(error);
      if (failure !== undefined) return failure;
      throw error;
    }
    if (value === null) return unavailable();
    if (!isData(value)) throw new Error("乐谱类型化读取结果无效");
    return Object.freeze({ status: "ready", data: value });
  }
}
