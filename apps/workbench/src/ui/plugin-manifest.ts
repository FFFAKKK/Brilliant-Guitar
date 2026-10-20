/** Compatibility entry point; the common plugin layer owns the manifest contract. */
export {
  WORKBENCH_PLUGIN_API_VERSION, MOUNT_PLUGIN_API_VERSION, WorkbenchFeatureRegistry,
  exactDataRecord, capturedArrayValues, capturedStrings,
  capturePluginManifest as captureUiPluginManifest,
  isPluginManifest as isUiPluginManifest,
} from "../plugins/plugin-manifest.ts";
export type { PluginManifest as UiPluginManifest, WorkbenchFeatureId } from "../plugins/plugin-manifest.ts";
