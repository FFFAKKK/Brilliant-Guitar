import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { CORE_COMMAND_DEFINITIONS } from "../../src/core-kernel/commands/catalog";
import { CORE_COMPILED_REGISTRATION_ENTRIES } from "../../src/core-kernel/registry/builtins";
import {
  collectCvn1CharacterizationTrace,
  serializeCvn1CharacterizationTrace,
} from "./fixtures/cvn-1-characterization";

const HISTORICAL_PATH = resolve(
  process.cwd(),
  "test/core-kernel/fixtures/cvn-1-characterization.expected.json",
);
const HISTORICAL_SHA256 =
  "CDBCFD68DCC84C514BCAC8BA83B44B819A237146C842E0F63E8F17A3CD2FF4D9";

test("CVN-5 is additive after the accepted twenty-five-command Core prefix", () => {
  const commandEntry = CORE_COMPILED_REGISTRATION_ENTRIES.find(
    ({ registrationEntryId }) => registrationEntryId === "core.commands.v1",
  );
  assert.equal(commandEntry?.kind, "command");
  if (commandEntry?.kind !== "command") {
    assert.fail("expected Core command entry");
  }
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.slice(0, 25).map(({ commandId }) => commandId),
    commandEntry.contributions.slice(0, 25).map(({ descriptor }) => descriptor.id),
  );
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.slice(25).map(({ commandId }) => commandId),
    [
      "core.range.delete",
      "core.range.transpose-written-pitch",
      "core.transaction.batch",
    ],
  );
});

test("CVN-5 preserves the historical Core-only trace byte-for-byte", () => {
  const actual = serializeCvn1CharacterizationTrace(
    collectCvn1CharacterizationTrace(),
  );
  const expected = readFileSync(HISTORICAL_PATH, "utf8");
  assert.equal(actual, expected);
  assert.equal(
    createHash("sha256").update(actual).digest("hex").toUpperCase(),
    HISTORICAL_SHA256,
  );
});
