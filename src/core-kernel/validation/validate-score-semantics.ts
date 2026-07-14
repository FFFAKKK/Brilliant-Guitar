import { isJsonValue, type ExtensionBlock } from "../domain/extensions";
import {
  addFractions,
  compareFractions,
  isCanonicalFraction,
  type Fraction,
} from "../domain/fraction";
import {
  getEffectiveMeasureDuration,
  getNoteValueDuration,
  isNoteValueBase,
} from "../domain/musical-time";
import {
  isTransposition,
  isWrittenPitch,
  transposeWrittenPitch,
} from "../domain/pitch";
import type {
  MeasureDefinition,
  Part,
  RhythmicEvent,
  ScoreDocument,
  Voice,
} from "../domain/score-document";
import {
  createDiagnostic,
  type DiagnosticCode,
  type DiagnosticPath,
  type SemanticDiagnostic,
  type SemanticDiagnosticCode,
} from "./diagnostics";

export interface ValidationReport {
  readonly ok: boolean;
  readonly diagnostics: readonly SemanticDiagnostic[];
}

interface ValidationState {
  readonly diagnostics: SemanticDiagnostic[];
  readonly ids: Set<string>;
  readonly measureById: Map<string, MeasureDefinition>;
  readonly partIds: Set<string>;
}

function add(
  state: ValidationState,
  code: SemanticDiagnosticCode,
  path: DiagnosticPath,
  details?: Record<string, string | number | boolean | null>,
): void {
  state.diagnostics.push(createDiagnostic(code, path, details));
}

function registerId(
  state: ValidationState,
  id: string,
  path: DiagnosticPath,
): void {
  if (typeof id !== "string" || id.length === 0) {
    add(state, "semantic.id-empty", path);
    return;
  }
  if (state.ids.has(id)) {
    add(state, "semantic.id-duplicate", path, { id });
    return;
  }
  state.ids.add(id);
}

function validateMetadata(document: ScoreDocument, state: ValidationState): void {
  const bpm = document.metadata.tempo.bpm;
  if (!Number.isFinite(bpm) || bpm <= 0) {
    add(state, "semantic.tempo-invalid", ["metadata", "tempo", "bpm"]);
  }
}

function validateFraction(
  value: Fraction,
  path: DiagnosticPath,
  state: ValidationState,
  requirePositive: boolean,
): boolean {
  if (!isCanonicalFraction(value)) {
    add(state, "semantic.fraction-non-canonical", path);
    return false;
  }
  if (requirePositive ? value.numerator <= 0 : value.numerator < 0) {
    add(state, "semantic.fraction-sign-invalid", path);
    return false;
  }
  return true;
}

function validateMeasures(document: ScoreDocument, state: ValidationState): void {
  if (document.measureDefinitions.length === 0) {
    add(state, "semantic.measure-required", ["measureDefinitions"]);
    return;
  }

  document.measureDefinitions.forEach((measure, measureIndex) => {
    const path = ["measureDefinitions", measureIndex] as const;
    registerId(state, measure.id, [...path, "id"]);
    if (!state.measureById.has(measure.id)) {
      state.measureById.set(measure.id, measure);
    }

    if (
      !Number.isSafeInteger(measure.meter.numerator) ||
      measure.meter.numerator <= 0
    ) {
      add(state, "semantic.meter-numerator-invalid", [
        ...path,
        "meter",
        "numerator",
      ]);
    }
    if (!isNoteValueBase(measure.meter.denominator)) {
      add(state, "semantic.meter-denominator-invalid", [
        ...path,
        "meter",
        "denominator",
      ]);
    }

    if (measure.pickupDuration !== undefined) {
      const pickupPath = [...path, "pickupDuration"];
      const pickupValid = validateFraction(
        measure.pickupDuration,
        pickupPath,
        state,
        true,
      );
      const regularDuration = getEffectiveMeasureDuration(measure.meter);
      if (pickupValid && regularDuration.ok) {
        const comparison = compareFractions(
          measure.pickupDuration,
          regularDuration.value,
        );
        if (!comparison.ok) {
          add(state, "semantic.time-arithmetic-overflow", pickupPath);
        } else if (comparison.value > 0) {
          add(state, "semantic.pickup-exceeds-measure", pickupPath);
        }
      }
    }
  });
}

