import { test } from "node:test";
import assert = require("node:assert/strict");

import * as core from "../../src/core-kernel/index";
import * as sdk from "../../src/core-kernel/module-sdk/index";

test("integrated runtime exports stay on the application boundary only", () => {
  assert.equal("replayKernelCommands" in core, true);
  assert.equal("migrateKernelExtension" in core, true);
  assert.equal("replayKernelCommands" in sdk, false);
  assert.equal("migrateKernelExtension" in sdk, false);
  for (const internalName of [
    "resolveKernelIntegratedRuntimeAssembly",
    "computeKernelDomainAvailability",
    "createIntegratedCommandBus",
    "getIntegratedCommandBusAssemblyIdentity",
    "createIntegratedContributionView",
    "decodeIntegratedModuleIssues",
  ]) {
    assert.equal(internalName in core, false);
    assert.equal(internalName in sdk, false);
  }
});
