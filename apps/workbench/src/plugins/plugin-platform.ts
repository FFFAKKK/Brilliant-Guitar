import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import type { AnyUiProjection, UiProjectionSnapshot } from "../ui/projection-registry.ts";
import type { UiPluginManifest } from "../ui/plugin-manifest.ts";
import type { UiComponentRegistry } from "../ui/component-registry.ts";
import type { NotationInteractionRegistry } from "../input/notation-interaction-registry.ts";
import type { UiResolvedViewContribution } from "../ui/view-contribution.ts";
import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import { UiPluginCatalog } from "../ui/plugin-catalog.ts";
import { UiPluginDiagnosticStore, UiPluginHostError, isUiPluginHostError, uiPluginIdentity } from "../ui/plugin-diagnostic.ts";
import type { UiPluginDiagnostic } from "../ui/plugin-diagnostic.ts";
import { UiProjectionRegistry } from "../ui/projection-registry.ts";
import { UiPluginHost as ConcreteUiPluginHost } from "../ui/plugin-manager.ts";
import { WorkbenchCapabilityRegistry } from "../ui/plugin-manifest.ts";
import { adaptUiPluginPackage } from "./plugin-sdk-adapter.ts";
import { isUiPluginPackage } from "./plugin-sdk.ts";
import { NOTE_CONTROL_EXTENSION_POINT } from "./plugin-sdk.ts";
import type { PluginInstrumentContribution, PluginPlaybackOutputContribution, PluginSettingsHost,
  UiPluginPackage } from "./plugin-sdk.ts";
import { PluginSettingsRegistry } from "./plugin-settings.ts";
import { PluginSettingsPersistence } from "./plugin-settings-persistence.ts";
import type { PluginSettingsStoragePort } from "./plugin-settings-persistence.ts";
import { PluginActivationPersistence } from "./plugin-activation-persistence.ts";
import type { PluginActivationStoragePort } from "./plugin-activation-persistence.ts";

export type PluginRuntimeStatus = "discovered" | "installed" | "active" | "disabled" | "failed";

export interface PluginRuntimeInfo {
  readonly manifest: UiPluginManifest;
  readonly status: PluginRuntimeStatus;
  readonly active: boolean;
}

export interface PluginPlatformOptions {
  readonly capabilities: WorkbenchCapabilityRegistry;
  readonly projections: readonly AnyUiProjection[];
  readonly diagnostics?: UiPluginDiagnosticStore;
  readonly onDiagnostic?: (diagnostic: UiPluginDiagnostic) => void;
}

export type PluginRegistration = InternalUiPluginModule | UiPluginPackage;

/** Application-level facade around the current internal UI plugin host. */
export class PluginPlatform {
  readonly catalog = new UiPluginCatalog();
  readonly diagnostics: UiPluginDiagnosticStore;
  readonly ui: ConcreteUiPluginHost;
  readonly #settings = new PluginSettingsRegistry();
  readonly #settingsHosts = new Map<string, PluginSettingsHost>();
  readonly #records = new Map<string, PluginRuntimeInfo>();
  readonly #instrumentOwners = new Map<string, string>();
  readonly #playbackOutputOwners = new Map<string, string>();
  readonly #activated = new Set<string>();
  readonly #listeners = new Set<() => void>();
  readonly #onDiagnostic: ((diagnostic: UiPluginDiagnostic) => void) | undefined;
  #snapshot: readonly PluginRuntimeInfo[] = Object.freeze([]);
  #started = false;
  #settingsPersistence: PluginSettingsPersistence | null = null;
  #activationPersistence: PluginActivationPersistence | null = null;

