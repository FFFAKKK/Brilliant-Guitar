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
  readonly details?: Readonly<Record<string, unknown>>;
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

type ExpectedDiagnostic = {
  readonly code: string;
  readonly messageKey: string;
  readonly path: readonly (string | number)[];
  readonly details?: Readonly<Record<string, unknown>>;
};

function expectDiagnostics(
  document: unknown,
  expected: readonly ExpectedDiagnostic[],
): void {
  const validate = getValidator();
  const first = validate(document);
  assert.equal(first.ok, false);
  assert.deepEqual(first.diagnostics, expected);
  assert.deepEqual(validate(document), first);
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

test("semantic diagnostics cover empty ids, fraction signs, and invalid meters", () => {
  const emptyId = cloneCoreScoreFixture() as unknown as { id: string };
  emptyId.id = "";
  expectDiagnostics(emptyId, [
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: ["id"],
    },
  ]);

  const negativeStart = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: { start: { numerator: number; denominator: number } };
        }>;
      }>;
    }>;
  };
  negativeStart.parts[0]!.measureContents[0]!.voices[0]!.sequence.start = {
    numerator: -1,
    denominator: 1,
  };
  expectDiagnostics(negativeStart, [
    {
      code: "semantic.fraction-sign-invalid",
      messageKey: "core.semantic.fraction-sign-invalid",
      path: [
        "parts",
        0,
        "measureContents",
        0,
        "voices",
        0,
        "sequence",
        "start",
      ],
    },
  ]);

  const numerator = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{ meter: { numerator: number } }>;
  };
  numerator.measureDefinitions[0]!.meter.numerator = 0;
  expectDiagnostics(numerator, [
    {
      code: "semantic.meter-numerator-invalid",
      messageKey: "core.semantic.meter-numerator-invalid",
      path: ["measureDefinitions", 0, "meter", "numerator"],
    },
    {
      code: "semantic.measure-duration-invalid",
      messageKey: "core.semantic.measure-duration-invalid",
      path: [
        "parts",
        0,
        "measureContents",
        0,
        "voices",
        0,
        "sequence",
        "start",
      ],
      details: { reason: "meter-numerator-invalid" },
    },
  ]);

  const denominator = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{ meter: { denominator: number } }>;
  };
  denominator.measureDefinitions[0]!.meter.denominator = 3;
  expectDiagnostics(denominator, [
    {
      code: "semantic.meter-denominator-invalid",
      messageKey: "core.semantic.meter-denominator-invalid",
      path: ["measureDefinitions", 0, "meter", "denominator"],
    },
    {
      code: "semantic.measure-duration-invalid",
      messageKey: "core.semantic.measure-duration-invalid",
      path: [
        "parts",
        0,
        "measureContents",
        0,
        "voices",
        0,
        "sequence",
        "start",
      ],
      details: { reason: "meter-denominator-invalid" },
    },
  ]);
});

test("semantic diagnostics cover note values and time boundaries", () => {
  const invalidNoteValue = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: {
            events: Array<{ duration: { base: number; dots: number } }>;
          };
        }>;
      }>;
    }>;
  };
  invalidNoteValue.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!
    .duration = { base: 3, dots: 0 };
  expectDiagnostics(invalidNoteValue, [
    {
      code: "semantic.note-value-invalid",
      messageKey: "core.semantic.note-value-invalid",
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
        "duration",
      ],
      details: { reason: "note-value-base-invalid" },
    },
  ]);

  const overflow = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: {
            events: Array<{
              duration: {
                base: number;
                dots: number;
                timeModification?: {
                  actualNotes: number;
                  normalNotes: number;
                };
              };
            }>;
          };
        }>;
      }>;
    }>;
  };
  overflow.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!.duration =
    {
      base: 4,
      dots: 3,
      timeModification: {
        actualNotes: 1,
        normalNotes: Number.MAX_SAFE_INTEGER,
      },
    };
  expectDiagnostics(overflow, [
    {
      code: "semantic.time-arithmetic-overflow",
      messageKey: "core.semantic.time-arithmetic-overflow",
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
        "duration",
      ],
      details: { reason: "fraction-overflow" },
    },
  ]);

  const pickup = cloneCoreScoreFixture() as unknown as {
    measureDefinitions: Array<{
      pickupDuration?: { numerator: number; denominator: number };
    }>;
  };
  pickup.measureDefinitions[0]!.pickupDuration = {
    numerator: 5,
    denominator: 4,
  };
  expectDiagnostics(pickup, [
    {
      code: "semantic.pickup-exceeds-measure",
      messageKey: "core.semantic.pickup-exceeds-measure",
      path: ["measureDefinitions", 0, "pickupDuration"],
    },
  ]);

  const start = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: {
            start: { numerator: number; denominator: number };
            events: unknown[];
          };
        }>;
      }>;
    }>;
  };
  const sequence = start.parts[0]!.measureContents[0]!.voices[0]!.sequence;
  sequence.start = { numerator: 5, denominator: 4 };
  sequence.events = [];
  expectDiagnostics(start, [
    {
      code: "semantic.sequence-start-out-of-bounds",
      messageKey: "core.semantic.sequence-start-out-of-bounds",
      path: [
        "parts",
        0,
        "measureContents",
        0,
        "voices",
        0,
        "sequence",
        "start",
      ],
    },
  ]);
});

