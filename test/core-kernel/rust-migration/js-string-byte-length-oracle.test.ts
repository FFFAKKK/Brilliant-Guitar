import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createJsStringOracle } from "./js-string-oracle";

test("lossless byte budgets distinguish UTF-8 text from escaped JSON bytes", () => {
  const expected = createJsStringOracle().samples.map(sample => {
    const text = String.fromCharCode(...sample.units);
    const utf8Bytes = Buffer.byteLength(text, "utf8");
    assert.equal(new TextEncoder().encode(text).byteLength, utf8Bytes, sample.label);
    return { label: sample.label, utf8Bytes, jsonBytes: Buffer.byteLength(JSON.stringify(text), "utf8") };
  });
  const actual: unknown = JSON.parse(readFileSync("test/core-kernel/rust-migration/fixtures/js-string-byte-length-oracle-v1.json", "utf8"));
  assert.deepEqual(actual, { oracleVersion: 1, samples: expected });
});
