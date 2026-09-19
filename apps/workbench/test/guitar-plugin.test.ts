import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import {
  GUITAR_INSTRUMENT_V1,
  GUITAR_KERNEL_MODULE_V1,
  GUITAR_PLUGIN,
  GUITAR_PLUGIN_ID,
} from "../src/instruments/guitar-plugin.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";

const require = createRequire(import.meta.url);

test("the Guitar package binds one public identity to instrument discovery and Kernel assembly", () => {
  const kernel = require("../.kernel/src/first-party-modules/guitar-domain.js") as
    typeof import("../.kernel/src/first-party-modules/guitar-domain.js");
  const platform = new PluginPlatform({
    hostFeatures: new WorkbenchFeatureRegistry([]),
    projections: [],
  });
  platform.register(GUITAR_PLUGIN);
  const session = platform.start();

  assert.equal(GUITAR_PLUGIN.id, GUITAR_PLUGIN_ID);
  assert.equal(kernel.GUITAR_DOMAIN_NAMESPACE, GUITAR_PLUGIN_ID);
  assert.equal(
    kernel.GUITAR_DOMAIN_MODULE_STARTUP_MANIFEST.modules.at(-1)?.moduleId,
    GUITAR_KERNEL_MODULE_V1.moduleId,
  );
  assert.equal(GUITAR_KERNEL_MODULE_V1.moduleId, GUITAR_PLUGIN_ID);
  assert.equal(GUITAR_INSTRUMENT_V1.id, GUITAR_PLUGIN_ID);
  assert.deepEqual(platform.instruments(), [{
    id: GUITAR_PLUGIN_ID,
    label: "吉他",
    family: "fretted-string",
    notationKinds: ["staff", "tablature"],
  }]);
  assert.deepEqual(session.kernelAssembly, {
    planVersion: 1,
    modules: [{
      pluginId: GUITAR_PLUGIN_ID,
      pluginVersion: "1.0.0",
      tier: "product",
      moduleId: GUITAR_PLUGIN_ID,
      apiVersion: 1,
      runtime: "internal-module",
      activation: "session-fixed",
    }],
  });
  assert.equal(platform.list()[0]?.status, "active");
});
