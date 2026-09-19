import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import type { AnyUiProjection, UiProjectionSnapshot } from "../ui/projection-registry.ts";
import type { UiPluginManifest } from "../ui/plugin-manifest.ts";
import type { UiComponentRegistry } from "../ui/component-registry.ts";
import type { ConcreteNotationKind, NotationInteractionDirectory } from "../input/notation-interaction-registry.ts";
import type { EditIntent } from "../input/edit-intent.ts";
import type { InputContext } from "../input/input-context.ts";
import type { InputSignal, KeyPressSignal } from "../input/input-signal.ts";
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
  PluginPackage } from "./plugin-sdk.ts";
import { PluginSettingsRegistry } from "./plugin-settings.ts";
import { PluginSettingsPersistence } from "./plugin-settings-persistence.ts";
import type { PluginSettingsStoragePort } from "./plugin-settings-persistence.ts";
import { PluginActivationPersistence } from "./plugin-activation-persistence.ts";
import type { PluginActivationStoragePort } from "./plugin-activation-persistence.ts";
import { createPluginKernelAssemblyPlanV1 } from "./plugin-package-contract.ts";
import type {
  PluginKernelAssemblyPlanV1,
  PluginKernelPackageManifestSource,
} from "./plugin-package-contract.ts";

export type PluginRuntimeStatus = "discovered" | "installed" | "active" | "failed";
export type PluginPlatformPhase = "configuring" | "running";
export type PluginActivationEffect = "configured" | "restart-required" | "unchanged" | "rejected";

export interface PluginRuntimeInfo {
  readonly manifest: UiPluginManifest;
  readonly status: PluginRuntimeStatus;
  /** Immutable activation state of the current process session. */
  readonly active: boolean;
  /** Desired activation state to use when the next process session is assembled. */
  readonly nextLaunchActive: boolean;
  readonly restartRequired: boolean;
}

export interface PluginActivationChange {
  readonly pluginId: string;
  readonly active: boolean;
  readonly nextLaunchActive: boolean;
  readonly restartRequired: boolean;
  readonly effect: PluginActivationEffect;
}

export interface PluginSessionPlanV1 {
  readonly planVersion: 1;
  readonly pluginIds: readonly string[];
  readonly kernelAssembly: PluginKernelAssemblyPlanV1;
}

export interface PluginStartOptions {
  /** Omits every user-configurable package for this process without changing its next-launch preference. */
  readonly safeMode?: boolean;
}

export interface PluginPlatformOptions {
  readonly capabilities: WorkbenchCapabilityRegistry;
  readonly projections: readonly AnyUiProjection[];
  readonly diagnostics?: UiPluginDiagnosticStore;
  readonly onDiagnostic?: (diagnostic: UiPluginDiagnostic) => void;
}

export type PluginRegistration = InternalUiPluginModule | PluginPackage;
export type PluginComponentDirectory = Pick<UiComponentRegistry, "get" | "list">;
export type PluginInteractionDirectory = NotationInteractionDirectory;
export type PluginProjectionDirectory = Pick<UiProjectionRegistry, "has" | "list" | "snapshot">;
export type PluginSettingsDirectory = Pick<PluginSettingsRegistry,
  "has" | "subscribe" | "read" | "write" | "reset" | "restore" | "serialize">;

function kernelPackageSource(manifest: UiPluginManifest): PluginKernelPackageManifestSource {
  return {
    id: manifest.id,
    version: manifest.version,
    activation: manifest.activation,
    ...(manifest.tier === undefined ? {} : { tier: manifest.tier }),
    ...(manifest.contributes.kernelModules === undefined
      ? {}
      : { kernelModules: manifest.contributes.kernelModules }),
  };
}

