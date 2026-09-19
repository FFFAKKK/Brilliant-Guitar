import type {
  CapabilityResult,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
} from "../contracts/capability.ts";
import type {
  MeasureIndexPort,
  MeasureIndexPortRequest,
  MeasureIndexPortResult,
} from "./measure-reference-read-service.ts";

interface ScoreMeasureIndexClient {
  readScoreMeasureIndex(
    input: ScoreMeasureIndexInputV1,
  ): Promise<CapabilityResult<ScoreMeasureIndexV1>>;
}

function retryable(result: Exclude<CapabilityResult<ScoreMeasureIndexV1>, { readonly status: "completed" }>): boolean {
  return result.status === "unavailable"
    || result.status === "failed"
    || result.code === "score.measure-index-stale";
}

/** Adapts the internal UI capability route to the control-plane measure index port. */
export class ScoreMeasureIndexPort implements MeasureIndexPort {
  readonly #client: ScoreMeasureIndexClient;

  constructor(client: ScoreMeasureIndexClient) {
    this.#client = client;
  }

  async readMeasureIndex(request: MeasureIndexPortRequest): Promise<MeasureIndexPortResult> {
    const result = await this.#client.readScoreMeasureIndex({
      expectedDocumentId: request.expectedDocumentId,
      expectedDocumentVersion: request.expectedDocumentVersion,
    });
    if (result.status === "completed") {
      return Object.freeze({ status: "completed", index: result.data });
    }
    return Object.freeze({
      status: result.status === "unavailable" ? "unavailable" : "failed",
      code: result.code,
      message: result.message,
      retryable: retryable(result),
    });
  }
}
