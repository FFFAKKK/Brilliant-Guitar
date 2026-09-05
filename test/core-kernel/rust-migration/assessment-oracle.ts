import assert = require("node:assert/strict");
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { CommandBus, decodeScoreDocument, type ScoreDocument } from "../../../src/core-kernel/index";
import { ScoreComponentDecodeContext, decodeScoreDocumentInternal } from "../../../src/core-kernel/codec/score-component-codec";
import { K1_SCORE_FEATURE_PROFILE, validateScoreFeatureProfile, type ScoreFeatureProfile } from "../../../src/core-kernel/profiles/score-feature-profile";
import { validateScoreDocumentSemantics } from "../../../src/core-kernel/validation/validate-score-semantics";
import { createCoreScoreFixture } from "../fixtures/core-score";

type Path = readonly (string | number)[];
export interface AssessmentPatch { readonly path: Path; readonly value: unknown }
interface AssessmentCase {
  readonly id: string;
  readonly patches: readonly AssessmentPatch[];
  readonly profile?: ScoreFeatureProfile;
}

const measure = ["measureDefinitions", 0] as const;
const part = ["parts", 0] as const;
const content = [...part, "measureContents", 0] as const;
const voice = [...content, "voices", 0] as const;
const sequence = [...voice, "sequence"] as const;
const event = [...sequence, "events", 0] as const;
const note = [...event, "content", "notes", 0] as const;
const pitch = [...note, "writtenPitch"] as const;
const transpose = [...part, "instrument", "writtenToSounding"] as const;
const extension = { namespace: "example.opaque", schemaVersion: 1, owner: { kind: "score" }, payload: {} };
const emptyVoice = { id: "voice-other", defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 }, events: [] } };
const patch = (path: Path, value: unknown): AssessmentPatch => ({ path, value });
const sample = (id: string, ...patches: AssessmentPatch[]): AssessmentCase => ({ id, patches });

