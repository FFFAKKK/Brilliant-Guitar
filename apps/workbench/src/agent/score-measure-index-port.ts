import type { ScoreMeasureIndexV1 } from "../contracts/capability.ts";
import type { ScoreReadPort, ScoreReadResult } from "../services/score-read-port.ts";
import type {
  MeasureIndexPort,
  MeasureIndexPortRequest,
  MeasureIndexPortResult,
} from "./measure-reference-read-service.ts";

function retryable(result: Exclude<ScoreReadResult<ScoreMeasureIndexV1>, { readonly status: "ready" }>): boolean {
  return result.status === "unavailable"
    || result.code === "score.measure-index-stale";
}

/** Adapts the typed score read port to the control-plane measure index port. */
export class ScoreMeasureIndexPort implements MeasureIndexPort {
  readonly #scoreRead: ScoreReadPort;

  constructor(scoreRead: ScoreReadPort) {
    this.#scoreRead = scoreRead;
  }

  async readMeasureIndex(request: MeasureIndexPortRequest): Promise<MeasureIndexPortResult> {
    const result = await this.#scoreRead.readMeasureIndex({
      expectedDocumentId: request.expectedDocumentId,
      expectedDocumentVersion: request.expectedDocumentVersion,
    });
    if (result.status === "ready") {
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
