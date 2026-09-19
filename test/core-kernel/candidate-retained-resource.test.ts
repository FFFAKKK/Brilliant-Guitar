import { test } from "node:test";
import assert = require("node:assert/strict");

import { decodeCommandFailure } from "../../src/core-kernel/reports/strict-codec";

test("strict command failure decoder accepts every Rust memory-accounting limit", () => {
  for (const limitKind of [
    "diagnostics",
    "changeset-logical-bytes",
    "candidate-retained-bytes",
    "transaction-work-units",
  ] as const) {
    const failure = {
      code: "command.resource-limit-exceeded",
      limitKind,
      limit: 536_870_912,
      actual: 536_870_913,
    } as const;
    assert.deepEqual(decodeCommandFailure(failure), failure);
  }
});

test("strict command failure decoder keeps the resource kind union closed", () => {
  assert.equal(
    decodeCommandFailure({
      code: "command.resource-limit-exceeded",
      limitKind: "allocator-rss",
      limit: 1,
      actual: 2,
    }),
    undefined,
  );
});
