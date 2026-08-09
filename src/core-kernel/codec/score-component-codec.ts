import type {
  ExtensionBlock,
  ExtensionOwner,
  JsonObject,
  JsonValue,
} from "../domain/extensions";
import type { Fraction } from "../domain/fraction";
import type { Meter, NoteValue, TimeModification } from "../domain/musical-time";
import type { Transposition, WrittenPitch } from "../domain/pitch";
import {
  SCORE_DOCUMENT_SCHEMA_VERSION,
  type Clef,
  type InstrumentDescriptor,
  type MeasureDefinition,
  type MusicSequence,
  type NotesContent,
  type Part,
  type PartMeasureContent,
  type RestContent,
  type RhythmicEvent,
  type ScoreDocument,
  type ScoreMetadata,
  type ScoreNote,
  type StaffDefinition,
  type Tempo,
  type Voice,
} from "../domain/score-document";
import {
  createDiagnostic,
  type DecodeDiagnostic,
  type DiagnosticPath,
} from "../validation/diagnostics";

type PlainRecord = Record<string, unknown>;

const reflectApply = Reflect.apply;
const arrayPrototype = Array.prototype;
const arrayFilter = arrayPrototype.filter;
const arrayPush = arrayPrototype.push;
const arraySlice = arrayPrototype.slice;
const arraySort = arrayPrototype.sort;
const objectConstructor = Object;
const objectKeys = objectConstructor.keys;
const objectHasOwnProperty = objectConstructor.prototype.hasOwnProperty;
const setConstructor = Set;
const setPrototype = setConstructor.prototype;
const setAdd = setPrototype.add;
const setDelete = setPrototype.delete;
const setHas = setPrototype.has;

function filterValues<T>(
  values: readonly T[],
  predicate: (value: T, index: number) => boolean,
): T[] {
  return reflectApply(arrayFilter, values, [predicate]) as T[];
}

function pushValue<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value]);
}

function appendPath(
  path: DiagnosticPath,
  segment: DiagnosticPath[number],
): DiagnosticPath {
  const output = reflectApply(arraySlice, path, []) as DiagnosticPath[number][];
  pushValue(output, segment);
  return output;
}

function ownEnumerableStringKeys(value: object): string[] {
  return reflectApply(objectKeys, objectConstructor, [value]) as string[];
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return reflectApply(objectHasOwnProperty, value, [key]) as boolean;
}

function addSetValue<T>(values: Set<T>, value: T): void {
  reflectApply(setAdd, values, [value]);
}

function deleteSetValue<T>(values: Set<T>, value: T): void {
  reflectApply(setDelete, values, [value]);
}

function setHasValue<T>(values: Set<T>, value: T): boolean {
  return reflectApply(setHas, values, [value]) as boolean;
}

function addStrings(values: Set<string>, additions: readonly string[]): void {
  for (let index = 0; index < additions.length; index += 1) {
    const value = additions[index];
    if (value !== undefined) {
      addSetValue(values, value);
    }
  }
}

function sortStrings(values: string[]): string[] {
  return reflectApply(arraySort, values, []) as string[];
}

export class ScoreComponentDecodeContext {
  readonly diagnostics: DecodeDiagnostic[] = [];

  constructor(private readonly requireSafeIntegers: boolean = false) {}

  add(
    code: DecodeDiagnostic["code"],
    path: DiagnosticPath,
    details?: JsonObject,
  ): void {
    pushValue(this.diagnostics, createDiagnostic(code, path, details));
  }

  object(
    value: unknown,
    path: DiagnosticPath,
    required: readonly string[],
    optional: readonly string[] = [],
  ): PlainRecord | undefined {
    if (!isPlainRecord(value)) {
      this.add("decode.type", path, { expected: "object" });
      return undefined;
    }

    const allowed = new setConstructor<string>();
    addStrings(allowed, required);
    addStrings(allowed, optional);
    const extraFields = sortStrings(
      filterValues(
        ownEnumerableStringKeys(value),
        (key) => !setHasValue(allowed, key),
      ),
    );
    for (let index = 0; index < extraFields.length; index += 1) {
      const field = extraFields[index];
      if (field !== undefined) {
        this.add("decode.extra-field", appendPath(path, field), { field });
      }
    }

    const missingFields = filterValues(
      required,
      (field) => !hasOwn(value, field),
    );
    for (let index = 0; index < missingFields.length; index += 1) {
      const field = missingFields[index];
      if (field !== undefined) {
        this.add("decode.required-field", appendPath(path, field), { field });
      }
    }

    return extraFields.length === 0 && missingFields.length === 0
      ? value
      : undefined;
  }

