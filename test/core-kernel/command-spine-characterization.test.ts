import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  assertCvn1CharacterizationShape,
  collectCvn1CharacterizationTrace,
  serializeCvn1CharacterizationTrace,
  type Cvn1CharacterizationTraceV1,
} from "./fixtures/cvn-1-characterization";

const EXPECTED_TRACE_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-1-characterization.expected.json",
);

function readExpectedTrace(): Cvn1CharacterizationTraceV1 {
  return JSON.parse(
    readFileSync(EXPECTED_TRACE_PATH, "utf8"),
  ) as Cvn1CharacterizationTraceV1;
}

test("CVN-1 freezes the pre-refactor public command spine trace", () => {
  const actual = collectCvn1CharacterizationTrace();
  const repeated = collectCvn1CharacterizationTrace();
  const expected = readExpectedTrace();

  assertCvn1CharacterizationShape(actual);
  assertCvn1CharacterizationShape(repeated);
  assert.equal(
    serializeCvn1CharacterizationTrace(actual),
    serializeCvn1CharacterizationTrace(repeated),
  );
  assert.deepEqual(actual, expected);
});
