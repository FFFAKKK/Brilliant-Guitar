import type { ScoreDocument } from "../domain/score-document";
import {
  decodeScoreDocument,
  type DecodeScoreDocumentResult,
} from "./decode-score-document";
import { createDiagnostic, type Diagnostic } from "../validation/diagnostics";

export type EncodeScoreDocumentResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export function parseScoreDocumentJson(json: string): DecodeScoreDocumentResult {
  if (typeof json !== "string") {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic("decode.type", [], { expected: "string" }),
      ],
    };
  }
  try {
    return decodeScoreDocument(JSON.parse(json) as unknown);
  } catch {
    return {
      ok: false,
      diagnostics: [createDiagnostic("decode.json-syntax", [])],
    };
  }
}

export function encodeScoreDocumentJson(
  document: ScoreDocument,
): EncodeScoreDocumentResult {
  const decoded = decodeScoreDocument(document);
  if (!decoded.ok) {
    return decoded;
  }
  try {
    return { ok: true, value: JSON.stringify(decoded.value) };
  } catch {
    return {
      ok: false,
      diagnostics: [createDiagnostic("decode.encode-failed", [])],
    };
  }
}
