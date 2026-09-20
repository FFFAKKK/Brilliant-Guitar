export type PluginActivationKind = "always" | "user";
export type PluginActivationEffect = "configured" | "restart-required" | "unchanged" | "rejected";

export interface PluginActivationChange {
  readonly pluginId: string;
  readonly active: boolean;
  readonly nextLaunchActive: boolean;
  readonly restartRequired: boolean;
  readonly effect: PluginActivationEffect;
}

export interface PluginSessionActivationState {
  readonly active: boolean;
  readonly nextLaunchActive: boolean;
  readonly restartRequired: boolean;
}

/**
 * Owns plugin activation intent independently from contribution installation.
 * Session overrides select one process run and never rewrite the next normal launch.
 */
export class PluginSessionActivation {
  readonly #kinds = new Map<string, PluginActivationKind>();
  readonly #desiredUserPluginIds = new Set<string>();
  readonly #selectedPluginIds = new Set<string>();
  readonly #activePluginIds = new Set<string>();
  #running = false;

  register(pluginId: string, kind: PluginActivationKind): void {
    if (this.#running) throw new Error("Plugin activation session has already started");
    if (this.#kinds.has(pluginId)) throw new Error(`Plugin activation already registered: ${pluginId}`);
    this.#kinds.set(pluginId, kind);
  }

  phase(): "configuring" | "running" { return this.#running ? "running" : "configuring"; }

  start(selectedPluginIds?: readonly string[]): void {
    if (this.#running) return;
    const selectedUsers = selectedPluginIds === undefined
      ? this.#desiredUserPluginIds
      : new Set(selectedPluginIds);
    for (const [pluginId, kind] of this.#kinds) {
      if (kind === "always" || selectedUsers.has(pluginId)) this.#selectedPluginIds.add(pluginId);
    }
    this.#running = true;
  }

  selectedForSession(pluginId: string): boolean {
    if (!this.#running) throw new Error("Plugin activation session has not started");
    return this.#selectedPluginIds.has(pluginId);
  }

  markActive(pluginId: string): void {
    if (!this.#selectedPluginIds.has(pluginId)) {
      throw new Error(`Plugin was not selected for this session: ${pluginId}`);
    }
    this.#activePluginIds.add(pluginId);
  }

  restoreDesired(pluginIds: readonly string[]): void {
    const desired = new Set(pluginIds);
    this.#desiredUserPluginIds.clear();
    for (const [pluginId, kind] of this.#kinds) {
      if (kind === "user" && desired.has(pluginId)) this.#desiredUserPluginIds.add(pluginId);
    }
  }

  setDesired(pluginId: string, enabled: boolean): PluginActivationChange {
    const kind = this.#kinds.get(pluginId);
    if (kind !== "user") return this.#change(pluginId, "rejected");
    const before = this.state(pluginId);
    if (enabled) this.#desiredUserPluginIds.add(pluginId);
    else this.#desiredUserPluginIds.delete(pluginId);
    const after = this.state(pluginId);
    const changed = before.nextLaunchActive !== after.nextLaunchActive
      || before.restartRequired !== after.restartRequired;
    return this.#change(pluginId, !changed ? "unchanged" : this.#running ? "restart-required" : "configured");
  }

  state(pluginId: string): PluginSessionActivationState {
    const kind = this.#kinds.get(pluginId);
    const active = this.#activePluginIds.has(pluginId);
    const nextLaunchActive = kind === "always" || (kind === "user" && this.#desiredUserPluginIds.has(pluginId));
    return Object.freeze({
      active,
      nextLaunchActive,
      restartRequired: this.#running && active !== nextLaunchActive,
    });
  }

  activeIds(): ReadonlySet<string> { return new Set(this.#activePluginIds); }

  nextLaunchIds(): ReadonlySet<string> {
    return new Set([...this.#kinds]
      .filter(([pluginId, kind]) => kind === "always" || this.#desiredUserPluginIds.has(pluginId))
      .map(([pluginId]) => pluginId));
  }

  restartRequired(): boolean {
    return [...this.#kinds].some(([pluginId]) => this.state(pluginId).restartRequired);
  }

  #change(pluginId: string, effect: PluginActivationEffect): PluginActivationChange {
    return Object.freeze({ pluginId, ...this.state(pluginId), effect });
  }
}
