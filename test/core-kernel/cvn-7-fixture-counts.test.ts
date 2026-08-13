import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  decodeScoreDocument,
  encodeScoreDocumentJson,
  parseScoreDocumentJson,
  validateScoreDocumentSemantics,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  createCvn7QualificationScore,
  createRepresentativeCvn7Score,
  createStressCvn7Score,
  type Cvn7QualificationScoreFixture,
} from "./fixtures/cvn-7-qualification-score";
import type { QualificationEntityCountsV1 } from "./qualification/cvn-7-qualification-contracts";

function countDocument(document: ScoreDocument): QualificationEntityCountsV1 {
  let staves = 0;
  let measureContents = 0;
  let voices = 0;
  let events = 0;
  let notes = 0;
  for (const part of document.parts) {
    staves += part.staves.length;
    measureContents += part.measureContents.length;
    for (const content of part.measureContents) {
      voices += content.voices.length;
      for (const voice of content.voices) {
        events += voice.sequence.events.length;
        for (const event of voice.sequence.events) {
          notes += event.content.kind === "notes" ? event.content.notes.length : 0;
        }
      }
    }
  }
  return {
    measures: document.measureDefinitions.length,
    parts: document.parts.length,
    staves,
    measureContents,
    voices,
    events,
    notes,
    knownExtensionBlocks: document.extensions.filter(
      ({ namespace }) =>
        namespace === "fixture.cvn7.score" || namespace === "fixture.cvn7.part",
    ).length,
    unknownExtensionBlocks: document.extensions.filter(
      ({ namespace }) => namespace === "fixture.cvn7.unknown",
    ).length,
  };
}

function allIds(document: ScoreDocument): readonly string[] {
  const ids: string[] = [document.id];
  for (const measure of document.measureDefinitions) ids.push(measure.id);
  for (const part of document.parts) {
    ids.push(part.id);
    for (const staff of part.staves) ids.push(staff.id);
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        ids.push(voice.id);
        for (const event of voice.sequence.events) {
          ids.push(event.id);
          if (event.content.kind === "notes") {
            for (const note of event.content.notes) ids.push(note.id);
          }
        }
      }
    }
  }
  return ids;
}

function assertFixtureIntegrity(
  fixture: Cvn7QualificationScoreFixture,
  expected: QualificationEntityCountsV1,
): void {
  assert.deepEqual(fixture.counts, expected);
  assert.deepEqual(countDocument(fixture.document), expected);
  assert.equal(fixture.canonicalNotes.length, expected.notes);
  assert.equal(new Set(allIds(fixture.document)).size, allIds(fixture.document).length);
  assert.deepEqual(validateScoreDocumentSemantics(fixture.document), {
    ok: true,
    diagnostics: [],
  });
  for (const part of fixture.document.parts) {
    assert.deepEqual(
      part.measureContents.map(({ measureId }) => measureId),
      fixture.document.measureDefinitions.map(({ id }) => id),
    );
    assert.equal(part.staves.length, 1);
    for (const content of part.measureContents) {
      assert.equal(content.voices.length, 2);
      for (const voice of content.voices) {
        assert.equal(voice.defaultStaffId, part.staves[0]?.id);
        assert.deepEqual(voice.sequence.start, { numerator: 0, denominator: 1 });
        assert.equal(voice.sequence.events.length, 8);
        assert.equal(
          voice.sequence.events.every(
            ({ duration }) => duration.base === 8 && duration.dots === 0,
          ),
          true,
        );
      }
    }
  }
  const encoded = encodeScoreDocumentJson(fixture.document);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) assert.fail("fixture must encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) assert.fail("fixture JSON must parse");
  assert.deepEqual(parsed.value, fixture.document);
  const decoded = decodeScoreDocument(fixture.document);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) assert.fail("fixture must decode");
  assert.deepEqual(decoded.value, fixture.document);
}