// These are independent TypeScript oracle inputs, not Rust candidate outputs.
// Direct semantic calls intentionally include invalid musical values that some
// decode entry points reject first. Every case stays JSON-serializable.
export const ASSESSMENT_CASES: readonly AssessmentCase[] = [
  sample("supported"),
  sample("finite-tempo", patch(["metadata", "tempo", "bpm"], 120.5)),
  sample("finite-opaque-values", patch(["extensions"], [{ ...extension, payload: { values: [0.125, 1e100, Number.MIN_VALUE, Number.MAX_VALUE] } }])),
  sample("empty-score-id", patch(["id"], "")),
  sample("duplicate-note-id", patch([...note, "id"], "score-1")),
  sample("tempo-zero", patch(["metadata", "tempo", "bpm"], 0)),
  sample("measures-required", patch(["measureDefinitions"], []), patch([...part, "measureContents"], [])),
  sample("parts-required", patch(["parts"], [])),
  sample("staff-required", patch([...part, "staves"], [])),
  sample("voice-required", patch([...content, "voices"], [])),
  sample("notes-required", patch([...event, "content", "notes"], [])),
  sample("meter-numerator-zero", patch([...measure, "meter", "numerator"], 0)),
  sample("meter-numerator-fractional", patch([...measure, "meter", "numerator"], 4.5)),
  sample("meter-numerator-unsafe", patch([...measure, "meter", "numerator"], Number.MAX_SAFE_INTEGER + 1)),
  sample("meter-denominator-invalid", patch([...measure, "meter", "denominator"], 3)),
  sample("staff-line-count-fractional", patch([...part, "staves", 0, "lineCount"], 0.5)),
  sample("transposition-fractional", patch([...transpose, "diatonicSteps"], 0.5)),
  sample("transposition-unsafe", patch([...transpose, "chromaticSemitones"], Number.MAX_SAFE_INTEGER + 1)),
  sample("written-pitch-alter-invalid", patch([...pitch, "alter"], 3)),
  sample("written-pitch-octave-invalid", patch([...pitch, "octave"], 9)),
  sample("sounding-octave-invalid", patch([...transpose, "diatonicSteps"], 100)),
  sample("sounding-alter-invalid", patch([...transpose, "chromaticSemitones"], 100)),
  sample("sounding-diatonic-overflow", patch([...transpose, "diatonicSteps"], Number.MAX_SAFE_INTEGER)),
  sample("sounding-chromatic-overflow", patch([...transpose, "chromaticSemitones"], Number.MAX_SAFE_INTEGER)),
  sample("start-noncanonical", patch([...sequence, "start"], { numerator: 2, denominator: 4 })),
  sample("start-negative", patch([...sequence, "start"], { numerator: -1, denominator: 4 })),
  sample("start-out-of-bounds", patch([...sequence, "start"], { numerator: 2, denominator: 1 })),
  sample("pickup-zero", patch([...measure, "pickupDuration"], { numerator: 0, denominator: 1 })),
  sample("pickup-noncanonical", patch([...measure, "pickupDuration"], { numerator: 2, denominator: 4 })),
  sample("pickup-exceeds-measure", patch([...measure, "pickupDuration"], { numerator: 5, denominator: 4 })),
  sample("pickup-comparison-overflow", patch([...measure, "meter"], { numerator: Number.MAX_SAFE_INTEGER, denominator: 2 }), patch([...measure, "pickupDuration"], { numerator: Number.MAX_SAFE_INTEGER, denominator: 2 })),
  sample("event-base-invalid", patch([...event, "duration", "base"], 3)),
  sample("event-dots-invalid", patch([...event, "duration", "dots"], 4)),
  sample("event-tuplet-invalid", patch([...event, "duration", "timeModification"], { actualNotes: 0, normalNotes: 2 })),
  sample("event-tuplet-overflow", patch([...event, "duration"], { base: 64, dots: 3, timeModification: { actualNotes: Number.MAX_SAFE_INTEGER, normalNotes: 1 } })),
  sample("sequence-exceeds-measure", patch([...event, "duration", "base"], 1)),
  sample("measure-reference-missing", patch([...content, "measureId"], "missing-measure")),
  sample("measure-coverage-missing", patch([...part, "measureContents"], [])),
  sample("measure-coverage-duplicate", patch([...part, "measureContents"], [{ measureId: "measure-1", voices: [emptyVoice] }, { measureId: "measure-1", voices: [] }])),
  sample("default-staff-missing", patch([...voice, "defaultStaffId"], "missing-staff")),
  sample("event-staff-missing", patch([...event, "staffId"], "missing-staff")),
  sample("extension-namespace-invalid", patch(["extensions"], [{ ...extension, namespace: "invalid" }])),
  sample("extension-schema-version-invalid", patch(["extensions"], [{ ...extension, schemaVersion: 0.5 }])),
  sample("extension-owner-missing", patch(["extensions"], [{ ...extension, owner: { kind: "part", partId: "missing-part" } }])),
  sample("extension-duplicate", patch(["extensions"], [extension, extension])),
  sample("extension-payload-invalid", patch(["extensions"], [{ ...extension, payload: [] }])),
  sample("ordered-independent-faults", patch(["id"], ""), patch(["metadata", "tempo", "bpm"], 0), patch([...measure, "meter", "numerator"], 0), patch([...part, "staves", 0, "id"], "part-1"), patch([...pitch, "alter"], 3), patch([...event, "duration", "dots"], 4), patch(["extensions"], [{ ...extension, namespace: "invalid", schemaVersion: 0 }])),
  sample("first-duplicate-measure-is-reference-authority", patch(["measureDefinitions"], [{ id: "measure-1", meter: { numerator: 4, denominator: 4 } }, { id: "measure-1", meter: { numerator: 0, denominator: 4 } }])),
  sample("coverage-order-is-input-order", patch(["measureDefinitions"], [{ id: "measure-z", meter: { numerator: 4, denominator: 4 } }, { id: "measure-a", meter: { numerator: 4, denominator: 4 } }]), patch([...part, "measureContents"], [])),
  sample("invalid-duration-does-not-suppress-later-note", patch([...event, "duration", "base"], 3), patch([...sequence, "events", 1, "content"], { kind: "notes", notes: [{ id: "note-1", writtenPitch: { step: "C", alter: 3, octave: 4 } }] })),
  sample("unsupported-incomplete-sequence", patch([...sequence, "events"], [])),
  sample("unsupported-start", patch([...sequence, "start"], { numerator: 1, denominator: 4 }), patch([...sequence, "events"], [])),
  sample("unsupported-pickup", patch([...measure, "pickupDuration"], { numerator: 1, denominator: 2 }), patch([...sequence, "events"], [])),
  sample("unsupported-tuplet", patch([...event, "duration", "timeModification"], { actualNotes: 3, normalNotes: 2 })),
  {
    ...sample("custom-profile-ordered-constraints"),
    profile: {
      ...K1_SCORE_FEATURE_PROFILE, id: "example.restrictive",
      partCount: { minimum: 0, maximum: 0 }, staffCountPerPart: { minimum: 0, maximum: 0 },
      voiceCountPerMeasure: { minimum: 0, maximum: 0 }, meters: [{ numerator: 3, denominator: 4 }],
      noteValueBases: [1], noteValueDots: [1], maximumNotesPerEvent: 0,
    },
  },
  {
    ...sample("custom-profile-permits-tuplets", patch([...event, "duration", "timeModification"], { actualNotes: 3, normalNotes: 2 })),
    profile: { ...K1_SCORE_FEATURE_PROFILE, id: "example.tuplets", allowTimeModification: true, requireCompleteMeasure: false },
  },
];

