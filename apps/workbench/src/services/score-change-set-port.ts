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

  prepareTempoChange(
    input: ScorePrepareTempoChangeInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreTempoChangeSetV1> {
    if (!isScorePrepareTempoChangeInputV1(input)) {
      return Promise.reject(new ScoreChangeSetPortError(
        "Score tempo ChangeSet input is invalid",
        "definite-failure",
      ));
    }
    return this.prepare(
      context,
      this.#host.prepareScoreTempoChange,
      input,
      isScoreTempoChangeSetV1,
    ).then((changeSet) => {
      if (changeSet.documentId !== context.documentPrecondition.documentId
        || changeSet.baseDocumentVersion !== context.documentPrecondition.documentVersion
        || changeSet.afterTempoBpm !== input.tempoBpm) {
        throw new ScoreChangeSetPortError(
          "Prepared tempo ChangeSet does not match the request",
          "definite-failure",
        );
      }
      return changeSet;
    });
  }

  prepareMetadataTransaction(
    input: ScoreUpdateMetadataInputV1,
    context: ScoreChangeSetPreparationContext,
  ): Promise<ScoreMetadataTransactionChangeSetV1> {
    if (!isScoreUpdateMetadataInputV1(input)) {
      return Promise.reject(new ScoreChangeSetPortError(
        "Score metadata ChangeSet input is invalid",
        "definite-failure",
      ));
    }
    return this.prepare(
      context,
      this.#host.prepareScoreMetadataTransaction,
      input,
      isScoreMetadataTransactionChangeSetV1,
    ).then((changeSet) => {
      if (changeSet.documentId !== context.documentPrecondition.documentId
        || changeSet.baseDocumentVersion !== context.documentPrecondition.documentVersion
        || input.title !== undefined && changeSet.after.title !== input.title
        || input.tempoBpm !== undefined && changeSet.after.tempoBpm !== input.tempoBpm) {
        throw new ScoreChangeSetPortError(
          "Prepared metadata ChangeSet does not match the request",
          "definite-failure",
        );
      }
      return changeSet;
    });
  }

  private async prepare<TInput, TResult>(
    context: ScoreChangeSetPreparationContext,
    method: ((
      workspaceId: string,
      precondition: CapabilityDocumentPrecondition,
      input: TInput,
    ) => Promise<unknown | null>) | undefined,
    input: TInput,
    isResult: (value: unknown) => value is TResult,
  ): Promise<TResult> {
    if (context.workspaceId !== this.#workspaceId) {
      throw new ScoreChangeSetPortError("Score ChangeSet workspace does not match", "definite-failure");
    }
    if (!context.preparationInvocationId
      || !context.documentPrecondition.documentId
      || !Number.isSafeInteger(context.documentPrecondition.documentVersion)
      || context.documentPrecondition.documentVersion < 0) {
      throw new ScoreChangeSetPortError(
        "Score ChangeSet preparation context is invalid",
        "definite-failure",
      );
    }
    if (method === undefined) {
      throw new ScoreChangeSetPortError("Score ChangeSet preparation port is unavailable", "unknown");
    }
    let value: unknown | null;
    try {
      value = await method.call(this.#host, this.#workspaceId, context.documentPrecondition, input);
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