test("semantic diagnostics cover measure references and required staff and voice collections", () => {
  const missingMeasure = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ measureId: string }> }>;
  };
  missingMeasure.parts[0]!.measureContents[0]!.measureId = "missing-measure";
  expectDiagnostics(missingMeasure, [
    {
      code: "semantic.measure-reference-missing",
      messageKey: "core.semantic.measure-reference-missing",
      path: ["parts", 0, "measureContents", 0, "measureId"],
    },
    {
      code: "semantic.measure-coverage-missing",
      messageKey: "core.semantic.measure-coverage-missing",
      path: ["parts", 0, "measureContents"],
      details: { measureId: "measure-1" },
    },
  ]);

  const noStaff = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ staves: unknown[] }>;
  };
  noStaff.parts[0]!.staves = [];
  expectDiagnostics(noStaff, [
    {
      code: "semantic.staff-required",
      messageKey: "core.semantic.staff-required",
      path: ["parts", 0, "staves"],
    },
    {
      code: "semantic.staff-reference-missing",
      messageKey: "core.semantic.staff-reference-missing",
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
  ]);

  const noVoice = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: Array<{ voices: unknown[] }> }>;
  };
  noVoice.parts[0]!.measureContents[0]!.voices = [];
  expectDiagnostics(noVoice, [
    {
      code: "semantic.voice-required",
      messageKey: "core.semantic.voice-required",
      path: ["parts", 0, "measureContents", 0, "voices"],
    },
  ]);
});

test("semantic diagnostics cover written, sounding, and staff-line pitch boundaries", () => {
  const written = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      measureContents: Array<{
        voices: Array<{
          sequence: {
            events: Array<{
              content: {
                kind: string;
                notes: Array<{ writtenPitch: { step: string } }>;
              };
            }>;
          };
        }>;
      }>;
    }>;
  };
  written.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!.content
    .notes[0]!.writtenPitch.step = "H";
  expectDiagnostics(written, [
    {
      code: "semantic.written-pitch-invalid",
      messageKey: "core.semantic.written-pitch-invalid",
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
        "writtenPitch",
      ],
    },
  ]);

  const sounding = cloneCoreScoreFixture() as unknown as {
    parts: Array<{
      instrument: { writtenToSounding: { chromaticSemitones: number } };
    }>;
  };
  sounding.parts[0]!.instrument.writtenToSounding.chromaticSemitones = 100;
  expectDiagnostics(sounding, [
    {
      code: "semantic.sounding-pitch-invalid",
      messageKey: "core.semantic.sounding-pitch-invalid",
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
        "writtenPitch",
      ],
      details: { reason: "derived-pitch-alter-out-of-range" },
    },
  ]);

  const staffLines = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ staves: Array<{ lineCount: number }> }>;
  };
  staffLines.parts[0]!.staves[0]!.lineCount = 0;
  expectDiagnostics(staffLines, [
    {
      code: "semantic.staff-line-count-invalid",
      messageKey: "core.semantic.staff-line-count-invalid",
      path: ["parts", 0, "staves", 0, "lineCount"],
    },
  ]);
});
