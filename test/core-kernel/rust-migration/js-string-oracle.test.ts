import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CommandBus } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { createJsStringOracle } from "./js-string-oracle";

test("lossless string fixture reproduces ECMAScript code units, escaping and ordering", () => {
  const oracle = createJsStringOracle();
  assert.deepEqual(JSON.parse(readFileSync("test/core-kernel/rust-migration/fixtures/js-string-oracle-v1.json", "utf8")), oracle);
  for (const sample of oracle.samples) {
    const text = String.fromCharCode(...sample.units);
    assert.equal(JSON.parse(sample.token), text, sample.label);
    assert.equal(JSON.parse(sample.escapedToken), text, sample.label);
    assert.deepEqual(JSON.parse(`{${sample.token}:1}`), { [text]: 1 }, sample.label);
  }
  for (const token of oracle.invalidTokens) {
    let parsed: unknown;
    try { parsed = JSON.parse(token); } catch (error) {
      assert.ok(error instanceof SyntaxError);
      continue;
    }
    assert.notEqual(typeof parsed, "string", `not a JSON string token: ${token}`);
  }
});

test("TS oracle admits and preserves unpaired units in text, IDs, references and opaque keys", () => {
  for (const text of ["\ud800", "\udc00", "🎸", "\ufffd", "\ue000", "\\ud800", "a\0b"]) {
    const source = createCoreScoreFixture();
    const document = {
      ...source,
      metadata: { ...source.metadata, title: text, authors: [text] },
      parts: source.parts.map(part => ({
        ...part, name: text, instrument: { ...part.instrument, name: text },
        staves: part.staves.map(staff => ({ ...staff, id: text })),
        measureContents: part.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({ ...voice, defaultStaffId: text })) })),
      })),
      extensions: [{ namespace: "example.lossless", schemaVersion: 1, owner: { kind: "score" as const }, payload: { [text]: text } }],
    };
    const created = CommandBus.create(document);
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("TS accepted string domain required");
    const read = created.value.read();
    if (!read.ok) throw new Error("TS read required");
    assert.deepEqual(read.value.snapshot.document, document);
  }
});

test("TS history preserves unpaired metadata without replacing it by U+FFFD", () => {
  for (const title of ["\ud800", "\udc00"]) {
    const document = createCoreScoreFixture();
    const created = CommandBus.create(document);
    if (!created.ok) throw new Error("TS session required");
    const metadata = { ...document.metadata, title };
    const command = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata } };
    for (const [action, expected] of [
      [() => created.value.submit(command), metadata],
      [() => created.value.undo(), document.metadata],
      [() => created.value.redo(), metadata],
    ] as const) {
      assert.equal(action().status, "committed");
      const read = created.value.read();
      if (!read.ok) throw new Error("TS history read required");
      assert.deepEqual(read.value.snapshot.document.metadata, expected);
    }
  }
});
