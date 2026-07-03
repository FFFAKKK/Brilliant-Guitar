import { test } from "node:test";
import assert = require("node:assert/strict");

import { PURE_CORE_KERNEL_V1_SCOPE } from "../../src/core-kernel/index";

test("pure core kernel metadata exposes the V1 runtime boundary", () => {
  assert.equal(PURE_CORE_KERNEL_V1_SCOPE.milestone, "Pure Core Kernel V1");
  assert.equal(PURE_CORE_KERNEL_V1_SCOPE.runtime, "pure-typescript");
  assert.deepEqual(PURE_CORE_KERNEL_V1_SCOPE.forbiddenCapabilities, [
    "react-ui",
    "tauri-shell",
    "vexflow-rendering",
    "web-audio-playback",
    "pdf-export",
    "png-export",
    "guitar-pro-import-export",
    "physical-bgp-io",
    "plugin-runtime",
  ]);
});
