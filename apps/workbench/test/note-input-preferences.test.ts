import assert from "node:assert/strict";
import test from "node:test";
import { retainedNoteInputToolState } from "../src/editor/note-input-preferences.ts";

const state = {
  duration: { base: 8 as const, dots: 1 as const }, accidental: "sharp" as const, alter: 1 as const,
  rest: true, previewPitch: { step: "C" as const, octave: 5, alter: 1 as const },
};

test("post-entry preferences retain all tools, rhythm only, or reset to the configured duration", () => {
  assert.equal(retainedNoteInputToolState(state, { retention: "all", defaultDuration: { base: 4, dots: 0 } }), state);
  assert.deepEqual(retainedNoteInputToolState(state, { retention: "rhythm", defaultDuration: { base: 4, dots: 0 } }), {
    duration: { base: 8, dots: 1 }, accidental: "none", alter: 0, rest: false, previewPitch: null,
  });
  assert.deepEqual(retainedNoteInputToolState(state, { retention: "reset", defaultDuration: { base: 16, dots: 0 } }), {
    duration: { base: 16, dots: 0 }, accidental: "none", alter: 0, rest: false, previewPitch: null,
  });
});
