import {
  isScorePrepareTempoChangeInputV1,
  isScoreMetadataTransactionChangeSetV1,
  isScoreTempoChangeSetV1,
  isScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import type {
  CapabilityDocumentPrecondition,
  ScoreMetadataTransactionChangeSetV1,
  ScorePrepareTempoChangeInputV1,
  ScoreTempoChangeSetV1,
  ScoreUpdateMetadataInputV1,
} from "../contracts/capability.ts";
import { WorkbenchRequestError } from "./workbench-host-bridge.ts";

export interface ScoreChangeSetPreparationContext {
  readonly preparationInvocationId: string;
  readonly workspaceId: string;
  readonly documentPrecondition: CapabilityDocumentPrecondition;
}

/** Typed preparation surface for score mutations that require approval. */
export interface ScoreChangeSetPort {
  prepareTempoChange(
    input: ScorePrepareTempoChangeInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreTempoChangeSetV1>;
  prepareMetadataTransaction(
    input: ScoreUpdateMetadataInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreMetadataTransactionChangeSetV1>;
}

export class ScoreChangeSetPortError extends Error {
  readonly outcome: "definite-failure" | "unknown";

  constructor(message: string, outcome: "definite-failure" | "unknown") {
    super(message);
    this.outcome = outcome;
  }
}

interface ScoreChangeSetHost {
  prepareScoreTempoChange?(
    workspaceId: string,
    precondition: CapabilityDocumentPrecondition,
    input: ScorePrepareTempoChangeInputV1,
  ): Promise<unknown | null>;
  prepareScoreMetadataTransaction?(
    workspaceId: string,
    precondition: CapabilityDocumentPrecondition,
    input: ScoreUpdateMetadataInputV1,
  ): Promise<unknown | null>;
}

/** Binds one workspace to the direct typed ChangeSet preparation commands. */
export class ScoreChangeSetClient implements ScoreChangeSetPort {
  readonly #host: ScoreChangeSetHost;
  readonly #workspaceId: string;

  constructor(host: ScoreChangeSetHost, workspaceId: string) {
    this.#host = host;
    this.#workspaceId = workspaceId;
  }

  async prepareTempoChange(
    input: ScorePrepareTempoChangeInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreTempoChangeSetV1> {
    if (!isScorePrepareTempoChangeInputV1(input)) {
      throw new ScoreChangeSetPortError(
        "Score tempo ChangeSet input is invalid",
        "definite-failure",
      );
    }
    const request = Object.freeze({ tempoBpm: input.tempoBpm });
    const precondition = this.capturePrecondition(context);
    const changeSet = await this.prepare(
      precondition,
      this.#host.prepareScoreTempoChange,
      request,
      isScoreTempoChangeSetV1,
    );
    if (changeSet.documentId !== precondition.documentId
      || changeSet.baseDocumentVersion !== precondition.documentVersion
      || changeSet.afterTempoBpm !== request.tempoBpm) {
      throw new ScoreChangeSetPortError(
        "Prepared tempo ChangeSet does not match the request",
        "definite-failure",
      );
    }
    return changeSet;
  }

  async prepareMetadataTransaction(
    input: ScoreUpdateMetadataInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreMetadataTransactionChangeSetV1> {
    if (!isScoreUpdateMetadataInputV1(input)) {
      throw new ScoreChangeSetPortError(
        "Score metadata ChangeSet input is invalid",
        "definite-failure",
      );
    }
    const request = Object.freeze({ ...input });
    const precondition = this.capturePrecondition(context);
    const changeSet = await this.prepare(
      precondition,
      this.#host.prepareScoreMetadataTransaction,
      request,
      isScoreMetadataTransactionChangeSetV1,
    );
    if (changeSet.documentId !== precondition.documentId
      || changeSet.baseDocumentVersion !== precondition.documentVersion
      || changeSet.after.title !== (request.title ?? changeSet.before.title)
      || changeSet.after.tempoBpm !== (request.tempoBpm ?? changeSet.before.tempoBpm)) {
      throw new ScoreChangeSetPortError(
        "Prepared metadata ChangeSet does not match the request",
        "definite-failure",
      );
    }
    return changeSet;
  }

  private capturePrecondition(context: ScoreChangeSetPreparationContext): CapabilityDocumentPrecondition {
    if (typeof context !== "object" || context === null || Array.isArray(context)
      || typeof context.preparationInvocationId !== "string"
      || context.preparationInvocationId.length === 0
      || typeof context.workspaceId !== "string" || context.workspaceId.length === 0
      || typeof context.documentPrecondition !== "object"
      || context.documentPrecondition === null || Array.isArray(context.documentPrecondition)
      || typeof context.documentPrecondition.documentId !== "string"
      || context.documentPrecondition.documentId.length === 0
      || context.documentPrecondition.documentId.length > 256
      || !Number.isSafeInteger(context.documentPrecondition.documentVersion)
      || context.documentPrecondition.documentVersion < 0) {
      throw new ScoreChangeSetPortError(
        "Score ChangeSet preparation context is invalid",
        "definite-failure",
      );
    }
    if (context.workspaceId !== this.#workspaceId) {
      throw new ScoreChangeSetPortError("Score ChangeSet workspace does not match", "definite-failure");
    }
    // Dispatch and result validation must use the same call-time document snapshot.
    return Object.freeze({
      documentId: context.documentPrecondition.documentId,
      documentVersion: context.documentPrecondition.documentVersion,
    });
  }

  private async prepare<TInput, TResult>(
    precondition: CapabilityDocumentPrecondition,
    method: ((
      workspaceId: string,
      precondition: CapabilityDocumentPrecondition,
      input: TInput,
    ) => Promise<unknown | null>) | undefined,
    input: TInput,
    isResult: (value: unknown) => value is TResult,
  ): Promise<TResult> {
    if (method === undefined) {
      throw new ScoreChangeSetPortError("Score ChangeSet preparation port is unavailable", "unknown");
    }
    let value: unknown | null;
    try {
      value = await method.call(this.#host, this.#workspaceId, precondition, input);
    } catch (error) {
      if (error instanceof WorkbenchRequestError) {
        throw new ScoreChangeSetPortError(error.issue?.message ?? error.message, "definite-failure");
      }
      throw new ScoreChangeSetPortError("Score ChangeSet preparation outcome is unknown", "unknown");
    }
    if (value === null) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation requires an open score document",
        "definite-failure",
      );
    }
    if (!isResult(value)) {
      throw new ScoreChangeSetPortError(
        "Prepared mutation returned invalid data",
        "definite-failure",
      );
    }
    return value;
  }
}
