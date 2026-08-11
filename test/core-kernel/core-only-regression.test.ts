import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  assertCvn1CharacterizationShape,
  collectCvn1CharacterizationTrace,
  serializeCvn1CharacterizationTrace,
} from "./fixtures/cvn-1-characterization";

const EXPECTED_TRACE_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-1-characterization.expected.json",
);
const EXPECTED_TRACE_SHA256 =
  "CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9";

test("CVN-6 preserves the accepted Core-only command, Registry, replay, and event trace", () => {
  const actual = collectCvn1CharacterizationTrace();
  const actualText = serializeCvn1CharacterizationTrace(actual);
  const expectedText = readFileSync(EXPECTED_TRACE_PATH, "utf8");

  assertCvn1CharacterizationShape(actual);
  assert.equal(actualText, expectedText);
  assert.equal(
    createHash("sha256").update(actualText).digest("hex").toUpperCase(),
    EXPECTED_TRACE_SHA256,
  );
});
