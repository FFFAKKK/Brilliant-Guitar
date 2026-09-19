import type { PluginActivationDocumentV1, PluginActivationStoragePort } from "./plugin-activation-persistence.ts";
import { PluginActivationPersistence } from "./plugin-activation-persistence.ts";
import type { PluginPlatform, PluginRuntimeInfo, PluginSessionPlanV1 } from "./plugin-platform.ts";
import type { PluginStartupRecoveryDocumentV1, PluginStartupRecoveryStoragePort } from "./plugin-startup-recovery.ts";
import { normalizePluginStartupRecoveryDocument } from "./plugin-startup-recovery.ts";

export type PluginStartupControllerPhase = "unprepared" | "configuring" | "launching" | "launched";
export type PluginStartupLaunchMode = "normal" | "safe" | "last-known-good";

export interface PluginStartupSnapshot {
  readonly phase: PluginStartupControllerPhase;
  readonly plugins: readonly PluginRuntimeInfo[];
  readonly restartRequired: boolean;
  readonly launchMode: PluginStartupLaunchMode | null;
  readonly recommendedMode: PluginStartupLaunchMode;
  readonly previousLaunchIncomplete: boolean;
  readonly recoveryRequired: boolean;
  readonly lastKnownGoodPluginIds: readonly string[];
  readonly stable: boolean;
}

export interface PluginStartupControllerOptions {
  readonly recoveryStorage?: PluginStartupRecoveryStoragePort;
}

/**
 * Application-shell controller for a future launch center. It restores and edits
 * plugin activation before the workbench session is assembled, then locks the
 * exact application/kernel plan for the lifetime of that process.
 */
export class PluginStartupController {
  readonly #platform: PluginPlatform;
  readonly #activation: PluginActivationPersistence;
  readonly #recoveryStorage: PluginStartupRecoveryStoragePort | null;
  #phase: PluginStartupControllerPhase = "unprepared";
  #launchMode: PluginStartupLaunchMode | null = null;
  #recommendedMode: PluginStartupLaunchMode = "normal";
  #previousLaunchIncomplete = false;
  #recoveryRequired = false;
  #recovery = normalizePluginStartupRecoveryDocument(null);
  #launchedPlan: PluginSessionPlanV1 | null = null;
  #stable = false;

  constructor(platform: PluginPlatform, activationStorage: PluginActivationStoragePort,
    options: PluginStartupControllerOptions = {}) {
    this.#platform = platform;
    this.#activation = platform.connectActivation(activationStorage);
    this.#recoveryStorage = options.recoveryStorage ?? null;
  }

  snapshot(): PluginStartupSnapshot {
    return Object.freeze({
      phase: this.#phase,
      plugins: this.#platform.list(),
      restartRequired: this.#platform.restartRequired(),
      launchMode: this.#launchMode,
      recommendedMode: this.#recommendedMode,
      previousLaunchIncomplete: this.#previousLaunchIncomplete,
      recoveryRequired: this.#recoveryRequired,
      lastKnownGoodPluginIds: this.#recovery.lastKnownGoodPluginIds,
      stable: this.#stable,
    });
  }

  async prepare(): Promise<PluginActivationDocumentV1> {
    if (this.#phase !== "unprepared") throw new Error("Plugin startup has already been prepared");
    if (this.#platform.phase() !== "configuring") throw new Error("Plugin platform has already started");
    const document = await this.#activation.restore();
    if (this.#recoveryStorage) {
      this.#recovery = normalizePluginStartupRecoveryDocument(await this.#recoveryStorage.read());
      this.#previousLaunchIncomplete = this.#recovery.state === "launching";
      this.#recoveryRequired = this.#previousLaunchIncomplete || this.#recovery.state === "recovery";
      if (this.#recoveryRequired) {
        this.#recommendedMode = this.#recovery.lastKnownGoodPluginIds.length > 0 ? "last-known-good" : "safe";
      }
    }
    this.#phase = "configuring";
    return document;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginActivationDocumentV1> {
    if (this.#phase !== "configuring") throw new Error("Plugin startup is not configurable");
    const document = await this.#activation.setEnabled(pluginId, enabled);
    if (this.#recoveryRequired) this.#recommendedMode = "normal";
    return document;
  }

  async launch(options: { readonly mode?: PluginStartupLaunchMode } = {}): Promise<PluginSessionPlanV1> {
    if (this.#phase !== "configuring") throw new Error("Plugin startup is not ready to launch");
    const mode = options.mode ?? this.#recommendedMode;
    if (mode === "last-known-good" && this.#recovery.lastKnownGoodPluginIds.length === 0) {
      throw new Error("No last-known-good plugin configuration is available");
    }
    const selectedPluginIds = mode === "normal"
      ? undefined
      : mode === "safe" ? [] : this.#recovery.lastKnownGoodPluginIds;
    const attemptedPluginIds = this.#plannedPluginIds(selectedPluginIds);
    this.#phase = "launching";
    try {
      if (this.#recoveryStorage) {
        this.#recovery = Object.freeze({
          schemaVersion: 1,
          state: "launching",
          attemptedPluginIds: Object.freeze(attemptedPluginIds),
          lastKnownGoodPluginIds: this.#recovery.lastKnownGoodPluginIds,
        });
        await this.#recoveryStorage.write(this.#recovery);
      }
      const plan = selectedPluginIds === undefined
        ? this.#platform.start()
        : this.#platform.start({ selectedPluginIds });
      this.#launchMode = mode;
      this.#launchedPlan = plan;
      this.#phase = "launched";
      return plan;
    } catch (error) {
      if (this.#platform.phase() === "configuring") this.#phase = "configuring";
      throw error;
    }
  }

  async markStable(): Promise<PluginStartupRecoveryDocumentV1> {
    if (this.#phase !== "launched" || !this.#launchedPlan) throw new Error("Plugin startup has not launched");
    const completedNormalLaunch = this.#launchMode === "normal";
    const recoveryStillRequired = this.#recoveryRequired && !completedNormalLaunch;
    const document = Object.freeze({
      schemaVersion: 1 as const,
      state: recoveryStillRequired ? "recovery" as const : "stable" as const,
      attemptedPluginIds: Object.freeze([]),
      lastKnownGoodPluginIds: completedNormalLaunch
        ? Object.freeze([...this.#launchedPlan.pluginIds])
        : this.#recovery.lastKnownGoodPluginIds,
    });
    if (this.#recoveryStorage) await this.#recoveryStorage.write(document);
    this.#recovery = document;
    this.#previousLaunchIncomplete = false;
    this.#recoveryRequired = recoveryStillRequired;
    this.#recommendedMode = recoveryStillRequired
      ? document.lastKnownGoodPluginIds.length > 0 ? "last-known-good" : "safe"
      : "normal";
    this.#stable = true;
    return document;
  }

  #plannedPluginIds(selectedPluginIds: readonly string[] | undefined): string[] {
    const selected = selectedPluginIds === undefined ? null : new Set(selectedPluginIds);
    return this.#platform.list()
      .filter((plugin) => plugin.manifest.activation === "always"
        || (selected?.has(plugin.manifest.id) ?? plugin.nextLaunchActive))
      .map((plugin) => plugin.manifest.id)
      .sort();
  }
}
