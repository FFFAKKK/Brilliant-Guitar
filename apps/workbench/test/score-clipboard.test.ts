import assert from "node:assert/strict";
import test from "node:test";
import { createScoreClipboardFragment, decodeScoreClipboardFragment,
  encodeScoreClipboardFragment } from "../src/contracts/score-clipboard.ts";
import { ScoreClipboard } from "../src/editor/score-clipboard.ts";

const fragment = createScoreClipboardFragment([
  { duration: { base: 8, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 5, alter: 1 } } },
  { duration: { base: 4, dots: 1 }, content: { kind: "rest" } },
]);

test("score clipboard format round-trips only validated musical event data", () => {
  assert.deepEqual(decodeScoreClipboardFragment(encodeScoreClipboardFragment(fragment)), fragment);
  assert.equal(decodeScoreClipboardFragment("plain text"), null);
  assert.equal(decodeScoreClipboardFragment(JSON.stringify({ ...fragment, version: 2 })), null);
  assert.equal(decodeScoreClipboardFragment(JSON.stringify({ ...fragment, events: [] })), null);
});

test("session clipboard remains available when browser clipboard access fails", async () => {
  const clipboard = new ScoreClipboard({
    async readText() { throw new Error("denied"); },
    async writeText() { throw new Error("denied"); },
  });
  await clipboard.write(fragment);
  assert.deepEqual(await clipboard.read(), fragment);
});

test("valid browser content replaces memory while invalid content falls back", async () => {
  let text = encodeScoreClipboardFragment(fragment);
  const clipboard = new ScoreClipboard({ async readText() { return text; }, async writeText(value) { text = value; } });
  assert.deepEqual(await clipboard.read(), fragment);
  text = "unrelated text";
  assert.deepEqual(await clipboard.read(), fragment);
});
