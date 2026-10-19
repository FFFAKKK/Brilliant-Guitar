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

test("clipboard projects musical properties without source IDs or geometry, including 32nd rests", async () => {
  const event = { id: "source-id", x: 100, duration: { base: 32 as const, dots: 0 as const }, content: { kind: "rest" as const }, private: "omit" };
  const value = createScoreClipboardFragment([event]);
  assert.deepEqual(value.events, [{ duration: { base: 32, dots: 0 }, content: { kind: "rest" } }]);
  event.duration.base = 32; assert.notEqual(value.events[0]!.duration, event.duration);
  let text = ""; const clipboard = new ScoreClipboard({ readText: async () => text, writeText: async v => { text = v; } });
  await clipboard.write({ ...fragment, events: [event] }); assert.equal(clipboard.scope, "system");
  assert.equal(text.includes("source-id"), false); assert.deepEqual(await clipboard.read(), value);
  clipboard.dispose(); await assert.rejects(clipboard.write(value), /disposed/);
});

test("clipboard disposal isolates late reads, and denied operations report session fallback", async () => {
  let resolve!: (text: string) => void;
  const clipboard = new ScoreClipboard({ readText: () => new Promise(yes => { resolve = yes; }), writeText: async () => { throw new Error("denied"); } });
  await clipboard.write(fragment); assert.equal(clipboard.scope, "session");
  const read = clipboard.read(); clipboard.dispose(); resolve(encodeScoreClipboardFragment(fragment));
  assert.equal(await read, null); await assert.rejects(clipboard.read(), /disposed/);
});

test("an older async clipboard read cannot replace a newer copied fragment", async () => {
  let resolve!: (text: string) => void;
  const clipboard = new ScoreClipboard({ readText: () => new Promise(yes => { resolve = yes; }), writeText: async () => { throw new Error("denied"); } });
  const older = clipboard.read(), next = createScoreClipboardFragment([fragment.events[1]!]);
  await clipboard.write(next); resolve(encodeScoreClipboardFragment(fragment));
  assert.equal(await older, null); assert.equal(clipboard.scope, "session");
  const memory = clipboard.read(); resolve("unrelated"); assert.deepEqual(await memory, next); clipboard.dispose();
});