/** One package/lifecycle facade that delegates application execution to the internal UI host. */
export class PluginPlatform {
  readonly diagnostics: UiPluginDiagnosticStore;
  readonly #catalog = new UiPluginCatalog();
  readonly #ui: ConcreteUiPluginHost;
  readonly #settings = new PluginSettingsRegistry();
  readonly #componentDirectory: PluginComponentDirectory;
  readonly #interactionDirectory: PluginInteractionDirectory;
  readonly #projectionDirectory: PluginProjectionDirectory;
  readonly #settingsDirectory: PluginSettingsDirectory;
  readonly #settingsHosts = new Map<string, PluginSettingsHost>();
  readonly #records = new Map<string, PluginRuntimeInfo>();
  readonly #instrumentOwners = new Map<string, string>();
  readonly #playbackOutputOwners = new Map<string, string>();
  readonly #activated = new Set<string>();
  readonly #nextLaunchActivated = new Set<string>();
  readonly #listeners = new Set<() => void>();
  readonly #onDiagnostic: ((diagnostic: UiPluginDiagnostic) => void) | undefined;
  #snapshot: readonly PluginRuntimeInfo[] = Object.freeze([]);
  #started = false;
  #settingsPersistence: PluginSettingsPersistence | null = null;
  #activationPersistence: PluginActivationPersistence | null = null;