  constructor(options: PluginPlatformOptions) {
    this.diagnostics = options.diagnostics ?? new UiPluginDiagnosticStore();
    this.#onDiagnostic = options.onDiagnostic;
    this.ui = new ConcreteUiPluginHost(options.capabilities, new UiProjectionRegistry(options.projections),
      (diagnostic) => this.#report(diagnostic));
    this.#settings.subscribe(() => this.#publish());
  }

  register(registration: PluginRegistration): void {
    if (this.#started) throw new Error("Plugin platform has already started");
    let plugin: InternalUiPluginModule;
    let pluginPackage: UiPluginPackage | null = null;
    if (isUiPluginPackage(registration)) {
      pluginPackage = registration;
      plugin = adaptUiPluginPackage(registration, { settings: (pluginId) => this.#settingsHost(pluginId) });
    } else {
      plugin = registration;
    }
    if (this.#records.has(plugin.manifest.id)) throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    if (pluginPackage?.settings) this.#settings.register(plugin.manifest.id, pluginPackage.settings);
    this.catalog.register(plugin);
    this.#records.set(plugin.manifest.id, { manifest: plugin.manifest, status: "discovered", active: false });
    this.#publish();
  }

  registerAll(plugins: readonly PluginRegistration[]): void {
    for (const plugin of plugins) this.register(plugin);
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    for (const plugin of this.catalog.installationPlan()) {
      try {
        this.#validateInstruments(plugin);
        this.#validatePlaybackOutputs(plugin);
        this.ui.install(plugin);
        for (const instrument of plugin.instruments ?? []) {
          this.#instrumentOwners.set(instrument.id, plugin.manifest.id);
        }
        for (const output of plugin.playbackOutputs ?? []) {
          this.#playbackOutputOwners.set(output.id, plugin.manifest.id);
        }
        const active = plugin.manifest.activation === "always";
        if (active) this.#activated.add(plugin.manifest.id);
        this.#records.set(plugin.manifest.id, { manifest: plugin.manifest,
          status: active ? "active" : "installed", active });
      } catch (error) {
        const failure = isUiPluginHostError(error) ? error : new UiPluginHostError({
          code: "UI-PLG-012",
          stage: "registration",
          plugin: uiPluginIdentity(plugin.manifest),
          message: "界面插件装配失败",
          detail: error instanceof Error ? error.message : String(error),
          cause: error,
        });
        this.#report(failure.diagnostic);
        this.#records.set(plugin.manifest.id, { manifest: plugin.manifest, status: "failed", active: false });
      }
    }
    this.#publish();
  }

  list(): readonly PluginRuntimeInfo[] {
    return this.#snapshot;
  }

  readonly getSnapshot = (): readonly PluginRuntimeInfo[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  activate(pluginId: string): void {
    const record = this.#records.get(pluginId);
    if (!record || record.status === "failed") return;
    if (record.active) return;
    this.#activated.add(pluginId);
    this.#records.set(pluginId, { ...record, status: "active", active: true });
    this.#publish();
  }

  deactivate(pluginId: string): void {
    const record = this.#records.get(pluginId);
    if (!record || record.manifest.activation === "always" || record.status === "failed") return;
    if (!record.active && record.status === "disabled") return;
    this.#activated.delete(pluginId);
    this.#records.set(pluginId, { ...record, status: "disabled", active: false });
    this.#publish();
  }

  /**
   * Reconciles every user-activated plugin with a persisted desired set.
   * Unknown and failed plugins are ignored; always-on plugins are never changed.
   */
  restoreActivation(pluginIds: readonly string[]): void {
    if (!this.#started) throw new Error("Plugin platform has not started");
    const desired = new Set(pluginIds);
    let changed = false;
    for (const [pluginId, record] of this.#records) {
      if (record.manifest.activation !== "user" || record.status === "failed") continue;
      const shouldBeActive = desired.has(pluginId);
      if (shouldBeActive === record.active) continue;
      changed = true;
      if (shouldBeActive) {
        this.#activated.add(pluginId);
        this.#records.set(pluginId, { ...record, status: "active", active: true });
      } else {
        this.#activated.delete(pluginId);
        this.#records.set(pluginId, { ...record, status: "disabled", active: false });
      }
    }
    if (changed) this.#publish();
  }

  activatedPluginIds(): ReadonlySet<string> {
    return new Set(this.#activated);
  }

  components(): UiComponentRegistry { return this.ui.components; }
  interactions(): NotationInteractionRegistry { return this.ui.interactions; }
  projections(): UiProjectionRegistry { return this.ui.projections; }
  settings(): PluginSettingsRegistry { return this.#settings; }
  instruments(): readonly PluginInstrumentContribution[] {
    return Object.freeze(this.catalog.list().flatMap((plugin) => {
      const record = this.#records.get(plugin.manifest.id);
      return record?.active ? [...(plugin.instruments ?? [])] : [];
    }));
  }
  playbackOutputs(): readonly PluginPlaybackOutputContribution[] {
    return Object.freeze(this.catalog.list().flatMap((plugin) => {
      const record = this.#records.get(plugin.manifest.id);
      return record?.active ? [...(plugin.playbackOutputs ?? [])] : [];
    }));
  }
  connectSettings(storage: PluginSettingsStoragePort): PluginSettingsPersistence {
    if (!this.#started) throw new Error("Plugin platform has not started");
    if (this.#settingsPersistence) throw new Error("Plugin settings storage is already connected");
    this.#settingsPersistence = new PluginSettingsPersistence(this.#settings, storage);
    return this.#settingsPersistence;
  }
  connectActivation(storage: PluginActivationStoragePort): PluginActivationPersistence {
    if (!this.#started) throw new Error("Plugin platform has not started");
    if (this.#activationPersistence) throw new Error("Plugin activation storage is already connected");
    this.#activationPersistence = new PluginActivationPersistence(this, storage);
    return this.#activationPersistence;
  }

  resolveCommands(snapshot: UiProjectionSnapshot, activatedPluginIds?: ReadonlySet<string>): readonly WorkbenchCommand[] {
    return this.ui.resolveCommands(snapshot, activatedPluginIds ?? this.#activated);
  }

  resolveViews(snapshot: UiProjectionSnapshot, activatedPluginIds?: ReadonlySet<string>): ReadonlyMap<string, UiResolvedViewContribution> {
    return this.ui.resolveViews(snapshot, activatedPluginIds ?? this.#activated);
  }

  #report(diagnostic: UiPluginDiagnostic): void {
    this.diagnostics.report(diagnostic);
    this.#onDiagnostic?.(diagnostic);
  }

  #settingsHost(pluginId: string): PluginSettingsHost | null {
    if (!this.#settings.has(pluginId)) return null;
    const existing = this.#settingsHosts.get(pluginId);
    if (existing) return existing;
    const host: PluginSettingsHost = Object.freeze({
      read: <T = unknown>() => this.#settings.read<T>(pluginId),
      write: <T = unknown>(value: unknown) => this.#settingsPersistence
        ? this.#settingsPersistence.write<T>(pluginId, value)
        : Promise.resolve(this.#settings.write<T>(pluginId, value)),
      reset: <T = unknown>() => this.#settingsPersistence
        ? this.#settingsPersistence.reset<T>(pluginId)
        : Promise.resolve(this.#settings.reset<T>(pluginId)),
    });
    this.#settingsHosts.set(pluginId, host);
    return host;
  }

  #validateInstruments(plugin: InternalUiPluginModule): void {
    const instruments = plugin.instruments ?? [];
    const actualIds = instruments.map((instrument) => instrument.id);
    const declaredIds = plugin.manifest.contributes.instruments ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length
      && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "乐器描述与插件清单不一致",
      detail: `UI plugin ${plugin.manifest.id} instrument binding does not match its manifest`,
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "instrument", id: duplicateId },
      message: "插件包含重复乐器描述",
      detail: `UI plugin ${plugin.manifest.id} contains duplicate instrument: ${duplicateId}`,
    });
    for (const instrument of instruments) {
      const extensionIds = instrument.noteControlExtensionIds ?? [];
      const validExtensionIds = extensionIds.length === new Set(extensionIds).size
        && extensionIds.every((id) => /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id));
      const validNotationKinds = instrument.notationKinds.length > 0
        && instrument.notationKinds.length === new Set(instrument.notationKinds).size
        && instrument.notationKinds.every((kind) => ["staff", "tablature", "numbered"].includes(kind));
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(instrument.id)
        || !instrument.label.trim()
        || !/^[a-z][a-z0-9-]*$/.test(instrument.family)
        || !validNotationKinds
        || !validExtensionIds
        || (instrument.playbackProfileId !== undefined
          && !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(instrument.playbackProfileId))) {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "instrument", id: instrument.id },
          message: "乐器描述定义无效",
          detail: `UI plugin ${plugin.manifest.id} contains an invalid instrument: ${instrument.id}`,
        });
      }
      for (const extensionId of extensionIds) {
        const extension = plugin.componentExtensions.find((item) => item.id === extensionId);
        if (!extension || extension.extensionPoint !== NOTE_CONTROL_EXTENSION_POINT) {
          throw new UiPluginHostError({
            code: "UI-PLG-009",
            stage: "permissions",
            plugin: uiPluginIdentity(plugin.manifest),
            subject: { kind: "component-extension", id: extensionId },
            message: "乐器描述引用了未声明的音符控制扩展",
            detail: `Instrument ${instrument.id} references an unavailable note-control extension: ${extensionId}`,
          });
        }
      }
      const ownerPluginId = this.#instrumentOwners.get(instrument.id);
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "instrument", id: instrument.id, ownerPluginId },
        message: "乐器描述 ID 与其他插件冲突",
        detail: `Instrument already owned: ${instrument.id}`,
      });
    }
  }

  #validatePlaybackOutputs(plugin: InternalUiPluginModule): void {
    const outputs = plugin.playbackOutputs ?? [];
    const actualIds = outputs.map((output) => output.id);
    const declaredIds = plugin.manifest.contributes.playbackOutputs ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length
      && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "播放输出与插件清单不一致",
      detail: `UI plugin ${plugin.manifest.id} playback output binding does not match its manifest`,
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "playback-output", id: duplicateId },
      message: "插件包含重复播放输出",
      detail: `UI plugin ${plugin.manifest.id} contains duplicate playback output: ${duplicateId}`,
    });
    for (const output of outputs) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/.test(output.id)
        || !output.label.trim()
        || !["builtin-synth", "sample-bank", "midi-out"].includes(output.kind)
        || typeof output.createEngine !== "function") {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "playback-output", id: output.id },
          message: "播放输出定义无效",
          detail: `UI plugin ${plugin.manifest.id} contains an invalid playback output: ${output.id}`,
        });
      }
      const ownerPluginId = this.#playbackOutputOwners.get(output.id);
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "playback-output", id: output.id, ownerPluginId },
        message: "播放输出 ID 与其他插件冲突",
        detail: `Playback output already owned: ${output.id}`,
      });
    }
  }

  #publish(): void {
    this.#snapshot = Object.freeze([...this.#records.values()]);
    for (const listener of this.#listeners) listener();
  }
}
