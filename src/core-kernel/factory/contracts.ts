import type { ExtensionBlock } from "../domain/extensions";
import type {
  InstrumentDescriptor,
  MeasureDefinition,
  ScoreDocument,
  ScoreMetadata,
  StaffDefinition,
  Voice,
} from "../domain/score-document";
import type { ScoreSupportResult } from "../profiles/score-feature-profile";
import type {
  DecodeDiagnostic,
  SemanticDiagnostic,
} from "../validation/diagnostics";

export interface InitialPartV1 {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly [StaffDefinition, ...StaffDefinition[]];
  readonly voices: readonly [Voice, ...Voice[]];
}

export interface CreateScoreDocumentInputV1 {
  readonly factoryVersion: 1;
  readonly documentId: string;
  readonly metadata: ScoreMetadata;
  readonly initialMeasure: MeasureDefinition;
  readonly initialParts: readonly [InitialPartV1, ...InitialPartV1[]];
  readonly extensions: readonly ExtensionBlock[];
}

export type CreateScoreDocumentFailure =
  | {
      readonly code: "factory.invalid-input";
      readonly diagnostics: readonly DecodeDiagnostic[];
    }
  | {
      readonly code: "factory.semantic-invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    }
  | {
      readonly code: "factory.resource-limit-exceeded";
      readonly limitKind: "input-depth" | "input-properties";
      readonly limit: number;
      readonly actual: number;
    };

export type CreateScoreDocumentResult =
  | {
      readonly status: "created";
      readonly document: ScoreDocument;
      readonly support: ScoreSupportResult;
    }
  | {
      readonly status: "rejected";
      readonly failure: CreateScoreDocumentFailure;
    };
