import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CommandBus } from "../../../src/core-kernel/index";
import { decodeScoreDocument } from "../../../src/core-kernel/codec/decode-score-document";
import { createLosslessScoreDtoOracle } from "./lossless-score-dto-oracle";

test("complete lossless Score DTO corpus is regenerated and accepted by the TS kernel", () => {
  const oracle = createLosslessScoreDtoOracle();
  assert.deepEqual(JSON.parse(readFileSync("test/core-kernel/rust-migration/fixtures/lossless-score-dto-oracle-v1.json", "utf8")), oracle);
  for (const sample of oracle.samples) {
    const document: unknown = JSON.parse(sample.input);
    const decoded = decodeScoreDocument(document);
    assert.ok(decoded.ok, `decode sample ${sample.index}`);
    const created = CommandBus.create(decoded.value);
    assert.ok(created.ok, `sample ${sample.index}`);
    const read = created.value.read();
    assert.ok(read.ok);
    assert.deepEqual(read.value.snapshot.document, document);
    const title = read.value.snapshot.document.metadata.title;
    assert.deepEqual(Array.from({ length: title.length }, (_, index) => title.charCodeAt(index)), sample.units);
  }
});