export function applyAssessmentPatches(base: unknown, patches: readonly AssessmentPatch[]): ScoreDocument {
  const document: unknown = structuredClone(base);
  for (const { path, value } of patches) {
    assert.ok(path.length > 0);
    let parent = document;
    for (const key of path.slice(0, -1)) {
      assert.ok(parent !== null && typeof parent === "object");
      parent = (parent as Record<string | number, unknown>)[key];
    }
    assert.ok(parent !== null && typeof parent === "object");
    const key = path[path.length - 1];
    assert.ok(key !== undefined);
    (parent as Record<string | number, unknown>)[key] = structuredClone(value);
  }
  return document as ScoreDocument;
}

export function observeAssessment(document: ScoreDocument, profile?: ScoreFeatureProfile) {
  const decoded = decodeScoreDocument(document);
  const strictContext = new ScoreComponentDecodeContext(true);
  const strictDocument = decodeScoreDocumentInternal(document, strictContext);
  const created = CommandBus.create(document);
  return {
    decode: decoded.ok ? { ok: true } : decoded,
    strictDecode: { ok: strictDocument !== undefined && strictContext.diagnostics.length === 0, diagnostics: strictContext.diagnostics },
    semantics: validateScoreDocumentSemantics(document),
    support: validateScoreFeatureProfile(document, profile),
    create: created.ok ? { ok: true } : created,
  };
}

export function buildAssessmentOracle() {
  const baseDocument = createCoreScoreFixture();
  return {
    oracleVersion: 1,
    source: "TypeScript public decode, semantic/profile validation and CommandBus.create; strict component decode recorded separately",
    baseDocument,
    cases: ASSESSMENT_CASES.map((entry) => ({
      ...entry,
      expected: observeAssessment(applyAssessmentPatches(baseDocument, entry.patches), entry.profile),
    })),
  };
}

