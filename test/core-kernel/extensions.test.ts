import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

test("JsonValue accepts deep finite JSON data and rejects unsafe runtime values", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.isJsonValue, "function");
  const isJsonValue = api.isJsonValue as (value: unknown) => boolean;

  assert.equal(
    isJsonValue({
      nested: [null, true, 42.5, "value", { order: [3, 2, 1] }],
    }),
    true,
  );
  assert.equal(isJsonValue(Number.NaN), false);
  assert.equal(isJsonValue(Number.POSITIVE_INFINITY), false);
  assert.equal(isJsonValue(undefined), false);

  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.equal(isJsonValue(cyclic), false);

  const sparse = new Array<unknown>(1);
  assert.equal(isJsonValue(sparse), false);
});