function validateEvent(
  event: RhythmicEvent,
  eventPath: DiagnosticPath,
  part: Part,
  staffIds: ReadonlySet<string>,
  transpositionValid: boolean,
  state: ValidationState,
): Fraction | undefined {
  registerId(state, event.id, [...eventPath, "id"]);
  if (event.staffId !== undefined && !staffIds.has(event.staffId)) {
    add(state, "semantic.staff-reference-missing", [
      ...eventPath,
      "staffId",
    ]);
  }

  if (event.content.kind === "notes") {
    if (event.content.notes.length === 0) {
      add(state, "semantic.notes-required", [...eventPath, "content", "notes"]);
    }
    event.content.notes.forEach((note, noteIndex) => {
      const notePath = [...eventPath, "content", "notes", noteIndex];
      registerId(state, note.id, [...notePath, "id"]);
      if (!isWrittenPitch(note.writtenPitch)) {
        add(state, "semantic.written-pitch-invalid", [
          ...notePath,
          "writtenPitch",
        ]);
      } else if (transpositionValid) {
        const sounding = transposeWrittenPitch(
          note.writtenPitch,
          part.instrument.writtenToSounding,
        );
        if (!sounding.ok) {
          add(state, "semantic.sounding-pitch-invalid", [
            ...notePath,
            "writtenPitch",
          ], { reason: sounding.code });
        }
      }
    });
  }

  const duration = getNoteValueDuration(event.duration);
  if (!duration.ok) {
    add(
      state,
      duration.code === "fraction-overflow"
        ? "semantic.time-arithmetic-overflow"
        : "semantic.note-value-invalid",
      [...eventPath, "duration"],
      { reason: duration.code },
    );
    return undefined;
  }
  return duration.value;
}

function validateVoice(
  voice: Voice,
  voicePath: DiagnosticPath,
  part: Part,
  measure: MeasureDefinition | undefined,
  staffIds: ReadonlySet<string>,
  transpositionValid: boolean,
  state: ValidationState,
): void {
  registerId(state, voice.id, [...voicePath, "id"]);
  if (!staffIds.has(voice.defaultStaffId)) {
    add(state, "semantic.staff-reference-missing", [
      ...voicePath,
      "defaultStaffId",
    ]);
  }

  const startPath = [...voicePath, "sequence", "start"];
  const startValid = validateFraction(
    voice.sequence.start,
    startPath,
    state,
    false,
  );
  const measureDuration =
    measure === undefined
      ? undefined
      : getEffectiveMeasureDuration(measure.meter, measure.pickupDuration);
  if (measureDuration !== undefined && !measureDuration.ok) {
    add(state, "semantic.measure-duration-invalid", startPath, {
      reason: measureDuration.code,
    });
  }

  let current: Fraction | undefined = startValid
    ? voice.sequence.start
    : undefined;
  if (current !== undefined && measureDuration?.ok) {
    const comparison = compareFractions(current, measureDuration.value);
    if (!comparison.ok) {
      add(state, "semantic.time-arithmetic-overflow", startPath);
      current = undefined;
    } else if (comparison.value > 0) {
      add(state, "semantic.sequence-start-out-of-bounds", startPath);
    }
  }

  voice.sequence.events.forEach((event, eventIndex) => {
    const eventPath = [
      ...voicePath,
      "sequence",
      "events",
      eventIndex,
    ];
    const duration = validateEvent(
      event,
      eventPath,
      part,
      staffIds,
      transpositionValid,
      state,
    );
    if (current === undefined || duration === undefined) {
      return;
    }
    const next = addFractions(current, duration);
    if (!next.ok) {
      add(state, "semantic.time-arithmetic-overflow", [
        ...eventPath,
        "duration",
      ]);
      current = undefined;
      return;
    }
    current = next.value;
    if (measureDuration?.ok) {
      const comparison = compareFractions(current, measureDuration.value);
      if (!comparison.ok) {
        add(state, "semantic.time-arithmetic-overflow", [
          ...eventPath,
          "duration",
        ]);
        current = undefined;
      } else if (comparison.value > 0) {
        add(state, "semantic.sequence-exceeds-measure", eventPath);
      }
    }
  });
}

