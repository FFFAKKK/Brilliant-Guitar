import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  collectCvn3SurfaceTrace,
  serializeCvn3SurfaceTrace,
  type Cvn3SurfaceTrace,
} from "./fixtures/cvn-3-surface";

const EXPECTED_SURFACE_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-3-surface.expected.json",
);

function readExpectedSurface(): Cvn3SurfaceTrace {
  return JSON.parse(
    readFileSync(EXPECTED_SURFACE_PATH, "utf8"),
  ) as Cvn3SurfaceTrace;
}

test("CVN-3 records the current additive public surface", () => {
  const actual = collectCvn3SurfaceTrace();
  const repeated = collectCvn3SurfaceTrace();
  const expected = readExpectedSurface();

  assert.equal(
    serializeCvn3SurfaceTrace(actual),
    serializeCvn3SurfaceTrace(repeated),
  );
  assert.deepEqual(actual, expected);
});
