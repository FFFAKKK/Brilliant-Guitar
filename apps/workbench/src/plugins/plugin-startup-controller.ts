import type { PluginActivationDocumentV1, PluginActivationStoragePort } from "./plugin-activation-persistence.ts";
import { PluginActivationPersistence } from "./plugin-activation-persistence.ts";
import type { PluginPlatform, PluginRuntimeInfo, PluginSessionPlanV1 } from "./plugin-platform.ts";

export type PluginStartupControllerPhase = "unprepared" | "configuring" | "launched";
export type PluginStartupLaunchMode = "normal" | "safe";

export interface PluginStartupSnapshot {
  readonly phase: PluginStartupControllerPhase;
  readonly plugins: readonly PluginRuntimeInfo[];
  readonly restartRequired: boolean;
  readonly launchMode: PluginStartupLaunchMode | null;
}

/**
 * Application-shell controller for a future launch center. It restores and edits
 * plugin activation before the workbench session is assembled, then locks the
 * exact application/kernel plan for the lifetime of that process.
 */
export class PluginStartupController {
  readonly #platform: PluginPlatform;
  readonly #activation: PluginActivationPersistence;
  #phase: PluginStartupControllerPhase = "unprepared";
  #launchMode: PluginStartupLaunchMode | null = null;

  constructor(platform: PluginPlatform, activationStorage: PluginActivationStoragePort) {
    this.#platform = platform;
    this.#activation = platform.connectActivation(activationStorage);
  }

  snapshot(): PluginStartupSnapshot {
    return Object.freeze({
      phase: this.#phase,
      plugins: this.#platform.list(),
      restartRequired: this.#platform.restartRequired(),
      launchMode: this.#launchMode,
    });
  }

  async prepare(): Promise<PluginActivationDocumentV1> {
    if (this.#phase !== "unprepared") throw new Error("Plugin startup has already been prepared");
    if (this.#platform.phase() !== "configuring") throw new Error("Plugin platform has already started");
    const document = await this.#activation.restore();
    this.#phase = "configuring";
    return document;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginActivationDocumentV1> {
    if (this.#phase !== "configuring") throw new Error("Plugin startup is not configurable");
    return this.#activation.setEnabled(pluginId, enabled);
  }

  launch(options: { readonly mode?: PluginStartupLaunchMode } = {}): PluginSessionPlanV1 {
    if (this.#phase !== "configuring") throw new Error("Plugin startup is not ready to launch");
    const mode = options.mode ?? "normal";
    const plan = this.#platform.start({ safeMode: mode === "safe" });
    this.#launchMode = mode;
    this.#phase = "launched";
    return plan;
  }
}
