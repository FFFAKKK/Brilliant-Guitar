import { definePlugin } from "../plugins/plugin-sdk.ts";
import type {
  PluginInstrumentContribution,
  PluginKernelModuleManifestV1,
} from "../plugins/plugin-sdk.ts";

export const GUITAR_PLUGIN_ID = "brilliant.instrument.guitar";

export const GUITAR_KERNEL_MODULE_V1: PluginKernelModuleManifestV1 = Object.freeze({
  moduleId: GUITAR_PLUGIN_ID,
  apiVersion: 1,
  runtime: "internal-module",
  activation: "session-fixed",
});

/** Read-only discovery metadata. Tuning, positions, and techniques remain Kernel Domain facts. */
export const GUITAR_INSTRUMENT_V1: PluginInstrumentContribution = Object.freeze({
  id: GUITAR_PLUGIN_ID,
  label: "吉他",
  family: "fretted-string",
  notationKinds: Object.freeze(["staff", "tablature"] as const),
});

/** One package owns the public instrument identity and its fixed-session Kernel Module. */
export const GUITAR_PLUGIN = definePlugin({
  id: GUITAR_PLUGIN_ID,
  name: "吉他",
  version: "1.0.0",
  tier: "product",
  activation: "always",
  kernelModules: [GUITAR_KERNEL_MODULE_V1],
  instruments: [GUITAR_INSTRUMENT_V1],
});