function validatePart(
  part: Part,
  partIndex: number,
  state: ValidationState,
): void {
  const partPath = ["parts", partIndex] as const;
  registerId(state, part.id, [...partPath, "id"]);
  state.partIds.add(part.id);

  const transpositionValid = isTransposition(
    part.instrument.writtenToSounding,
  );
  if (!transpositionValid) {
    add(state, "semantic.transposition-invalid", [
      ...partPath,
      "instrument",
      "writtenToSounding",
    ]);
  }

  if (part.staves.length === 0) {
    add(state, "semantic.staff-required", [...partPath, "staves"]);
  }
  const staffIds = new Set<string>();
  part.staves.forEach((staff, staffIndex) => {
    const staffPath = [...partPath, "staves", staffIndex];
    registerId(state, staff.id, [...staffPath, "id"]);
    staffIds.add(staff.id);
    if (!Number.isSafeInteger(staff.lineCount) || staff.lineCount <= 0) {
      add(state, "semantic.staff-line-count-invalid", [
        ...staffPath,
        "lineCount",
      ]);
    }
  });

  const seenMeasureIds = new Set<string>();
  part.measureContents.forEach((content, contentIndex) => {
    const contentPath = [...partPath, "measureContents", contentIndex];
    const measure = state.measureById.get(content.measureId);
    if (measure === undefined) {
      add(state, "semantic.measure-reference-missing", [
        ...contentPath,
        "measureId",
      ]);
    }
    if (seenMeasureIds.has(content.measureId)) {
      add(state, "semantic.measure-coverage-duplicate", [
        ...contentPath,
        "measureId",
      ]);
    }
    seenMeasureIds.add(content.measureId);

    if (content.voices.length === 0) {
      add(state, "semantic.voice-required", [...contentPath, "voices"]);
    }
    content.voices.forEach((voice, voiceIndex) => {
      validateVoice(
        voice,
        [...contentPath, "voices", voiceIndex],
        part,
        measure,
        staffIds,
        transpositionValid,
        state,
      );
    });
  });

  documentMeasureIds(state).forEach((measureId) => {
    if (!seenMeasureIds.has(measureId)) {
      add(state, "semantic.measure-coverage-missing", [
        ...partPath,
        "measureContents",
      ], { measureId });
    }
  });
}

function documentMeasureIds(state: ValidationState): readonly string[] {
  return [...state.measureById.keys()];
}

const EXTENSION_NAMESPACE =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

function extensionOwnerKey(extension: ExtensionBlock): string {
  return extension.owner.kind === "score"
    ? "score"
    : `part:${extension.owner.partId}`;
}

function validateExtensions(
  document: ScoreDocument,
  state: ValidationState,
): void {
  const ownerNamespaces = new Set<string>();
  document.extensions.forEach((extension, extensionIndex) => {
    const path = ["extensions", extensionIndex] as const;
    if (!EXTENSION_NAMESPACE.test(extension.namespace)) {
      add(state, "semantic.extension-namespace-invalid", [
        ...path,
        "namespace",
      ]);
    }
    if (
      !Number.isSafeInteger(extension.schemaVersion) ||
      extension.schemaVersion <= 0
    ) {
      add(state, "semantic.extension-schema-version-invalid", [
        ...path,
        "schemaVersion",
      ]);
    }
    if (
      extension.owner.kind === "part" &&
      !state.partIds.has(extension.owner.partId)
    ) {
      add(state, "semantic.extension-owner-missing", [
        ...path,
        "owner",
        "partId",
      ]);
    }
    const uniquenessKey = `${extensionOwnerKey(extension)}|${extension.namespace}`;
    if (ownerNamespaces.has(uniquenessKey)) {
      add(state, "semantic.extension-duplicate", path);
    }
    ownerNamespaces.add(uniquenessKey);

    if (!isJsonValue(extension.payload) || Array.isArray(extension.payload)) {
      add(state, "semantic.extension-payload-invalid", [
        ...path,
        "payload",
      ]);
    }
  });
}

export function validateScoreDocumentSemantics(
  document: ScoreDocument,
): ValidationReport {
  const state: ValidationState = {
    diagnostics: [],
    ids: new Set<string>(),
    measureById: new Map<string, MeasureDefinition>(),
    partIds: new Set<string>(),
  };

  registerId(state, document.id, ["id"]);
  validateMetadata(document, state);
  validateMeasures(document, state);
  if (document.parts.length === 0) {
    add(state, "semantic.part-required", ["parts"]);
  }
  document.parts.forEach((part, partIndex) =>
    validatePart(part, partIndex, state),
  );
  validateExtensions(document, state);

  return {
    ok: state.diagnostics.length === 0,
    diagnostics: state.diagnostics,
  };
}
