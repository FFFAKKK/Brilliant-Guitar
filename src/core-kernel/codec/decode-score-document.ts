import type { ScoreDocument } from "../domain/score-document";
import {
  createDiagnostic,
  type Diagnostic,
} from "../validation/diagnostics";
import {
  ScoreComponentDecodeContext,
  decodeScoreDocumentInternal,
} from "./score-component-codec";

export type DecodeScoreDocumentResult =
  | { readonly ok: true; readonly value: ScoreDocument }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Public document decoding entry point. Persisted component rules live in the
 * private shared codec so factory and Measure commands can reuse them safely.
 */
export function decodeScoreDocument(value: unknown): DecodeScoreDocumentResult {
  const context = new ScoreComponentDecodeContext();
  try {
    const document = decodeScoreDocumentInternal(value, context);
    return document !== undefined && context.diagnostics.length === 0
      ? { ok: true, value: document }
      : { ok: false, diagnostics: context.diagnostics };
  } catch {
    return {
      ok: false,
      diagnostics: [createDiagnostic("decode.unreadable-input", [])],
    };
  }
}
