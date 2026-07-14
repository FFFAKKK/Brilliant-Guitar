import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";
import {
  cloneCoreScoreFixture,
  createCoreScoreFixture,
} from "./fixtures/core-score";

type Diagnostic = {
  readonly code: string;
  readonly messageKey: string;
  readonly path: readonly (string | number)[];
};
type ValidationReport = {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
};
type ValidateSemantics = (document: unknown) => ValidationReport;

function getValidator(): ValidateSemantics {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.validateScoreDocumentSemantics, "function");
  return api.validateScoreDocumentSemantics as ValidateSemantics;
}

test("a valid general Core score passes semantic validation without mutation", () => {
  const validate = getValidator();
  const document = createCoreScoreFixture();
  const before = structuredClone(document);

  assert.deepEqual(validate(document), { ok: true, diagnostics: [] });
  assert.deepEqual(document, before);
});

test("semantic validation reports global duplicate ids and broken staff references", () => {
  const validate = getValidator();
  const document = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      staves: Array<{ id: string }>;
      measureContents: Array<{
        voices: Array<{
          defaultStaffId: string;
          sequence: { events: Array<{ id: string }> };
        }>;
      }>;
    }>;
  };
  const voice = document.parts[0]!.measureContents[0]!.voices[0]!;
  voice.sequence.events[1]!.id = voice.sequence.events[0]!.id;
  voice.defaultStaffId = "missing-staff";

  const report = validate(document);
  assert.equal(report.ok, false);
  assert.deepEqual(
    report.diagnostics.map(({ code, path }) => ({ code, path })),
    [
      {
        code: "semantic.staff-reference-missing",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "defaultStaffId",
        ],
      },
      {
        code: "semantic.id-duplicate",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          1,
          "id",
        ],
      },
    ],
  );
});

test("semantic validation enforces measure coverage and exact time bounds", () => {
  const validate = getValidator();
  const missingCoverage = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: unknown[] }>;
  };
  missingCoverage.parts[0]!.measureContents = [];
  assert.deepEqual(
    validate(missingCoverage).diagnostics.map((item) => item.code),
    ["semantic.measure-coverage-missing"],
  );

  const nonCanonical = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{ sequence: { start: { numerator: number; denominator: number } } }>;
      }>;
    }>;
  };
  nonCanonical.parts[0]!.measureContents[0]!.voices[0]!.sequence.start = {
    numerator: 0,
    denominator: 2,
  };
  assert.deepEqual(
    validate(nonCanonical).diagnostics.map((item) => item.code),
    ["semantic.fraction-non-canonical"],
  );

  const overflowing = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: { events: Array<{ duration: { base: number; dots: number } }> };
        }>;
      }>;
    }>;
  };
  overflowing.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!.duration = {
    base: 1,
    dots: 0,
  };
  assert.equal(
    validate(overflowing).diagnostics.some(
      (item) => item.code === "semantic.sequence-exceeds-measure",
    ),
    true,
  );
});

test("semantic validation enforces pitch, transposition, and extension envelopes", () => {
  const validate = getValidator();
  const document = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      instrument: {
        writtenToSounding: {
          diatonicSteps: number;
          chromaticSemitones: number;
        };
      };
    }>;
    extensions: unknown[];
  };
  document.parts[0]!.instrument.writtenToSounding.diatonicSteps = 0.5;
  document.extensions = [
    {
      namespace: "Invalid Namespace",
      schemaVersion: 0,
      owner: { kind: "part", partId: "missing-part" },
      payload: { invalid: Number.NaN },
    },
  ];

  const codes = validate(document).diagnostics.map((item) => item.code);
  assert.deepEqual(codes, [
    "semantic.transposition-invalid",
    "semantic.extension-namespace-invalid",
    "semantic.extension-schema-version-invalid",
    "semantic.extension-owner-missing",
    "semantic.extension-payload-invalid",
  ]);
});

