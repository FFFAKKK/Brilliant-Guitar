import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  collectCvn4SurfaceTrace,
  serializeCvn4SurfaceTrace,
  type Cvn4SurfaceTrace,
} from "./fixtures/cvn-4-surface";

const EXPECTED_SURFACE_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-4-surface.expected.json",
);

function readExpectedSurface(): Cvn4SurfaceTrace {
  return JSON.parse(
    readFileSync(EXPECTED_SURFACE_PATH, "utf8"),
  ) as Cvn4SurfaceTrace;
}

test("the CVN-4 surface fixture consumes the accepted additive CVN-5 projection", () => {
  const actual = collectCvn4SurfaceTrace();
  const repeated = collectCvn4SurfaceTrace();
  const expected = readExpectedSurface();

  assert.equal(
    serializeCvn4SurfaceTrace(actual),
    serializeCvn4SurfaceTrace(repeated),
  );
  assert.equal(actual.runtimeExports.length, 51);
  assert.equal(actual.catalog.length, 28);
  assert.equal(actual.registryCommandDescriptors.length, 28);
  assert.deepEqual(actual, expected);
});