test("CVN7-D-FC130 qualification fixture sizes do not become document caps", () => {
  const stress = createStressCvn7Score();
  const extraMeasureId = "cvn7-m-0400";
  const beyondStress: ScoreDocument = {
    ...stress.document,
    measureDefinitions: [
      ...stress.document.measureDefinitions,
      { id: extraMeasureId, meter: { numerator: 4, denominator: 4 } },
    ],
    parts: stress.document.parts.map((part, partIndex) => {
      const staffId = part.staves[0]?.id;
      assert.notEqual(staffId, undefined);
      return {
        ...part,
        measureContents: [
          ...part.measureContents,
          {
            measureId: extraMeasureId,
            voices: [0, 1].map((voiceIndex) => ({
              id: `cvn7-v-${String(partIndex).padStart(2, "0")}-0400-${voiceIndex}`,
              defaultStaffId: staffId ?? "",
              sequence: {
                start: { numerator: 0, denominator: 1 },
                events: Array.from({ length: 8 }, (_, eventIndex) => ({
                  id: `cvn7-e-${String(partIndex).padStart(2, "0")}-0400-${voiceIndex}-${eventIndex}`,
                  duration: { base: 8 as const, dots: 0 as const },
                  content: eventIndex % 2 === 0
                    ? {
                        kind: "notes" as const,
                        notes: [{
                          id: `cvn7-n-${String(partIndex).padStart(2, "0")}-0400-${voiceIndex}-${eventIndex}`,
                          writtenPitch: { step: "C" as const, alter: 0 as const, octave: 4 },
                        }],
                      }
                    : { kind: "rest" as const },
                })),
              },
            })),
          },
        ],
      };
    }),
  };
  assert.equal(countDocument(beyondStress).events, 102_656);
  assert.deepEqual(validateScoreDocumentSemantics(beyondStress), {
    ok: true,
    diagnostics: [],
  });
  assert.equal(CommandBus.create(beyondStress).ok, true);
});

test("CVN7-D-FC131 representative fixture has exact deterministic counts", () => {
  const first = createRepresentativeCvn7Score();
  const second = createCvn7QualificationScore({
    fixtureKind: "representative",
    generatorVersion: 1,
    seed: "cvn7-representative-v1",
  });
  const expected = {
    measures: 200,
    parts: 8,
    staves: 8,
    measureContents: 1_600,
    voices: 3_200,
    events: 25_600,
    notes: 12_800,
    knownExtensionBlocks: 9,
    unknownExtensionBlocks: 1,
  } as const;
  assertFixtureIntegrity(first, expected);
  assert.deepEqual(second, first);
  assert.equal(first.firstNote.noteId, "cvn7-n-00-0000-0-0");
  assert.equal(first.lastNote.noteId, "cvn7-n-07-0199-1-6");
});

test("CVN7-D-FC132 stress fixture has exact deterministic counts", () => {
  const first = createStressCvn7Score();
  const second = createStressCvn7Score();
  const expected = {
    measures: 400,
    parts: 16,
    staves: 16,
    measureContents: 6_400,
    voices: 12_800,
    events: 102_400,
    notes: 51_200,
    knownExtensionBlocks: 17,
    unknownExtensionBlocks: 1,
  } as const;
  assertFixtureIntegrity(first, expected);
  assert.deepEqual(second, first);
  assert.equal(first.firstNote.noteId, "cvn7-n-00-0000-0-0");
  assert.equal(first.lastNote.noteId, "cvn7-n-15-0399-1-6");
});

test("CVN7 fixture generator rejects non-canonical identities before construction", () => {
  assert.deepEqual(
    createCvn7QualificationScore({
      seed: "cvn7-representative-v1",
      generatorVersion: 1,
      fixtureKind: "representative",
    }),
    createRepresentativeCvn7Score(),
  );
  assert.throws(
    () => createCvn7QualificationScore({
      fixtureKind: "representative",
      generatorVersion: 1,
      seed: "cvn7-stress-v1",
    }),
    /identity/u,
  );
  assert.throws(
    () => createCvn7QualificationScore({
      seed: "cvn7-representative-v1",
      generatorVersion: 1,
      fixtureKind: "representative",
      extra: true,
    }),
    /keys/u,
  );
  assert.throws(
    () => createCvn7QualificationScore({
      fixtureKind: "representative",
      generatorVersion: 1,
    }),
    /keys/u,
  );
  const accessor = Object.defineProperty(
    {
      generatorVersion: 1,
      seed: "cvn7-representative-v1",
    },
    "fixtureKind",
    { enumerable: true, get: () => "representative" },
  );
  assert.throws(
    () => createCvn7QualificationScore(accessor),
    /data properties/u,
  );
});
