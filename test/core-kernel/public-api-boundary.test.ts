import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

test("Core exports only formal production APIs and no retired test vocabulary", () => {
  assert.deepEqual(Object.keys(coreKernel).sort(), [
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
  ];
  forbidden.forEach((name) => assert.equal(name in coreKernel, false));
});
