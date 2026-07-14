import type { JsonObject } from "../domain/extensions";

export type DiagnosticPath = readonly (string | number)[];
export type DecodeDiagnosticCode =
  | "decode.encode-failed"
  | "decode.extra-field"
  | "decode.json-syntax"
  | "decode.json-value"
  | "decode.non-finite-number"
  | "decode.required-field"
  | "decode.type"
  | "decode.union"
  | "decode.unreadable-input"
  | "decode.unsupported-schema-version";

export type SemanticDiagnosticCode =
  | "semantic.extension-duplicate"
  | "semantic.extension-namespace-invalid"
  | "semantic.extension-owner-missing"
  | "semantic.extension-payload-invalid"
  | "semantic.extension-schema-version-invalid"
  | "semantic.fraction-non-canonical"
  | "semantic.fraction-sign-invalid"
  | "semantic.id-duplicate"
  | "semantic.id-empty"
  | "semantic.measure-coverage-duplicate"
  | "semantic.measure-coverage-missing"
  | "semantic.measure-duration-invalid"
  | "semantic.measure-reference-missing"
  | "semantic.measure-required"
  | "semantic.meter-denominator-invalid"
  | "semantic.meter-numerator-invalid"
  | "semantic.note-value-invalid"
  | "semantic.notes-required"
  | "semantic.part-required"
  | "semantic.pickup-exceeds-measure"
  | "semantic.sequence-exceeds-measure"
  | "semantic.sequence-start-out-of-bounds"
  | "semantic.sounding-pitch-invalid"
  | "semantic.staff-line-count-invalid"
  | "semantic.staff-reference-missing"
  | "semantic.staff-required"
  | "semantic.tempo-invalid"
  | "semantic.time-arithmetic-overflow"
  | "semantic.transposition-invalid"
  | "semantic.voice-required"
  | "semantic.written-pitch-invalid";

export type UnsupportedDiagnosticCode =
  | "unsupported.chord"
  | "unsupported.dots"
  | "unsupported.meter"
  | "unsupported.note-value-base"
  | "unsupported.part-count"
  | "unsupported.pickup"
  | "unsupported.sequence-duration"
  | "unsupported.sequence-start"
  | "unsupported.staff-count"
  | "unsupported.time-modification"
  | "unsupported.voice-count";

export type DiagnosticCode =
  | DecodeDiagnosticCode
  | SemanticDiagnosticCode
  | UnsupportedDiagnosticCode;

export interface Diagnostic<Code extends DiagnosticCode = DiagnosticCode> {
  readonly code: Code;
  readonly messageKey: `core.${Code}`;
  readonly path: DiagnosticPath;
  readonly details?: JsonObject;
}

export type DecodeDiagnostic = Diagnostic<DecodeDiagnosticCode>;
export type SemanticDiagnostic = Diagnostic<SemanticDiagnosticCode>;
export type UnsupportedDiagnostic = Diagnostic<UnsupportedDiagnosticCode>;

export function createDiagnostic<Code extends DiagnosticCode>(
  code: Code,
  path: DiagnosticPath,
  details?: JsonObject,
): Diagnostic<Code> {
  const diagnostic = {
    code,
    messageKey: `core.${code}`,
    path: [...path],
  } as const;
  return details === undefined ? diagnostic : { ...diagnostic, details };
}
