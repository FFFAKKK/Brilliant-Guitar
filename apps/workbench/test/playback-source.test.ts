import assert from "node:assert/strict";
import test from "node:test";
import { createScoreSession } from "../host/score-session.ts";
import { projectPlaybackSource } from "../host/playback-projection.ts";
import { isPlaybackSourceProjection } from "../src/contracts/playback.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";

function documentFixture() {
  const bus = createScoreSession({ title: "播放投影", measureCount: 1 });
  const read = bus.read();
  assert.ok(read.ok);
  return read.value.snapshot.document;
}

function withEvents(document: ScoreDocument, events: ScoreDocument["parts"][number]["measureContents"][number]["voices"][number]["sequence"]["events"]): ScoreDocument {
  return {
    ...document,
    parts: document.parts.map((part) => ({
      ...part,
      measureContents: part.measureContents.map((content) => ({
        ...content,
        voices: content.voices.map((voice) => ({
          ...voice,
          sequence: { ...voice.sequence, events },
        })),
      })),
    })),
  };
}

test("playback source preserves the atomic version, tempo, transposition, event ids and exact durations", () => {
  const base = documentFixture();
  const document = withEvents({
    ...base,
    metadata: { ...base.metadata, tempo: { bpm: 132 } },
    parts: base.parts.map((part) => ({
      ...part,
      instrument: { ...part.instrument,
        writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 } },
    })),
  }, [
    { id: "note-dotted", duration: { base: 4, dots: 1 }, content: { kind: "notes", notes: [
      { id: "pitch-c5", writtenPitch: { step: "C", alter: 1, octave: 5 } },
    ] } },
    { id: "rest-eighth", duration: { base: 8, dots: 0 }, content: { kind: "rest" } },
  ]);

  const projection = projectPlaybackSource(document, 17);
  assert.ok(isPlaybackSourceProjection(projection));
  assert.equal(projection.kind, "ready");
  if (projection.kind !== "ready") return;
  assert.equal(projection.documentId, document.id);
  assert.equal(projection.documentVersion, 17);
  assert.equal(projection.bpm, 132);
  assert.deepEqual(projection.writtenToSounding, { diatonicSteps: -7, chromaticSemitones: -12 });
  assert.deepEqual(projection.measures[0]?.events, [
    { id: "note-dotted", duration: { numerator: 3, denominator: 8 },
      content: { kind: "note", writtenPitch: { step: "C", alter: 1, octave: 5 } } },
    { id: "rest-eighth", duration: { numerator: 1, denominator: 8 }, content: { kind: "rest" } },
  ]);
});

test("unsupported chords and complex rhythm stay explicit instead of producing a silent plan", () => {
  const base = documentFixture();
  const chord = withEvents(base, [{ id: "chord", duration: { base: 4, dots: 0 }, content: {
    kind: "notes", notes: [
      { id: "c", writtenPitch: { step: "C", alter: 0, octave: 4 } },
      { id: "e", writtenPitch: { step: "E", alter: 0, octave: 4 } },
    ],
  } }]);
  const chordProjection = projectPlaybackSource(chord, 1);
  assert.equal(chordProjection.kind, "unsupported");
  if (chordProjection.kind === "unsupported") assert.equal(chordProjection.code, "playback.chord-unsupported");

  const tuplet = withEvents(base, [{ id: "triplet", duration: { base: 8, dots: 0,
    timeModification: { actualNotes: 3, normalNotes: 2 } }, content: { kind: "rest" } }]);
  const tupletProjection = projectPlaybackSource(tuplet, 2);
  assert.equal(tupletProjection.kind, "unsupported");
  if (tupletProjection.kind === "unsupported") assert.equal(tupletProjection.code, "playback.rhythm-unsupported");
});

test("projection validation rejects stale or malformed playback facts", () => {
  const projection = projectPlaybackSource(documentFixture(), 3);
  assert.ok(isPlaybackSourceProjection(projection));
  assert.ok(!isPlaybackSourceProjection({ ...projection, documentVersion: -1 }));
  if (projection.kind !== "ready") return;
  assert.ok(!isPlaybackSourceProjection({ ...projection, bpm: 0 }));
  assert.ok(!isPlaybackSourceProjection({ ...projection, measures: [projection.measures[0], projection.measures[0]] }));
});
