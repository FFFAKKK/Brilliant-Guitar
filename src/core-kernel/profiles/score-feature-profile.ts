import {
  addFractions,
  compareFractions,
  type Fraction,
} from "../domain/fraction";
import {
  getEffectiveMeasureDuration,
  getNoteValueDuration,
  type Meter,
  type NoteValueBase,
  type NoteValueDots,
} from "../domain/musical-time";
import type { ScoreDocument } from "../domain/score-document";
import {
  createDiagnostic,
  type SemanticDiagnostic,
  type UnsupportedDiagnostic,
  type UnsupportedDiagnosticCode,
} from "../validation/diagnostics";
import {
  validateScoreDocumentSemantics,
} from "../validation/validate-score-semantics";

export interface CardinalityConstraint {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ScoreFeatureProfile {
  readonly id: string;
  readonly partCount: CardinalityConstraint;
  readonly staffCountPerPart: CardinalityConstraint;
  readonly voiceCountPerMeasure: CardinalityConstraint;
  readonly meters: readonly Meter[];
  readonly allowPickup: boolean;
  readonly requireSequenceStartAtZero: boolean;
  readonly requireCompleteMeasure: boolean;
  readonly noteValueBases: readonly NoteValueBase[];
  readonly noteValueDots: readonly NoteValueDots[];
  readonly allowTimeModification: boolean;
  readonly maximumNotesPerEvent: number;
}

export type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | {
      readonly status: "unsupported";
      readonly diagnostics: readonly UnsupportedDiagnostic[];
    }
  | {
      readonly status: "invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    };

const K1_PART_COUNT = Object.freeze({ minimum: 1, maximum: 1 });
const K1_STAFF_COUNT_PER_PART = Object.freeze({ minimum: 1, maximum: 1 });
const K1_VOICE_COUNT_PER_MEASURE = Object.freeze({
  minimum: 1,
  maximum: 1,
});
const K1_METERS: readonly Meter[] = Object.freeze([
  Object.freeze({ numerator: 4, denominator: 4 }),
]);
const K1_NOTE_VALUE_BASES: readonly NoteValueBase[] = Object.freeze([4, 8, 16]);
const K1_NOTE_VALUE_DOTS: readonly NoteValueDots[] = Object.freeze([0]);

export const K1_SCORE_FEATURE_PROFILE: ScoreFeatureProfile = Object.freeze({
  id: "brilliant-guitar.k1",
  partCount: K1_PART_COUNT,
  staffCountPerPart: K1_STAFF_COUNT_PER_PART,
  voiceCountPerMeasure: K1_VOICE_COUNT_PER_MEASURE,
  meters: K1_METERS,
  allowPickup: false,
  requireSequenceStartAtZero: true,
  requireCompleteMeasure: true,
  noteValueBases: K1_NOTE_VALUE_BASES,
  noteValueDots: K1_NOTE_VALUE_DOTS,
  allowTimeModification: false,
  maximumNotesPerEvent: 1,
});

function withinCardinality(
  value: number,
  constraint: CardinalityConstraint,
): boolean {
  return value >= constraint.minimum && value <= constraint.maximum;
}

function meterIsSupported(
  meter: Meter,
  supported: readonly Meter[],
): boolean {
  return supported.some(
    (candidate) =>
      candidate.numerator === meter.numerator &&
      candidate.denominator === meter.denominator,
  );
}

function appendUnsupported(
  diagnostics: UnsupportedDiagnostic[],
  code: UnsupportedDiagnosticCode,
  path: readonly (string | number)[],
): void {
  diagnostics.push(createDiagnostic(code, path));
}

export function validateScoreFeatureProfile(
  document: ScoreDocument,
  profile: ScoreFeatureProfile = K1_SCORE_FEATURE_PROFILE,
): ScoreSupportResult {
  const semanticReport = validateScoreDocumentSemantics(document);
  if (!semanticReport.ok) {
    return { status: "invalid", diagnostics: semanticReport.diagnostics };
  }

  const diagnostics: UnsupportedDiagnostic[] = [];
  if (!withinCardinality(document.parts.length, profile.partCount)) {
    appendUnsupported(diagnostics, "unsupported.part-count", ["parts"]);
  }

  const measureById = new Map(
    document.measureDefinitions.map((measure) => [measure.id, measure] as const),
  );
  document.measureDefinitions.forEach((measure, measureIndex) => {
    if (!meterIsSupported(measure.meter, profile.meters)) {
      appendUnsupported(diagnostics, "unsupported.meter", [
        "measureDefinitions",
        measureIndex,
        "meter",
      ]);
    }
    if (!profile.allowPickup && measure.pickupDuration !== undefined) {
      appendUnsupported(diagnostics, "unsupported.pickup", [
        "measureDefinitions",
        measureIndex,
        "pickupDuration",
      ]);
    }
  });

  document.parts.forEach((part, partIndex) => {
    if (!withinCardinality(part.staves.length, profile.staffCountPerPart)) {
      appendUnsupported(diagnostics, "unsupported.staff-count", [
        "parts",
        partIndex,
        "staves",
      ]);
    }

    part.measureContents.forEach((content, contentIndex) => {
      const contentPath = [
        "parts",
        partIndex,
        "measureContents",
        contentIndex,
      ] as const;
      if (
        !withinCardinality(
          content.voices.length,
          profile.voiceCountPerMeasure,
        )
      ) {
        appendUnsupported(diagnostics, "unsupported.voice-count", [
          ...contentPath,
          "voices",
        ]);
      }

      const measure = measureById.get(content.measureId);
      content.voices.forEach((voice, voiceIndex) => {
        const voicePath = [...contentPath, "voices", voiceIndex] as const;
        if (
          profile.requireSequenceStartAtZero &&
          (voice.sequence.start.numerator !== 0 ||
            voice.sequence.start.denominator !== 1)
        ) {
          appendUnsupported(diagnostics, "unsupported.sequence-start", [
            ...voicePath,
            "sequence",
            "start",
          ]);
        }

        let end: Fraction | undefined = voice.sequence.start;
        voice.sequence.events.forEach((event, eventIndex) => {
          const eventPath = [
            ...voicePath,
            "sequence",
            "events",
            eventIndex,
          ] as const;
          if (!profile.noteValueBases.includes(event.duration.base)) {
            appendUnsupported(diagnostics, "unsupported.note-value-base", [
              ...eventPath,
              "duration",
              "base",
            ]);
          }
          if (!profile.noteValueDots.includes(event.duration.dots)) {
            appendUnsupported(diagnostics, "unsupported.dots", [
              ...eventPath,
              "duration",
              "dots",
            ]);
          }
          if (
            !profile.allowTimeModification &&
            event.duration.timeModification !== undefined
          ) {
            appendUnsupported(
              diagnostics,
              "unsupported.time-modification",
              [...eventPath, "duration", "timeModification"],
            );
          }
          if (
            event.content.kind === "notes" &&
            event.content.notes.length > profile.maximumNotesPerEvent
          ) {
            appendUnsupported(diagnostics, "unsupported.chord", [
              ...eventPath,
              "content",
              "notes",
            ]);
          }

          const duration = getNoteValueDuration(event.duration);
          if (end !== undefined && duration.ok) {
            const next = addFractions(end, duration.value);
            end = next.ok ? next.value : undefined;
          } else {
            end = undefined;
          }
        });

        if (profile.requireCompleteMeasure && measure !== undefined) {
          const measureDuration = getEffectiveMeasureDuration(
            measure.meter,
            measure.pickupDuration,
          );
          const comparison =
            end !== undefined && measureDuration.ok
              ? compareFractions(end, measureDuration.value)
              : undefined;
          if (comparison === undefined || !comparison.ok || comparison.value !== 0) {
            appendUnsupported(diagnostics, "unsupported.sequence-duration", [
              ...voicePath,
              "sequence",
            ]);
          }
        }
      });
    });
  });

  return diagnostics.length === 0
    ? { status: "supported", diagnostics: [] }
    : { status: "unsupported", diagnostics };
}
