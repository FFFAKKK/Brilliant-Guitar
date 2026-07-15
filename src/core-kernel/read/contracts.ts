import type { ScoreDocumentSchemaVersion } from "../domain/score-document";
import type { ScoreDocument } from "../domain/score-document";

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
