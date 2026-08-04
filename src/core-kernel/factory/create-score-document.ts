import { captureStrictInput } from "../codec/strict-input-capture";
import {
  SCORE_DOCUMENT_SCHEMA_VERSION,
  type ScoreDocument,
} from "../domain/score-document";
import { validateScoreFeatureProfile } from "../profiles/score-feature-profile";
import { deepFreezeValue } from "../read/deep-freeze";
import {
  createDiagnostic,
  type DecodeDiagnostic,
  type SemanticDiagnostic,
} from "../validation/diagnostics";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type {
  CreateScoreDocumentInputV1,
  CreateScoreDocumentResult,
} from "./contracts";
import {
  decodeCreateScoreDocumentInput,
  sortFactoryDiagnostics,
} from "./strict-codec";

function freezeResult<T extends CreateScoreDocumentResult>(value: T): T {
  return deepFreezeValue(value);
}

function rejectInvalidInput(
  diagnostics: readonly DecodeDiagnostic[],
): CreateScoreDocumentResult {
  return freezeResult({
    status: "rejected",
    failure: {
      code: "factory.invalid-input",
      diagnostics: sortFactoryDiagnostics(diagnostics),
    },
  });
}

function rejectSemanticInvalid(
  diagnostics: readonly SemanticDiagnostic[],
): CreateScoreDocumentResult {
  return freezeResult({
    status: "rejected",
    failure: {
      code: "factory.semantic-invalid",
      diagnostics: sortFactoryDiagnostics(diagnostics),
    },
  });
}

function buildScoreDocument(input: CreateScoreDocumentInputV1): ScoreDocument {
  return {
    schemaVersion: SCORE_DOCUMENT_SCHEMA_VERSION,
    id: input.documentId,
    metadata: input.metadata,
    measureDefinitions: [input.initialMeasure],
    parts: input.initialParts.map((part) => ({
      id: part.id,
      name: part.name,
      instrument: part.instrument,
      staves: part.staves,
      measureContents: [
        {
          measureId: input.initialMeasure.id,
          voices: part.voices,
        },
      ],
    })),
    extensions: input.extensions,
  };
}

/**
 * Creates a detached Core score without creating a command session, Registry,
 * history, event source, or checkpoint.
 */
export function createScoreDocument(input: unknown): CreateScoreDocumentResult {
  try {
    const captured = captureStrictInput(input);
    if (captured.status === "resource-limit-exceeded") {
      return freezeResult({
        status: "rejected",
        failure: {
          code: "factory.resource-limit-exceeded",
          limitKind: captured.limitKind,
          limit: captured.limit,
          actual: captured.actual,
        },
      });
    }
    if (captured.status === "invalid") {
      return rejectInvalidInput([captured.diagnostic]);
    }

    const decoded = decodeCreateScoreDocumentInput(captured.value);
    if (!decoded.ok) {
      return rejectInvalidInput(decoded.diagnostics);
    }

    const document = buildScoreDocument(decoded.value);
    const semanticReport = validateScoreDocumentSemantics(document);
    if (!semanticReport.ok) {
      return rejectSemanticInvalid(semanticReport.diagnostics);
    }

    const support = validateScoreFeatureProfile(document);
    if (support.status === "invalid") {
      return rejectSemanticInvalid(support.diagnostics);
    }
    return freezeResult({ status: "created", document, support });
  } catch {
    return rejectInvalidInput([createDiagnostic("decode.unreadable-input", [])]);
  }
}
