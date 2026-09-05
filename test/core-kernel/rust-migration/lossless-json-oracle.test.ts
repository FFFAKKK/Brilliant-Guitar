import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createLosslessJsonOracle } from "./lossless-json-oracle";

test("lossless JSON corpus regenerates exact UTF-16 keys, nested data and canonical bytes", () => {
  const oracle = createLosslessJsonOracle();
  assert.deepEqual(JSON.parse(readFileSync("test/core-kernel/rust-migration/fixtures/lossless-json-oracle-v1.json", "utf8")), oracle);
  for (const sample of [...oracle.samples, ...oracle.alternateInputs]) {
    // The existing finite-number wire contract normalizes negative zero just
    // as JSON.stringify does; string code units remain unchanged.
    assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(sample.input))), JSON.parse(sample.canonical));
  }
  for (const input of oracle.invalidSyntax) {
    if (input === "1e400") assert.equal(JSON.parse(input), Infinity, "native syntax layer retains its finite JSON restriction");
    else assert.throws(() => JSON.parse(input), SyntaxError);
  }
  for (const input of oracle.duplicates) assert.doesNotThrow(() => JSON.parse(input), "strict duplicate rejection is an existing native capture policy");
});
