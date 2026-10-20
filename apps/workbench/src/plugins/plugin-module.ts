import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import { captureInternalUiPluginModule } from "../ui/plugin-module-capture.ts";
import { capturePluginBusinessContributions } from "./plugin-contributions.ts";
import type { PluginBusinessContributions } from "./plugin-contributions.ts";
import { capturePluginManifest } from "./plugin-manifest.ts";
import type { PluginManifest } from "./plugin-manifest.ts";

export interface PluginModule extends Required<PluginBusinessContributions> {
  readonly manifest: PluginManifest;
  readonly ui: InternalUiPluginModule | null;
}

export function hasPluginUiSlice(plugin: InternalUiPluginModule): boolean {
  return plugin.ui !== undefined || plugin.projections.length > 0 || plugin.commands.length > 0
    || plugin.views.length > 0 || plugin.interactions.length > 0 || plugin.componentExtensions.length > 0;
}

/** One package snapshot; the UI slice shares the exact captured manifest. */
export function capturePluginModule(plugin: PluginModule): PluginModule {
  const manifest = capturePluginManifest(plugin.manifest);
  if (!manifest) throw new Error("Invalid plugin manifest");
  const capturedUi = plugin.ui === null ? null : captureInternalUiPluginModule(plugin.ui);
  if (capturedUi && JSON.stringify(capturedUi.manifest) !== JSON.stringify(manifest)) {
    throw new Error("Plugin UI slice manifest does not match its package");
  }
  if (!capturedUi && (manifest.requires.projections.length || manifest.contributes.views.length
    || manifest.contributes.commands.length || manifest.contributes.interactions.length
    || manifest.contributes.componentExtensions.length || manifest.contributes.ui !== undefined)) {
    throw new Error("Plugin manifest declares a missing UI slice");
  }
  let ui: InternalUiPluginModule | null = null;
  if (capturedUi) {
    const { instruments: _instruments, playbackOutputs: _outputs, applicationCapabilities: _capabilities,
      workflows: _workflows, ...slice } = capturedUi;
    ui = Object.freeze({ ...slice, manifest });
  }
  return Object.freeze({ manifest, ui, ...capturePluginBusinessContributions(plugin) });
}

/** Preserves direct internal-module registration while moving package ownership out of UI. */
export function adaptInternalUiPluginModule(plugin: InternalUiPluginModule): PluginModule {
  const captured = captureInternalUiPluginModule(plugin);
  return capturePluginModule({
    manifest: captured.manifest,
    ui: hasPluginUiSlice(captured) ? captured : null,
    ...capturePluginBusinessContributions(captured),
  });
}

/** Existing UI hosts still receive the complete legacy shape, including UI-free packages. */
export function legacyUiPluginModule(plugin: PluginModule): InternalUiPluginModule {
  return Object.freeze({
    ...(plugin.ui ?? { projections: Object.freeze([]), commands: Object.freeze([]), views: Object.freeze([]),
      interactions: Object.freeze([]), componentExtensions: Object.freeze([]) }),
    manifest: plugin.manifest,
    instruments: plugin.instruments,
    playbackOutputs: plugin.playbackOutputs,
    applicationCapabilities: plugin.applicationCapabilities,
    workflows: plugin.workflows,
  });
}