test("semantic validation enforces duplicate measure coverage and extension ownership uniqueness", () => {
  const validate = getValidator();
  const coverage = cloneCoreScoreFixture();
  const duplicateContent = structuredClone(coverage.parts[0]!.measureContents[0]!);
  const duplicateVoice = duplicateContent.voices[0]!;
  (duplicateVoice as { id: string }).id = "voice-2";
  duplicateVoice.sequence.events.forEach((event, eventIndex) => {
    (event as { id: string }).id = `event-${eventIndex + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (
    coverage.parts[0]!.measureContents as typeof coverage.parts[0]["measureContents"][number][]
  ).push(duplicateContent);
  assert.deepEqual(
    validate(coverage).diagnostics.map((item) => item.code),
    ["semantic.measure-coverage-duplicate"],
  );

  const extensions = cloneCoreScoreFixture();
  (
    extensions as unknown as {
      extensions: Array<{
        namespace: string;
        schemaVersion: number;
        owner: { kind: "score" };
        payload: Record<string, never>;
      }>;
    }
  ).extensions = [
    {
      namespace: "org.example.same",
      schemaVersion: 1,
      owner: { kind: "score" },
      payload: {},
    },
    {
      namespace: "org.example.same",
      schemaVersion: 2,
      owner: { kind: "score" },
      payload: {},
    },
  ];
  assert.deepEqual(
    validate(extensions).diagnostics.map((item) => item.code),
    ["semantic.extension-duplicate"],
  );
});

test("semantic validation enforces required collections, tempo, and nonempty note content", () => {
  const validate = getValidator();
  const empty = cloneCoreScoreFixture() as unknown as {
    metadata: { tempo: { bpm: number } };
    measureDefinitions: unknown[];
    parts: unknown[];
  };
  empty.metadata.tempo.bpm = 0;
  empty.measureDefinitions = [];
  empty.parts = [];
  assert.deepEqual(
    validate(empty).diagnostics.map((item) => item.code),
    [
      "semantic.tempo-invalid",
      "semantic.measure-required",
      "semantic.part-required",
    ],
  );

  const noNotes = cloneCoreScoreFixture();
  const content = noNotes.parts[0]!.measureContents[0]!.voices[0]!.sequence
    .events[0]!.content;
  assert.equal(content.kind, "notes");
  if (content.kind === "notes") {
    (content as unknown as { notes: unknown[] }).notes = [];
  }
  assert.deepEqual(
    validate(noNotes).diagnostics.map((item) => item.code),
    ["semantic.notes-required"],
  );
});

test("measureContents order does not create a second measure-order truth", () => {
  const validate = getValidator();
  const ordered = cloneCoreScoreFixture();
  (ordered.measureDefinitions as typeof ordered.measureDefinitions[number][]).push({
    id: "measure-2",
    meter: { numerator: 4, denominator: 4 },
  });
  const secondContent = structuredClone(ordered.parts[0]!.measureContents[0]!);
  (secondContent as { measureId: string }).measureId = "measure-2";
  const secondVoice = secondContent.voices[0]!;
  (secondVoice as { id: string }).id = "voice-2";
  secondVoice.sequence.events.forEach((event, index) => {
    (event as { id: string }).id = `event-${index + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (
    ordered.parts[0]!.measureContents as typeof ordered.parts[0]["measureContents"][number][]
  ).push(secondContent);

  const reordered = structuredClone(ordered);
  (
    reordered.parts[0]!.measureContents as typeof reordered.parts[0]["measureContents"][number][]
  ).reverse();

  assert.deepEqual(validate(ordered), { ok: true, diagnostics: [] });
  assert.deepEqual(validate(reordered), validate(ordered));
});

test("global ids collide across different entity kinds", () => {
  const validate = getValidator();
  const document = cloneCoreScoreFixture();
  const staffId = document.parts[0]!.staves[0]!.id;
  const content =
    document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!
      .content;
  assert.equal(content.kind, "notes");
  if (content.kind === "notes") {
    (content.notes[0] as { id: string }).id = staffId;
  }

  assert.deepEqual(
    validate(document).diagnostics.map(({ code, path }) => ({ code, path })),
    [
      {
        code: "semantic.id-duplicate",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "sequence",
          "events",
          0,
          "content",
          "notes",
          0,
          "id",
        ],
      },
    ],
  );
});
