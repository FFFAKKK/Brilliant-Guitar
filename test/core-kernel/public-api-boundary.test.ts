import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import * as coreKernel from "../../src/core-kernel/index";

test("Core exports only formal production APIs and no retired test vocabulary", () => {
  assert.deepEqual(Object.keys(coreKernel).sort(), [
    "CommandBus",
    "K1_SCORE_FEATURE_PROFILE",
    "PURE_CORE_KERNEL_V1_SCOPE",
    "SCORE_DOCUMENT_SCHEMA_VERSION",
    "addFractions",
    "compareFractions",
    "createDiagnostic",
    "createFraction",
    "decodeScoreDocument",
    "deriveSequenceEventStarts",
    "encodeScoreDocumentJson",
    "getEffectiveMeasureDuration",
    "getNoteValueDuration",
    "isCanonicalFraction",
    "isJsonValue",
    "isNoteValueBase",
    "isNoteValueDots",
    "isScoreDocumentSchemaVersion",
    "isTransposition",
    "isWrittenPitch",
    "multiplyFractions",
    "parseScoreDocumentJson",
    "replayCoreCommands",
    "subtractFractions",
    "transposeWrittenPitch",
    "validateScoreDocumentSemantics",
    "validateScoreFeatureProfile",
  ]);

  const forbidden = [
    "TICKS_PER_QUARTER",
    "DURATION_TICKS",
    "createK1StandardRiffDocument",
    "createK1TestTechniqueRegistry",
    "CORE_COMMAND_DEFINITIONS",
    "CoreMutation",
    "HistoryEntry",
    "getDocument",
    "registerCoreCommand",
    "unregisterCoreCommand",
    "ScorePoint",
    "ScoreRange",
    "KernelRegistry",
  ];
  forbidden.forEach((name) => assert.equal(name in coreKernel, false));

  const publicIndex = readFileSync(
    resolve(process.cwd(), "src", "core-kernel", "index.ts"),
    "utf8",
  );
  [
    "commands/catalog",
    "commands/mutations",
    "commands/runtime",
    "commands/strict-codec",
    "commands/target-resolver",
  ].forEach((internalModule) =>
    assert.equal(publicIndex.includes(internalModule), false),
  );
});