  constructor(options: PluginPlatformOptions) {
    this.diagnostics = options.diagnostics ?? new UiPluginDiagnosticStore();
    this.#onDiagnostic = options.onDiagnostic;
    this.#ui = new ConcreteUiPluginHost(options.capabilities, new UiProjectionRegistry(options.projections),
      (diagnostic) => this.#report(diagnostic));
    this.#componentDirectory = Object.freeze({
      get: (id: string) => this.#ui.components.get(id),
      list: () => this.#ui.components.list(),
    });
    this.#interactionDirectory = Object.freeze({
      hasId: (id: string) => this.#ui.interactions.hasId(id),
      hasKind: (kind: ConcreteNotationKind) => this.#ui.interactions.hasKind(kind),
      list: () => this.#ui.interactions.list(),
      translate: <Input extends InputContext, Draft = unknown, Intent extends EditIntent = EditIntent>(
        kind: ConcreteNotationKind, signal: InputSignal, context: Input,
      ) => this.#ui.interactions.translate<Input, Draft, Intent>(kind, signal, context),
      readDraft: <Draft>(kind: ConcreteNotationKind, composition: unknown) =>
        this.#ui.interactions.readDraft<Draft>(kind, composition),
      startComposition: <Draft>(kind: ConcreteNotationKind, draft: Draft) =>
        this.#ui.interactions.startComposition<Draft>(kind, draft),
      navigate: <Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) =>
        this.#ui.interactions.navigate<Context, Result>(kind, signal, context),
      edit: <Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) =>
        this.#ui.interactions.edit<Context, Result>(kind, signal, context),
    } satisfies NotationInteractionDirectory);
    this.#projectionDirectory = Object.freeze({
      has: (id: string) => this.#ui.projections.has(id),
      list: () => this.#ui.projections.list(),
      snapshot: (...args: Parameters<UiProjectionRegistry["snapshot"]>) => this.#ui.projections.snapshot(...args),
    });
    this.#settingsDirectory = Object.freeze({
      has: (pluginId: string) => this.#settings.has(pluginId),
      subscribe: (listener: () => void) => this.#settings.subscribe(listener),
      read: <T = unknown>(pluginId: string) => this.#settings.read<T>(pluginId),
      write: <T = unknown>(pluginId: string, value: unknown) => this.#settings.write<T>(pluginId, value),
      reset: <T = unknown>(pluginId: string) => this.#settings.reset<T>(pluginId),
      restore: (value: unknown) => this.#settings.restore(value),
      serialize: () => this.#settings.serialize(),
    });
    this.#settings.subscribe(() => this.#publish());
  }

  register(registration: PluginRegistration): void {
    if (this.#started) throw new Error("Plugin platform has already started");
    let plugin: InternalUiPluginModule;
    let pluginPackage: PluginPackage | null = null;
    if (isUiPluginPackage(registration)) {
      pluginPackage = registration;
      plugin = adaptUiPluginPackage(registration, { settings: (pluginId) => this.#settingsHost(pluginId) });
    } else {
      plugin = registration;
    }
    if (this.#records.has(plugin.manifest.id)) throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    createPluginKernelAssemblyPlanV1([
      ...[...this.#records.values()].map((record) => kernelPackageSource(record.manifest)),
      kernelPackageSource(plugin.manifest),
    ]);
    if (pluginPackage?.settings) this.#settings.register(plugin.manifest.id, pluginPackage.settings);
    this.#catalog.register(plugin);
    const nextLaunchActive = plugin.manifest.activation === "always";
    this.#records.set(plugin.manifest.id, {
      manifest: plugin.manifest,
      status: "discovered",
      active: false,
      nextLaunchActive,
      restartRequired: false,
    });
    this.#publish();
  }

  registerAll(plugins: readonly PluginRegistration[]): void {
    for (const plugin of plugins) this.register(plugin);
  }

  start(options: PluginStartOptions = {}): PluginSessionPlanV1 {
    if (this.#started) return this.sessionPlan();
    this.#started = true;
    for (const plugin of this.#catalog.installationPlan()) {
      const nextLaunchActive = plugin.manifest.activation === "always"
        || this.#nextLaunchActivated.has(plugin.manifest.id);
      const selected = plugin.manifest.activation === "always" || (!options.safeMode && nextLaunchActive);
      if (!selected) {
        this.#records.set(plugin.manifest.id, {
          manifest: plugin.manifest,
          status: "installed",
          active: false,
          nextLaunchActive,
          restartRequired: nextLaunchActive,
        });
        continue;
      }
      try {
        this.#validateInstruments(plugin);
        this.#validatePlaybackOutputs(plugin);
        this.#ui.install(plugin);
        for (const instrument of plugin.instruments ?? []) {
          this.#instrumentOwners.set(instrument.id, plugin.manifest.id);
        }
        for (const output of plugin.playbackOutputs ?? []) {
          this.#playbackOutputOwners.set(output.id, plugin.manifest.id);
        }
        this.#activated.add(plugin.manifest.id);
        this.#records.set(plugin.manifest.id, { manifest: plugin.manifest,
          status: "active", active: true, nextLaunchActive: true, restartRequired: false });
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
        this.#records.set(plugin.manifest.id, { manifest: plugin.manifest, status: "failed", active: false,
          nextLaunchActive: true, restartRequired: true });
      }
    }
    this.#publish();
    return this.sessionPlan();
  }

  phase(): PluginPlatformPhase { return this.#started ? "running" : "configuring"; }

  list(): readonly PluginRuntimeInfo[] {
    return this.#snapshot;
  }

  readonly getSnapshot = (): readonly PluginRuntimeInfo[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** Configures activation before launch, or schedules it for the next launch after the session is locked. */
  activate(pluginId: string): PluginActivationChange { return this.#setNextLaunchActivation(pluginId, true); }

  /** Configures activation before launch, or schedules it for the next launch after the session is locked. */
  deactivate(pluginId: string): PluginActivationChange { return this.#setNextLaunchActivation(pluginId, false); }

  /**
   * Reconciles the desired user-plugin set. Before start this configures the imminent
   * session; after start it only changes the next-launch plan. The current session is immutable.
   */
  restoreActivation(pluginIds: readonly string[]): void {
    const desired = new Set(pluginIds);
    let changed = false;
    for (const [pluginId, record] of this.#records) {
      if (record.manifest.activation !== "user") continue;
      const nextLaunchActive = desired.has(pluginId);
      if (nextLaunchActive) this.#nextLaunchActivated.add(pluginId);
      else this.#nextLaunchActivated.delete(pluginId);
      const restartRequired = this.#started && record.active !== nextLaunchActive;
      if (record.nextLaunchActive === nextLaunchActive && record.restartRequired === restartRequired) continue;
      changed = true;
      this.#records.set(pluginId, { ...record, nextLaunchActive, restartRequired });
    }
    if (changed) this.#publish();
  }

  activatedPluginIds(): ReadonlySet<string> {
    return new Set(this.#activated);
  }

  nextLaunchPluginIds(): ReadonlySet<string> {
    return new Set([...this.#records.values()]
      .filter((record) => record.nextLaunchActive)
      .map((record) => record.manifest.id));
  }

  restartRequired(): boolean {
    return [...this.#records.values()].some((record) => record.restartRequired);
  }

  sessionPlan(): PluginSessionPlanV1 {
    if (!this.#started) throw new Error("Plugin platform has not started");
    return Object.freeze({
      planVersion: 1,
      pluginIds: Object.freeze([...this.#activated].sort()),
      kernelAssembly: this.kernelAssemblyPlan(),
    });
  }

  /** Data-only fixed-session plan. The trusted host resolves implementations in a separate execution adapter. */
  kernelAssemblyPlan(): PluginKernelAssemblyPlanV1 {
    return createPluginKernelAssemblyPlanV1(
      [...this.#records.values()]
        .filter((record) => this.#started ? record.active : record.nextLaunchActive)
        .map((record) => kernelPackageSource(record.manifest)),
    );
  }

  components(): PluginComponentDirectory { return this.#componentDirectory; }
  interactions(): PluginInteractionDirectory { return this.#interactionDirectory; }
  projections(): PluginProjectionDirectory { return this.#projectionDirectory; }
  settings(): PluginSettingsDirectory { return this.#settingsDirectory; }
  instruments(): readonly PluginInstrumentContribution[] {
    return Object.freeze(this.#catalog.list().flatMap((plugin) => {
      const record = this.#records.get(plugin.manifest.id);
      return record?.active ? [...(plugin.instruments ?? [])] : [];
    }));
  }
  playbackOutputs(): readonly PluginPlaybackOutputContribution[] {
    return Object.freeze(this.#catalog.list().flatMap((plugin) => {
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
    if (this.#activationPersistence) throw new Error("Plugin activation storage is already connected");
    this.#activationPersistence = new PluginActivationPersistence(this, storage);
    return this.#activationPersistence;
  }

  resolveCommands(snapshot: UiProjectionSnapshot): readonly WorkbenchCommand[] {
    return this.#ui.resolveCommands(snapshot, this.#activated);
  }

  resolveViews(snapshot: UiProjectionSnapshot): ReadonlyMap<string, UiResolvedViewContribution> {
    return this.#ui.resolveViews(snapshot, this.#activated);
  }

  #setNextLaunchActivation(pluginId: string, enabled: boolean): PluginActivationChange {
    const record = this.#records.get(pluginId);
    if (!record || record.manifest.activation !== "user") {
      return Object.freeze({
        pluginId,
        active: record?.active ?? false,
        nextLaunchActive: record?.nextLaunchActive ?? false,
        restartRequired: record?.restartRequired ?? false,
        effect: "rejected",
      });
    }
    if (enabled) this.#nextLaunchActivated.add(pluginId);
    else this.#nextLaunchActivated.delete(pluginId);
    const restartRequired = this.#started && record.active !== enabled;
    const changed = record.nextLaunchActive !== enabled || record.restartRequired !== restartRequired;
    if (changed) {
      this.#records.set(pluginId, { ...record, nextLaunchActive: enabled, restartRequired });
      this.#publish();
    }
    return Object.freeze({
      pluginId,
      active: record.active,
      nextLaunchActive: enabled,
      restartRequired,
      effect: !changed ? "unchanged" : this.#started ? "restart-required" : "configured",
    });
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
    this.#snapshot = Object.freeze([...this.#records.values()].map((record) => Object.freeze({ ...record })));
    for (const listener of this.#listeners) listener();
  }
}
