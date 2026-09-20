import type { PluginActivationStoragePort } from "./plugin-activation-persistence.ts";
import type { PluginPlatform, PluginSessionPlanV1 } from "./plugin-platform.ts";
import type { PluginSettingsStoragePort } from "./plugin-settings-persistence.ts";
import { PluginStartupController } from "./plugin-startup-controller.ts";

export type PluginPlatformBootstrapFailureKind = "activation" | "settings";

export interface PluginPlatformBootstrapResult {
  readonly startup: PluginStartupController;
  readonly plan: PluginSessionPlanV1;
}

/**
 * Restores launch intent while the platform is still configurable, freezes the
 * session, then restores settings that require installed plugin contributions.
 */
export async function bootstrapPersistedPluginPlatform(
  platform: PluginPlatform,
  activationStorage: PluginActivationStoragePort,
  settingsStorage: PluginSettingsStoragePort,
  onFailure: (kind: PluginPlatformBootstrapFailureKind, error: unknown) => void,
): Promise<PluginPlatformBootstrapResult> {
  const startup = new PluginStartupController(platform, activationStorage);
  try {
    await startup.prepare();
  } catch (error) {
    // A failed restore must not activate a possibly stale user selection.
    platform.restoreActivation([]);
    onFailure("activation", error);
  }

  const plan = await startup.launch();
  try {
    const settings = platform.connectSettings(settingsStorage);
    await settings.restore();
  } catch (error) {
    onFailure("settings", error);
  }

  return Object.freeze({ startup, plan });
}
