import assert = require("node:assert/strict");
import { test } from "node:test";

import * as api from "../../src/core-kernel/index";
import type {
  BatchCommand,
  BatchCommandPayloadV1,
  DeleteRangeCommand,
  DeleteRangePayloadV1,
  TransposeRangePayloadV1,
  TransposeRangeWrittenPitchCommand,
} from "../../src/core-kernel/index";
import { CORE_COMMAND_DEFINITIONS } from "../../src/core-kernel/commands/catalog";
import { CORE_COMPILED_REGISTRATION_ENTRIES } from "../../src/core-kernel/registry/builtins";

const CVN5_COMMAND_IDS = [
  "core.range.delete",
  "core.range.transpose-written-pitch",
  "core.transaction.batch",
] as const;

const DELETE_PAYLOAD_COMPILES = {
  range: {
    kind: "measure-range",
    start: { kind: "measure", measureId: "measure-1" },
    end: { kind: "measure", measureId: "measure-2" },
  },
} as const satisfies DeleteRangePayloadV1;

const TRANSPOSE_PAYLOAD_COMPILES = {
  range: DELETE_PAYLOAD_COMPILES.range,
  transposition: { diatonicSteps: 1, chromaticSemitones: 2 },
} as const satisfies TransposeRangePayloadV1;

const DELETE_COMMAND_COMPILES = {
  commandVersion: 1,
  commandId: "core.range.delete",
  target: { kind: "document", documentId: "score-1" },
  payload: DELETE_PAYLOAD_COMPILES,
} as const satisfies DeleteRangeCommand;

const TRANSPOSE_COMMAND_COMPILES = {
  commandVersion: 1,
  commandId: "core.range.transpose-written-pitch",
  target: { kind: "document", documentId: "score-1" },
  payload: TRANSPOSE_PAYLOAD_COMPILES,
} as const satisfies TransposeRangeWrittenPitchCommand;

const BATCH_PAYLOAD_COMPILES = {
  commands: [DELETE_COMMAND_COMPILES, TRANSPOSE_COMMAND_COMPILES],
} as const satisfies BatchCommandPayloadV1;

const BATCH_COMMAND_COMPILES = {
  commandVersion: 1,
  commandId: "core.transaction.batch",
  target: { kind: "document", documentId: "score-1" },
  payload: BATCH_PAYLOAD_COMPILES,
} as const satisfies BatchCommand;

const EMPTY_BATCH_DOES_NOT_COMPILE: BatchCommandPayloadV1 = {
  // @ts-expect-error CVN-5 requires a statically non-empty tuple.
  commands: [],
};

const WRONG_TARGET_DOES_NOT_COMPILE: DeleteRangeCommand = {
  commandVersion: 1,
  commandId: "core.range.delete",
  // @ts-expect-error CVN-5 range commands always target the document.
  target: { kind: "note", noteId: "note-1" },
  payload: DELETE_PAYLOAD_COMPILES,
};

void BATCH_COMMAND_COMPILES;
void EMPTY_BATCH_DOES_NOT_COMPILE;
void WRONG_TARGET_DOES_NOT_COMPILE;

test("CVN-5 adds exactly three Core command descriptors without runtime-root growth", () => {
  const commandIds = CORE_COMMAND_DEFINITIONS.map(({ commandId }) => commandId);
  assert.equal(commandIds.length, 28);
  assert.deepEqual(commandIds.slice(-3), CVN5_COMMAND_IDS);

  const commandEntry = CORE_COMPILED_REGISTRATION_ENTRIES.find(
    ({ registrationEntryId }) => registrationEntryId === "core.commands.v1",
  );
  assert.equal(commandEntry?.kind, "command");
  if (commandEntry?.kind !== "command") {
    assert.fail("expected Core command registration entry");
  }
  assert.equal(commandEntry.contributions.length, 28);
  assert.deepEqual(
    commandEntry.contributions.slice(-3).map(({ descriptor }) => ({
      id: descriptor.id,
      targetKind: descriptor.targetKind,
    })),
    CVN5_COMMAND_IDS.map((id) => ({ id, targetKind: "document" })),
  );
  assert.equal(Object.keys(api).length, 51);
});
