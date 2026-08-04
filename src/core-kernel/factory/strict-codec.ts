import {
  ScoreComponentDecodeContext,
  decodeArray,
  decodeExtension,
  decodeInstrument,
  decodeMeasureDefinition,
  decodeMetadata,
  decodeStaff,
  decodeVoice,
} from "../codec/score-component-codec";
import type {
  InstrumentDescriptor,
  MeasureDefinition,
  ScoreMetadata,
  StaffDefinition,
  Voice,
} from "../domain/score-document";
import type {
  DecodeDiagnostic,
  DiagnosticPath,
} from "../validation/diagnostics";
import type {
  CreateScoreDocumentInputV1,
  InitialPartV1,
} from "./contracts";

interface DecodedInitialPart {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly [StaffDefinition, ...StaffDefinition[]];
  readonly voices: readonly [Voice, ...Voice[]];
}

export type DecodeCreateScoreDocumentInputResult =
  | { readonly ok: true; readonly value: CreateScoreDocumentInputV1 }
  | { readonly ok: false; readonly diagnostics: readonly DecodeDiagnostic[] };

function decodeNonEmptyArray<T>(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
  decodeItem: (
    item: unknown,
    itemPath: DiagnosticPath,
    itemContext: ScoreComponentDecodeContext,
  ) => T | undefined,
): readonly [T, ...T[]] | undefined {
  const decoded = decodeArray(value, path, context, decodeItem);
  if (decoded === undefined) {
    return undefined;
  }
  if (decoded.length === 0) {
    context.add("decode.type", path, { expected: "non-empty-array" });
    return undefined;
  }
  return decoded as readonly [T, ...T[]];
}

function decodeInitialPart(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): DecodedInitialPart | undefined {
  const input = context.object(value, path, [
    "id",
    "name",
    "instrument",
    "staves",
    "voices",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const name = context.string(input.name, [...path, "name"]);
  const instrument = decodeInstrument(
    input.instrument,
    [...path, "instrument"],
    context,
  );
  const staves = decodeNonEmptyArray(
    input.staves,
    [...path, "staves"],
    context,
    decodeStaff,
  );
  const voices = decodeNonEmptyArray(
    input.voices,
    [...path, "voices"],
    context,
    decodeVoice,
  );
  return id === undefined ||
    name === undefined ||
    instrument === undefined ||
    staves === undefined ||
    voices === undefined
    ? undefined
    : { id, name, instrument, staves, voices };
}

function decodeCreateScoreDocumentInputInternal(
  value: unknown,
  context: ScoreComponentDecodeContext,
): CreateScoreDocumentInputV1 | undefined {
  const input = context.object(value, [], [
    "factoryVersion",
    "documentId",
    "metadata",
    "initialMeasure",
    "initialParts",
    "extensions",
  ]);
  if (input === undefined) {
    return undefined;
  }

  const factoryVersion = context.literal(
    input.factoryVersion,
    ["factoryVersion"],
    [1] as const,
  );
  const documentId = context.string(input.documentId, ["documentId"]);
  const metadata = decodeMetadata(input.metadata, ["metadata"], context);
  const initialMeasure = decodeMeasureDefinition(
    input.initialMeasure,
    ["initialMeasure"],
    context,
  );
  const initialParts = decodeNonEmptyArray(
    input.initialParts,
    ["initialParts"],
    context,
    decodeInitialPart,
  );
  const extensions = decodeArray(
    input.extensions,
    ["extensions"],
    context,
    decodeExtension,
  );

  return factoryVersion === undefined ||
    documentId === undefined ||
    metadata === undefined ||
    initialMeasure === undefined ||
    initialParts === undefined ||
    extensions === undefined
    ? undefined
    : {
        factoryVersion,
        documentId,
        metadata,
        initialMeasure,
        initialParts: initialParts as readonly [InitialPartV1, ...InitialPartV1[]],
        extensions,
      };
}

function comparePathSegment(
  left: string | number,
  right: string | number,
): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return typeof left === "number" ? -1 : 1;
}

function compareDiagnosticPath(
  left: DiagnosticPath,
  right: DiagnosticPath,
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (leftSegment === undefined || rightSegment === undefined) {
      return 0;
    }
    const comparison = comparePathSegment(leftSegment, rightSegment);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return left.length - right.length;
}

export function sortFactoryDiagnostics<
  T extends { readonly code: string; readonly path: DiagnosticPath },
>(diagnostics: readonly T[]): readonly T[] {
  return diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort((left, right) => {
      const pathComparison = compareDiagnosticPath(
        left.diagnostic.path,
        right.diagnostic.path,
      );
      if (pathComparison !== 0) {
        return pathComparison;
      }
      if (left.diagnostic.code !== right.diagnostic.code) {
        return left.diagnostic.code < right.diagnostic.code ? -1 : 1;
      }
      return left.index - right.index;
    })
    .map(({ diagnostic }) => diagnostic);
}

export function decodeCreateScoreDocumentInput(
  value: unknown,
): DecodeCreateScoreDocumentInputResult {
  const context = new ScoreComponentDecodeContext(true);
  const decoded = decodeCreateScoreDocumentInputInternal(value, context);
  return decoded !== undefined && context.diagnostics.length === 0
    ? { ok: true, value: decoded }
    : { ok: false, diagnostics: sortFactoryDiagnostics(context.diagnostics) };
}
