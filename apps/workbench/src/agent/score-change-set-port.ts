import {
  isScoreMetadataTransactionChangeSetV1,
  isScoreTempoChangeSetV1,
} from "../contracts/capability.ts";
import type {
  CapabilityTransportRequest,
  ScoreMetadataTransactionChangeSetV1,
  ScorePrepareTempoChangeInputV1,
  ScoreTempoChangeSetV1,
  ScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import {
  AgentCapabilityPortError,
} from "./capability-port.ts";
import type {
  AgentCapabilityPort,
} from "./capability-port.ts";
import { ScoreChangeSetPortError } from "../services/score-change-set-port.ts";
import type {
  ScoreChangeSetPort,
  ScoreChangeSetPreparationContext,
} from "../services/score-change-set-port.ts";

export { ScoreChangeSetPortError } from "../services/score-change-set-port.ts";
export type {
  ScoreChangeSetPort,
  ScoreChangeSetPreparationContext,
} from "../services/score-change-set-port.ts";

/**
 * Compatibility adapter: the typed port is the orchestration boundary while
 * the legacy capability transport remains an implementation detail until the
 * host exposes typed preparation commands.
 */
export class CapabilityBackedScoreChangeSetPort implements ScoreChangeSetPort {
  readonly #capabilities: AgentCapabilityPort;

  constructor(capabilities: AgentCapabilityPort) {
    this.#capabilities = capabilities;
  }

  async prepareTempoChange(
    input: ScorePrepareTempoChangeInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreTempoChangeSetV1> {
    const request: CapabilityTransportRequest = {
      invocationId: context.preparationInvocationId,
      capabilityId: "score.prepare-tempo-change",
      contractVersion: 1,
      workspaceId: context.workspaceId,
      documentPrecondition: context.documentPrecondition,
      input,
    };
    const result = await this.invoke(request);
    if (result.status !== "completed") {
      throw new ScoreChangeSetPortError(result.message, "definite-failure");
    }
    if (!isScoreTempoChangeSetV1(result.data)) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation returned invalid data",
        "definite-failure",
      );
    }
    return result.data;
  }

  async prepareMetadataTransaction(
    input: ScoreUpdateMetadataInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreMetadataTransactionChangeSetV1> {
    const request: CapabilityTransportRequest = {
      invocationId: context.preparationInvocationId,
      capabilityId: "score.prepare-metadata-transaction",
      contractVersion: 1,
      workspaceId: context.workspaceId,
      documentPrecondition: context.documentPrecondition,
      input,
    };
    const result = await this.invoke(request);
    if (result.status !== "completed") {
      throw new ScoreChangeSetPortError(result.message, "definite-failure");
    }
    if (!isScoreMetadataTransactionChangeSetV1(result.data)) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation returned invalid data",
        "definite-failure",
      );
    }
    return result.data;
  }

  private async invoke(request: CapabilityTransportRequest) {
    try {
      return await this.#capabilities.invoke(request);
    } catch (error) {
      if (error instanceof AgentCapabilityPortError) {
        throw new ScoreChangeSetPortError(error.message, error.outcome);
      }
      throw new ScoreChangeSetPortError(
        "Score ChangeSet preparation outcome is unknown",
        "unknown",
      );
    }
  }
}
