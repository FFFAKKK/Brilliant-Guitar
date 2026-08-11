import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import * as core from "../../src/core-kernel/index";
import * as sdk from "../../src/core-kernel/module-sdk/index";

interface AcceptedSurfaceFixture {
  readonly runtimeExports: readonly string[];
}

test("CVN-5 preserves the exact application and Module SDK runtime boundaries", () => {
  const expected = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "test/core-kernel/fixtures/cvn-4-surface.expected.json",
      ),
      "utf8",
    ),
  ) as AcceptedSurfaceFixture;

  assert.deepEqual(Object.keys(core).sort(), expected.runtimeExports);
  assert.deepEqual(Object.keys(sdk).sort(), [
    "ModuleKernelErrorBase",
    "OFFICIAL_MODULE_SDK_V1_LIMITS",
    "compileOfficialModuleCatalogV1",
    "createModuleKernelIssueV1",
    "defineDomainCommandContributionV1",
    "defineDomainCommandRegistrationEntryV1",
    "defineDomainCommandV1",
    "defineModuleEffectV1",
  ]);
  for (const privateName of [
    "CORE_COMMAND_DEFINITIONS",
    "CORE_COMMAND_ADAPTERS",
    "prepareCoreBatch",
    "resolveRangeSelection",
    "applyCoreEffectSetToCandidate",
  ]) {
    assert.equal(privateName in core, false);
  }
});