export const ASSESSMENT_ORACLE_PATH = "test/core-kernel/rust-migration/fixtures/semantic-assessment-oracle-v1.json";
export const GENERATED_ASSESSMENT_ORACLE_PATH = "test/core-kernel/rust-migration/fixtures/generated-assessment-oracle-v1.json";

export function buildGeneratedAssessmentOracle() {
  const baseDocument = createCoreScoreFixture();
  const safeCombinationIds = new Set([
    "supported", "finite-tempo", "empty-score-id", "duplicate-note-id", "tempo-zero",
    "meter-numerator-zero", "meter-numerator-fractional", "meter-numerator-unsafe", "meter-denominator-invalid",
    "staff-line-count-fractional", "transposition-fractional", "transposition-unsafe",
    "written-pitch-alter-invalid", "written-pitch-octave-invalid", "sounding-octave-invalid",
    "sounding-alter-invalid", "sounding-diatonic-overflow", "sounding-chromatic-overflow",
    "start-noncanonical", "start-negative", "start-out-of-bounds", "pickup-zero", "pickup-noncanonical",
    "pickup-exceeds-measure", "pickup-comparison-overflow", "event-base-invalid", "event-dots-invalid",
    "event-tuplet-invalid", "event-tuplet-overflow", "sequence-exceeds-measure", "measure-reference-missing",
    "default-staff-missing", "event-staff-missing",
  ]);
  const pool = ASSESSMENT_CASES.filter((entry) => safeCombinationIds.has(entry.id));
  let seed = 0x6a09e667;
  function next(): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  }
  const inputs: AssessmentCase[] = [];
  for (let index = 0; index < 256; index += 1) {
    const patches: AssessmentPatch[] = [];
    const count = 1 + next() % 8;
    for (let mutation = 0; mutation < count; mutation += 1) {
      const selected = pool[next() % pool.length];
      assert.ok(selected);
      patches.push(...selected.patches);
    }
    inputs.push(sample(`combination-${index}`, ...patches));
  }
  for (const step of ["C", "D", "E", "F", "G", "A", "B"]) {
    for (const alter of [-2, 0, 2]) {
      for (const octave of [0, 4, 8]) {
        for (const [diatonicSteps, chromaticSemitones] of [[0, 0], [1, 2], [-1, -2], [7, 12], [-7, -12]]) {
          inputs.push(sample(`pitch-${step}-${alter}-${octave}-${diatonicSteps}`,
            patch(pitch, { step, alter, octave }), patch(transpose, { diatonicSteps, chromaticSemitones })));
        }
      }
    }
  }
  inputs.push(
    sample("start-extra-field", patch([...sequence, "start"], { numerator: 0, denominator: 1, extra: true })),
    sample("pickup-extra-field", patch([...measure, "pickupDuration"], { numerator: 1, denominator: 1, extra: true })),
    sample("namespace-final-line-feed", patch(["extensions"], [{ ...extension, namespace: "example.opaque\n" }])),
    sample("namespace-final-crlf", patch(["extensions"], [{ ...extension, namespace: "example.opaque\r\n" }])),
    sample("direct-null-payload", patch(["extensions"], [{ ...extension, payload: null }])),
  );
  return {
    oracleVersion: 1, seed: "6a09e667", baseDocument,
    cases: inputs.map((entry) => {
      const document = applyAssessmentPatches(baseDocument, entry.patches);
      return { ...entry, expected: { semantics: validateScoreDocumentSemantics(document), support: validateScoreFeatureProfile(document) } };
    }),
  };
}

// Explicit fixture creation only; tests never regenerate expected results.
if (require.main === module && process.argv[2] === "--write") {
  writeFileSync(resolve(ASSESSMENT_ORACLE_PATH), `${JSON.stringify(buildAssessmentOracle(), null, 2)}\n`, "utf8");
  writeFileSync(resolve(GENERATED_ASSESSMENT_ORACLE_PATH), `${JSON.stringify(buildGeneratedAssessmentOracle())}\n`, "utf8");
}
