import type { ScoreRange } from "../domain/address";
import type {
  MeasureDefinition,
  Part,
  PartMeasureContent,
  RhythmicEvent,
  ScoreDocument,
  ScoreDocumentSchemaVersion,
  ScoreNote,
  StaffDefinition,
  Voice,
} from "../domain/score-document";

export interface DocumentSnapshot {
  readonly documentId: string;
  readonly schemaVersion: ScoreDocumentSchemaVersion;
  readonly documentVersion: number;
  readonly document: ScoreDocument;
}

export interface KernelHistoryState {
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export interface KernelReadState {
  readonly snapshot: DocumentSnapshot;
  readonly history: KernelHistoryState;
  readonly dirty: boolean;
}

export interface PersistedCheckpoint {
  readonly documentId: string;
  readonly documentVersion: number;
}

export type CheckpointFailure =
  | { readonly code: "checkpoint.invalid" }
  | { readonly code: "checkpoint.document-mismatch" }
  | { readonly code: "checkpoint.version-unavailable" }
  | { readonly code: "checkpoint.invariant-violation" }
  | { readonly code: "event.reentrant-write" }
  | { readonly code: "event.sequence-overflow" };

export type MarkPersistedResult =
  | {
      readonly status: "updated" | "no-op";
      readonly documentVersion: number;
      readonly dirty: boolean;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly dirty: boolean;
      readonly failure: CheckpointFailure;
    };

export type SelectedScoreEntity =
  | { readonly kind: "document"; readonly value: ScoreDocument }
  | { readonly kind: "measure"; readonly value: MeasureDefinition }
  | { readonly kind: "part"; readonly value: Part }
  | { readonly kind: "staff"; readonly value: StaffDefinition }
  | { readonly kind: "voice"; readonly value: Voice }
  | { readonly kind: "event"; readonly value: RhythmicEvent }
  | { readonly kind: "note"; readonly value: ScoreNote };

export type ScoreEntityOwnership =
  | { readonly entityKind: "document"; readonly documentId: string }
  | { readonly entityKind: "measure"; readonly documentId: string }
  | { readonly entityKind: "part"; readonly documentId: string }
  | {
      readonly entityKind: "staff";
      readonly documentId: string;
      readonly partId: string;
    }
  | {
      readonly entityKind: "voice";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
    }
  | {
      readonly entityKind: "event";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
      readonly voiceId: string;
    }
  | {
      readonly entityKind: "note";
      readonly documentId: string;
      readonly partId: string;
      readonly measureId: string;
      readonly voiceId: string;
      readonly eventId: string;
    };

export type ScoreRangeSelection =
  | {
      readonly kind: "measure-range";
      readonly normalized: Extract<
        ScoreRange,
        { readonly kind: "measure-range" }
      >;
      readonly measures: readonly MeasureDefinition[];
    }
  | {
      readonly kind: "part-measure-range";
      readonly normalized: Extract<
        ScoreRange,
        { readonly kind: "part-measure-range" }
      >;
      readonly measureContents: readonly PartMeasureContent[];
    }
  | {
      readonly kind: "voice-event-range";
      readonly normalized: Extract<
        ScoreRange,
        { readonly kind: "voice-event-range" }
      >;
      readonly events: readonly RhythmicEvent[];
    };

export type ReadFailure =
  | { readonly code: "read.invalid-address" }
  | { readonly code: "read.entity-not-found" }
  | { readonly code: "read.invalid-range" }
  | { readonly code: "read.range-endpoint-not-found" }
  | { readonly code: "read.range-owner-mismatch" }
  | { readonly code: "read.invalid-snapshot" }
  | { readonly code: "read.invariant-violation" };

export type ReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ReadFailure };