  array(value: unknown, path: DiagnosticPath): readonly unknown[] | undefined {
    if (!Array.isArray(value)) {
      this.add("decode.type", path, { expected: "array" });
      return undefined;
    }
    return value;
  }

  string(value: unknown, path: DiagnosticPath): string | undefined {
    if (typeof value !== "string") {
      this.add("decode.type", path, { expected: "string" });
      return undefined;
    }
    return value;
  }

  number(value: unknown, path: DiagnosticPath): number | undefined {
    if (typeof value !== "number") {
      this.add("decode.type", path, { expected: "number" });
      return undefined;
    }
    if (!Number.isFinite(value)) {
      this.add("decode.non-finite-number", path);
      return undefined;
    }
    return value;
  }

  integer(value: unknown, path: DiagnosticPath): number | undefined {
    const decoded = this.number(value, path);
    if (
      decoded !== undefined &&
      this.requireSafeIntegers &&
      !Number.isSafeInteger(decoded)
    ) {
      this.add("decode.type", path, { expected: "safe-integer" });
      return undefined;
    }
    return decoded;
  }

  literal<T extends string | number>(
    value: unknown,
    path: DiagnosticPath,
    allowed: readonly T[],
  ): T | undefined {
    if (!allowed.includes(value as T)) {
      this.add("decode.union", path);
      return undefined;
    }
    return value as T;
  }
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function decodeArray<T>(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
  decodeItem: (
    item: unknown,
    itemPath: DiagnosticPath,
    context: ScoreComponentDecodeContext,
  ) => T | undefined,
): readonly T[] | undefined {
  const input = context.array(value, path);
  if (input === undefined) {
    return undefined;
  }
  const output: T[] = [];
  let valid = true;
  for (let index = 0; index < input.length; index += 1) {
    const itemPath = [...path, index];
    if (!hasOwn(input, index)) {
      context.add("decode.json-value", itemPath);
      valid = false;
      continue;
    }
    const decoded = decodeItem(input[index], itemPath, context);
    if (decoded === undefined) {
      valid = false;
    } else {
      pushValue(output, decoded);
    }
  }
  return valid ? output : undefined;
}

function decodeStringItem(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): string | undefined {
  return context.string(value, path);
}

export function decodeFraction(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Fraction | undefined {
  const input = context.object(value, path, ["numerator", "denominator"]);
  if (input === undefined) {
    return undefined;
  }
  const numerator = context.integer(input.numerator, [...path, "numerator"]);
  const denominator = context.integer(
    input.denominator,
    [...path, "denominator"],
  );
  return numerator === undefined || denominator === undefined
    ? undefined
    : { numerator, denominator };
}

export function decodeTimeModification(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): TimeModification | undefined {
  const input = context.object(value, path, ["actualNotes", "normalNotes"]);
  if (input === undefined) {
    return undefined;
  }
  const actualNotes = context.integer(
    input.actualNotes,
    [...path, "actualNotes"],
  );
  const normalNotes = context.integer(
    input.normalNotes,
    [...path, "normalNotes"],
  );
  return actualNotes === undefined || normalNotes === undefined
    ? undefined
    : { actualNotes, normalNotes };
}

export function decodeNoteValue(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): NoteValue | undefined {
  const input = context.object(value, path, ["base", "dots"], [
    "timeModification",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const base = context.literal(input.base, [...path, "base"], [
    1, 2, 4, 8, 16, 32, 64,
  ] as const);
  const dots = context.literal(input.dots, [...path, "dots"], [
    0, 1, 2, 3,
  ] as const);
  const hasTimeModification = hasOwn(input, "timeModification");
  const timeModification = hasTimeModification
    ? decodeTimeModification(
        input.timeModification,
        [...path, "timeModification"],
        context,
      )
    : undefined;
  if (
    base === undefined ||
    dots === undefined ||
    (hasTimeModification && timeModification === undefined)
  ) {
    return undefined;
  }
  return timeModification === undefined
    ? { base, dots }
    : { base, dots, timeModification };
}

export function decodeMeter(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Meter | undefined {
  const input = context.object(value, path, ["numerator", "denominator"]);
  if (input === undefined) {
    return undefined;
  }
  const numerator = context.integer(input.numerator, [...path, "numerator"]);
  const denominator = context.literal(
    input.denominator,
    [...path, "denominator"],
    [1, 2, 4, 8, 16, 32, 64] as const,
  );
  return numerator === undefined || denominator === undefined
    ? undefined
    : { numerator, denominator };
}

export function decodeTempo(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Tempo | undefined {
  const input = context.object(value, path, ["bpm"]);
  if (input === undefined) {
    return undefined;
  }
  const bpm = context.number(input.bpm, [...path, "bpm"]);
  return bpm === undefined ? undefined : { bpm };
}

export function decodeMetadata(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): ScoreMetadata | undefined {
  const input = context.object(value, path, ["title", "authors", "tempo"]);
  if (input === undefined) {
    return undefined;
  }
  const title = context.string(input.title, [...path, "title"]);
  const authors = decodeArray(
    input.authors,
    [...path, "authors"],
    context,
    decodeStringItem,
  );
  const tempo = decodeTempo(input.tempo, [...path, "tempo"], context);
  return title === undefined || authors === undefined || tempo === undefined
    ? undefined
    : { title, authors, tempo };
}

export function decodeMeasureDefinition(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): MeasureDefinition | undefined {
  const input = context.object(value, path, ["id", "meter"], [
    "pickupDuration",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const meter = decodeMeter(input.meter, [...path, "meter"], context);
  const hasPickup = hasOwn(input, "pickupDuration");
  const pickupDuration = hasPickup
    ? decodeFraction(input.pickupDuration, [...path, "pickupDuration"], context)
    : undefined;
  if (
    id === undefined ||
    meter === undefined ||
    (hasPickup && pickupDuration === undefined)
  ) {
    return undefined;
  }
  return pickupDuration === undefined
    ? { id, meter }
    : { id, meter, pickupDuration };
}

export function decodeTransposition(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Transposition | undefined {
  const input = context.object(value, path, [
    "diatonicSteps",
    "chromaticSemitones",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const diatonicSteps = context.integer(
    input.diatonicSteps,
    [...path, "diatonicSteps"],
  );
  const chromaticSemitones = context.integer(
    input.chromaticSemitones,
    [...path, "chromaticSemitones"],
  );
  return diatonicSteps === undefined || chromaticSemitones === undefined
    ? undefined
    : { diatonicSteps, chromaticSemitones };
}

export function decodeInstrument(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): InstrumentDescriptor | undefined {
  const input = context.object(value, path, ["name", "writtenToSounding"]);
  if (input === undefined) {
    return undefined;
  }
  const name = context.string(input.name, [...path, "name"]);
  const writtenToSounding = decodeTransposition(
    input.writtenToSounding,
    [...path, "writtenToSounding"],
    context,
  );
  return name === undefined || writtenToSounding === undefined
    ? undefined
    : { name, writtenToSounding };
}

export function decodeClef(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Clef | undefined {
  const input = context.object(value, path, ["sign", "line"]);
  if (input === undefined) {
    return undefined;
  }
  const sign = context.literal(input.sign, [...path, "sign"], [
    "G",
    "F",
    "C",
  ] as const);
  const line = context.literal(input.line, [...path, "line"], [
    1, 2, 3, 4, 5,
  ] as const);
  return sign === undefined || line === undefined ? undefined : { sign, line };
}

export function decodeStaff(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): StaffDefinition | undefined {
  const input = context.object(value, path, ["id", "lineCount", "defaultClef"]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const lineCount = context.integer(input.lineCount, [...path, "lineCount"]);
  const defaultClef = decodeClef(
    input.defaultClef,
    [...path, "defaultClef"],
    context,
  );
  return id === undefined || lineCount === undefined || defaultClef === undefined
    ? undefined
    : { id, lineCount, defaultClef };
}

export function decodeWrittenPitch(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): WrittenPitch | undefined {
  const input = context.object(value, path, ["step", "alter", "octave"]);
  if (input === undefined) {
    return undefined;
  }
  const step = context.literal(input.step, [...path, "step"], [
    "C",
    "D",
    "E",
    "F",
    "G",
    "A",
    "B",
  ] as const);
  const alter = context.literal(input.alter, [...path, "alter"], [
    -2, -1, 0, 1, 2,
  ] as const);
  const octave = context.integer(input.octave, [...path, "octave"]);
  return step === undefined || alter === undefined || octave === undefined
    ? undefined
    : { step, alter, octave };
}

export function decodeScoreNote(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): ScoreNote | undefined {
  const input = context.object(value, path, ["id", "writtenPitch"]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const writtenPitch = decodeWrittenPitch(
    input.writtenPitch,
    [...path, "writtenPitch"],
    context,
  );
  return id === undefined || writtenPitch === undefined
    ? undefined
    : { id, writtenPitch };
}

export function decodeEventContent(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): RestContent | NotesContent | undefined {
  if (!isPlainRecord(value)) {
    context.add("decode.type", path, { expected: "object" });
    return undefined;
  }
  if (value.kind === "rest") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "rest" };
  }
  if (value.kind === "notes") {
    const input = context.object(value, path, ["kind", "notes"]);
    if (input === undefined) {
      return undefined;
    }
    const notes = decodeArray(
      input.notes,
      [...path, "notes"],
      context,
      decodeScoreNote,
    );
    return notes === undefined ? undefined : { kind: "notes", notes };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

export function decodeRhythmicEvent(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): RhythmicEvent | undefined {
  const input = context.object(value, path, ["id", "duration", "content"], [
    "staffId",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const duration = decodeNoteValue(input.duration, [...path, "duration"], context);
  const content = decodeEventContent(input.content, [...path, "content"], context);
  const hasStaffId = hasOwn(input, "staffId");
  const staffId = hasStaffId
    ? context.string(input.staffId, [...path, "staffId"])
    : undefined;
  if (
    id === undefined ||
    duration === undefined ||
    content === undefined ||
    (hasStaffId && staffId === undefined)
  ) {
    return undefined;
  }
  return staffId === undefined
    ? { id, duration, content }
    : { id, duration, staffId, content };
}

export function decodeSequence(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): MusicSequence | undefined {
  const input = context.object(value, path, ["start", "events"]);
  if (input === undefined) {
    return undefined;
  }
  const start = decodeFraction(input.start, [...path, "start"], context);
  const events = decodeArray(
    input.events,
    [...path, "events"],
    context,
    decodeRhythmicEvent,
  );
  return start === undefined || events === undefined
    ? undefined
    : { start, events };
}

export function decodeVoice(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Voice | undefined {
  const input = context.object(value, path, ["id", "defaultStaffId", "sequence"]);
  if (input === undefined) {
    return undefined;
  }
  const id = context.string(input.id, [...path, "id"]);
  const defaultStaffId = context.string(
    input.defaultStaffId,
    [...path, "defaultStaffId"],
  );
  const sequence = decodeSequence(input.sequence, [...path, "sequence"], context);
  return id === undefined || defaultStaffId === undefined || sequence === undefined
    ? undefined
    : { id, defaultStaffId, sequence };
}

export function decodePartMeasureContent(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): PartMeasureContent | undefined {
  const input = context.object(value, path, ["measureId", "voices"]);
  if (input === undefined) {
    return undefined;
  }
  const measureId = context.string(input.measureId, [...path, "measureId"]);
  const voices = decodeArray(
    input.voices,
    [...path, "voices"],
    context,
    decodeVoice,
  );
  return measureId === undefined || voices === undefined
    ? undefined
    : { measureId, voices };
}

export function decodePart(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): Part | undefined {
  const input = context.object(value, path, [
    "id",
    "name",
    "instrument",
    "staves",
    "measureContents",
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
  const staves = decodeArray(
    input.staves,
    [...path, "staves"],
    context,
    decodeStaff,
  );
  const measureContents = decodeArray(
    input.measureContents,
    [...path, "measureContents"],
    context,
    decodePartMeasureContent,
  );
  return id === undefined ||
    name === undefined ||
    instrument === undefined ||
    staves === undefined ||
    measureContents === undefined
    ? undefined
    : { id, name, instrument, staves, measureContents };
}

function decodeJsonValue(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
  active: Set<object>,
): JsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      context.add("decode.non-finite-number", path);
      return undefined;
    }
    return value;
  }
  if (typeof value !== "object") {
    context.add("decode.json-value", path);
    return undefined;
  }
  if (setHasValue(active, value)) {
    context.add("decode.json-value", path, { reason: "cycle" });
    return undefined;
  }
  addSetValue(active, value);
  try {
    if (Array.isArray(value)) {
      const output: JsonValue[] = [];
      let valid = true;
      for (let index = 0; index < value.length; index += 1) {
        const decoded = decodeJsonValue(
          value[index],
          [...path, index],
          context,
          active,
        );
        if (decoded === undefined) {
          valid = false;
        } else {
          pushValue(output, decoded);
        }
      }
      return valid ? output : undefined;
    }
    if (!isPlainRecord(value)) {
      context.add("decode.json-value", path);
      return undefined;
    }
    const output: Record<string, JsonValue> = {};
    let valid = true;
    for (const key of ownEnumerableStringKeys(value)) {
      const decoded = decodeJsonValue(value[key], [...path, key], context, active);
      if (decoded === undefined) {
        valid = false;
      } else {
        Object.defineProperty(output, key, {
          value: decoded,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return valid ? output : undefined;
  } finally {
    deleteSetValue(active, value);
  }
}

export function decodeExtensionOwner(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): ExtensionOwner | undefined {
  if (!isPlainRecord(value)) {
    context.add("decode.type", path, { expected: "object" });
    return undefined;
  }
  if (value.kind === "score") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "score" };
  }
  if (value.kind === "part") {
    const input = context.object(value, path, ["kind", "partId"]);
    if (input === undefined) {
      return undefined;
    }
    const partId = context.string(input.partId, [...path, "partId"]);
    return partId === undefined ? undefined : { kind: "part", partId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

export function decodeExtension(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): ExtensionBlock | undefined {
  const input = context.object(value, path, [
    "namespace",
    "schemaVersion",
    "owner",
    "payload",
  ]);
  if (input === undefined) {
    return undefined;
  }
  const namespace = context.string(input.namespace, [...path, "namespace"]);
  const schemaVersion = context.integer(
    input.schemaVersion,
    [...path, "schemaVersion"],
  );
  const owner = decodeExtensionOwner(input.owner, [...path, "owner"], context);
  const payloadValue = decodeJsonValue(
    input.payload,
    [...path, "payload"],
    context,
    new setConstructor<object>(),
  );
  const payload =
    payloadValue !== undefined &&
    typeof payloadValue === "object" &&
    payloadValue !== null &&
    !Array.isArray(payloadValue)
      ? (payloadValue as JsonObject)
      : undefined;
  if (payloadValue !== undefined && payload === undefined) {
    context.add("decode.type", [...path, "payload"], { expected: "object" });
  }
  return namespace === undefined ||
    schemaVersion === undefined ||
    owner === undefined ||
    payload === undefined
    ? undefined
    : { namespace, schemaVersion, owner, payload };
}

export function decodeScoreDocumentInternal(
  value: unknown,
  context: ScoreComponentDecodeContext,
): ScoreDocument | undefined {
  const input = context.object(value, [], [
    "schemaVersion",
    "id",
    "metadata",
    "measureDefinitions",
    "parts",
    "extensions",
  ]);
  if (input === undefined) {
    return undefined;
  }

  const schemaVersion = context.string(input.schemaVersion, ["schemaVersion"]);
  if (
    schemaVersion !== undefined &&
    schemaVersion !== SCORE_DOCUMENT_SCHEMA_VERSION
  ) {
    context.add("decode.unsupported-schema-version", ["schemaVersion"], {
      actual: schemaVersion,
    });
  }
  const id = context.string(input.id, ["id"]);
  const metadata = decodeMetadata(input.metadata, ["metadata"], context);
  const measureDefinitions = decodeArray(
    input.measureDefinitions,
    ["measureDefinitions"],
    context,
    decodeMeasureDefinition,
  );
  const parts = decodeArray(input.parts, ["parts"], context, decodePart);
  const extensions = decodeArray(
    input.extensions,
    ["extensions"],
    context,
    decodeExtension,
  );

  return schemaVersion !== SCORE_DOCUMENT_SCHEMA_VERSION ||
    id === undefined ||
    metadata === undefined ||
    measureDefinitions === undefined ||
    parts === undefined ||
    extensions === undefined
    ? undefined
    : {
        schemaVersion: SCORE_DOCUMENT_SCHEMA_VERSION,
        id,
        metadata,
        measureDefinitions,
        parts,
        extensions,
      };
}
