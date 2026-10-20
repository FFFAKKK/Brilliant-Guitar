import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import type {
  ApplicationCapabilityDirectory,
  RegisteredApplicationCapability,
} from "../contracts/application-capability.ts";
import type {
  RegisteredWorkflow,
  WorkflowDirectory,
} from "../contracts/workflow.ts";
import type { AnyUiProjection, UiProjectionSnapshot } from "../ui/projection-registry.ts";
import type { PluginManifest } from "./plugin-manifest.ts";
import type { UiComponentRegistry } from "../ui/component-registry.ts";
import type { ConcreteNotationKind, NotationInteractionDirectory } from "../input/notation-interaction-registry.ts";
import type { EditIntent } from "../input/edit-intent.ts";
import type { InputContext } from "../input/input-context.ts";
import type { InputSignal, KeyPressSignal } from "../input/input-signal.ts";
import type { UiResolvedViewContribution } from "../ui/view-contribution.ts";
import type { InternalUiPluginModule } from "../ui/plugin-manager.ts";
import { PluginCatalog } from "./plugin-catalog.ts";
import { adaptInternalUiPluginModule, capturePluginModule, legacyUiPluginModule } from "./plugin-module.ts";
import type { PluginModule } from "./plugin-module.ts";
import { UiPluginDiagnosticStore, UiPluginHostError, isUiPluginHostError, uiPluginIdentity } from "../ui/plugin-diagnostic.ts";
import type { UiPluginDiagnostic } from "../ui/plugin-diagnostic.ts";
import { notifyObservers } from "../ui/notify-observers.ts";
import type { UiProjectionRegistry } from "../ui/projection-registry.ts";
import { createLegacyContributionHost } from "../ui/plugin-contribution-host.ts";
import { WorkbenchFeatureRegistry } from "./plugin-manifest.ts";
import { adaptPluginPackage } from "./plugin-sdk-adapter.ts";
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
import {
  describePluginHostServiceDenial,
  PluginHostServicePolicy,
  PluginHostServiceRegistry,
} from "./plugin-security.ts";
import type {
  PluginHostServiceGrantV1,
  PluginHostServicePolicyOptions,
} from "./plugin-security.ts";
import { PluginSessionActivation } from "./plugin-session-activation.ts";
import type { PluginActivationChange } from "./plugin-session-activation.ts";

export type { PluginActivationChange, PluginActivationEffect } from "./plugin-session-activation.ts";

export type PluginRuntimeStatus = "discovered" | "installed" | "active" | "failed";
export type PluginPlatformPhase = "configuring" | "running" | "disposed";

export interface PluginRuntimeInfo {
  readonly manifest: PluginManifest;
  readonly status: PluginRuntimeStatus;
  /** Immutable activation state of the current process session. */
  readonly active: boolean;
  /** Desired activation state to use when the next process session is assembled. */
  readonly nextLaunchActive: boolean;
  readonly restartRequired: boolean;
  readonly error?: string;
}

/** A contribution host owns execution resources, never plugin identity or activation state. */
export interface PluginContributionHost {
  readonly components: Pick<UiComponentRegistry, "get" | "list">;
  readonly interactions: NotationInteractionDirectory;
  readonly projections: UiProjectionRegistry;
  install(plugin: InternalUiPluginModule): void;
  resolveCommands(snapshot: UiProjectionSnapshot, includedPluginIds: ReadonlySet<string>): readonly WorkbenchCommand[];
  resolveViews(snapshot: UiProjectionSnapshot, includedPluginIds: ReadonlySet<string>): ReadonlyMap<string, UiResolvedViewContribution>;
  dispose(): void;
}
export interface PluginContributionHostContext {
  readonly features: WorkbenchFeatureRegistry;
  readonly projections: UiProjectionRegistry;
  reportDiagnostic(diagnostic: UiPluginDiagnostic): void;
  settings(pluginId: string): PluginSettingsHost | null;
}

export interface PluginSessionPlanV1 {
  readonly planVersion: 1;
  readonly pluginIds: readonly string[];
  readonly hostServiceGrants: readonly PluginHostServiceGrantV1[];
  readonly kernelAssembly: PluginKernelAssemblyPlanV1;
}

export interface PluginStartOptions {
  /** Overrides this session's user-plugin selection without changing the persisted next-launch preference. */
  readonly selectedPluginIds?: readonly string[];
}

export interface PluginPlatformOptions {
  /** Direct trusted host injection. Explicit null selects headless even with legacy feature options. */
  readonly uiHost?: PluginContributionHost | null;
  readonly createContributionHost?: (context: PluginContributionHostContext) => PluginContributionHost;
  readonly hostFeatures?: WorkbenchFeatureRegistry;
  readonly hostServices?: PluginHostServiceRegistry;
  readonly hostServicePolicy?: PluginHostServicePolicyOptions;
  readonly projections?: readonly AnyUiProjection[];
  readonly diagnostics?: UiPluginDiagnosticStore;
  readonly onDiagnostic?: (diagnostic: UiPluginDiagnostic) => void;
}

export type PluginRegistration = InternalUiPluginModule | PluginModule | PluginPackage;
export type PluginComponentDirectory = Pick<UiComponentRegistry, "get" | "list">;
export type PluginInteractionDirectory = NotationInteractionDirectory;
export type PluginProjectionDirectory = Pick<UiProjectionRegistry, "has" | "list" | "snapshot">;
export type PluginSettingsDirectory = Pick<PluginSettingsRegistry,
  "has" | "subscribe" | "read" | "write" | "reset" | "restore" | "serialize">;
export interface PluginHostServiceGrantDirectory {
  get(pluginId: string): PluginHostServiceGrantV1 | undefined;
  list(): readonly PluginHostServiceGrantV1[];
}

function kernelPackageSource(manifest: PluginManifest): PluginKernelPackageManifestSource {
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

function sortedHostServiceGrants(
  grants: Iterable<PluginHostServiceGrantV1>,
): readonly PluginHostServiceGrantV1[] {
  return Object.freeze([...grants].sort((left, right) => left.pluginId < right.pluginId ? -1
    : left.pluginId > right.pluginId ? 1 : 0));
}

/** One package/lifecycle authority with an optional UI execution host. */
export class PluginPlatform {
  readonly diagnostics: UiPluginDiagnosticStore;
  readonly #catalog = new PluginCatalog();
  readonly #ui: PluginContributionHost | null;
  readonly #uiFeatures: WorkbenchFeatureRegistry;
  readonly #settings = new PluginSettingsRegistry();
  readonly #componentDirectory: PluginComponentDirectory;
  readonly #interactionDirectory: PluginInteractionDirectory;
  readonly #projectionDirectory: PluginProjectionDirectory;
  readonly #settingsDirectory: PluginSettingsDirectory;
  readonly #hostServicePolicy: PluginHostServicePolicy;
  readonly #hostServiceGrantDirectory: PluginHostServiceGrantDirectory;
  readonly #settingsHosts = new Map<string, PluginSettingsHost>();
  readonly #hostServiceGrants = new Map<string, PluginHostServiceGrantV1>();
  readonly #activation = new PluginSessionActivation();
  readonly #records = new Map<string, PluginRuntimeInfo>();
  readonly #instrumentOwners = new Map<string, string>();
  readonly #playbackOutputOwners = new Map<string, string>();
  readonly #applicationCapabilities = new Map<string, RegisteredApplicationCapability>();
  readonly #applicationCapabilityDirectory: ApplicationCapabilityDirectory;
  readonly #workflows = new Map<string, RegisteredWorkflow>();
  readonly #workflowDirectory: WorkflowDirectory;
  readonly #listeners = new Set<() => void>();
  readonly #onDiagnostic: ((diagnostic: UiPluginDiagnostic) => void) | undefined;
  #snapshot: readonly PluginRuntimeInfo[] = Object.freeze([]);
  #settingsPersistence: PluginSettingsPersistence | null = null;
  #activationPersistence: PluginActivationPersistence | null = null;
  #disposed = false;
  readonly #stopSettings: () => void;

  constructor(options: PluginPlatformOptions) {
    this.#uiFeatures = options.hostFeatures ?? new WorkbenchFeatureRegistry([]);
    this.diagnostics = options.diagnostics ?? new UiPluginDiagnosticStore();
    this.#onDiagnostic = options.onDiagnostic;
    this.#hostServicePolicy = new PluginHostServicePolicy(
      options.hostServices ?? new PluginHostServiceRegistry([]),
      options.hostServicePolicy,
    );
    if (options.uiHost !== undefined && options.createContributionHost !== undefined) {
      throw new Error("Choose uiHost or createContributionHost, not both");
    }
    const legacy = options.hostFeatures !== undefined || options.projections !== undefined
      || options.createContributionHost !== undefined;
    this.#ui = options.uiHost !== undefined ? options.uiHost : legacy ? createLegacyContributionHost({
      hostFeatures: this.#uiFeatures, projections: options.projections ?? [],
      ...(options.createContributionHost === undefined ? {} : { createContributionHost: options.createContributionHost }),
    }, { reportDiagnostic: diagnostic => this.#report(diagnostic), settings: pluginId => this.#settingsHost(pluginId) }) : null;
    this.#componentDirectory = Object.freeze({
      get: (id: string) => this.#requireUiHost().components.get(id),
      list: () => this.#requireUiHost().components.list(),
    });
    this.#interactionDirectory = Object.freeze({
      hasId: (id: string) => this.#requireUiHost().interactions.hasId(id),
      hasKind: (kind: ConcreteNotationKind) => this.#requireUiHost().interactions.hasKind(kind),
      list: () => this.#requireUiHost().interactions.list(),
      translate: <Input extends InputContext, Draft = unknown, Intent extends EditIntent<unknown, unknown> = EditIntent>(
        kind: ConcreteNotationKind, signal: InputSignal, context: Input,
      ) => this.#requireUiHost().interactions.translate<Input, Draft, Intent>(kind, signal, context),
      readDraft: <Draft>(kind: ConcreteNotationKind, composition: unknown) =>
        this.#requireUiHost().interactions.readDraft<Draft>(kind, composition),
      startComposition: <Draft>(kind: ConcreteNotationKind, draft: Draft) =>
        this.#requireUiHost().interactions.startComposition<Draft>(kind, draft),
      navigate: <Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) =>
        this.#requireUiHost().interactions.navigate<Context, Result>(kind, signal, context),
      edit: <Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) =>
        this.#requireUiHost().interactions.edit<Context, Result>(kind, signal, context),
    } satisfies NotationInteractionDirectory);
    this.#projectionDirectory = Object.freeze({
      has: (id: string) => this.#requireUiHost().projections.has(id),
      list: () => this.#requireUiHost().projections.list(),
      snapshot: (...args: Parameters<UiProjectionRegistry["snapshot"]>) => this.#requireUiHost().projections.snapshot(...args),
    });
    this.#settingsDirectory = Object.freeze({
      has: (pluginId: string) => this.#settings.has(pluginId),
      subscribe: (listener: () => void) => { this.#assertAlive(); return this.#settings.subscribe(listener); },
      read: <T = unknown>(pluginId: string) => this.#settings.read<T>(pluginId),
      write: <T = unknown>(pluginId: string, value: unknown) => { this.#assertAlive(); return this.#settings.write<T>(pluginId, value); },
      reset: <T = unknown>(pluginId: string) => { this.#assertAlive(); return this.#settings.reset<T>(pluginId); },
      restore: (value: unknown) => { this.#assertAlive(); return this.#settings.restore(value); },
      serialize: () => this.#settings.serialize(),
    });
    this.#hostServiceGrantDirectory = Object.freeze({
      get: (pluginId: string) => this.#hostServiceGrants.get(pluginId),
      list: () => sortedHostServiceGrants(this.#hostServiceGrants.values()),
    });
    this.#applicationCapabilityDirectory = Object.freeze({
      get: (id: string) => this.#applicationCapabilities.get(id),
      list: (caller: "ui" | "agent" | undefined) => Object.freeze([...this.#applicationCapabilities.values()]
        .filter((capability) => caller === undefined || capability.callers.includes(caller))),
    });
    this.#workflowDirectory = Object.freeze({
      get: (id: string) => this.#workflows.get(id),
      list: () => Object.freeze([...this.#workflows.values()]),
      listByPlugin: (ownerPluginId: string) => Object.freeze([...this.#workflows.values()]
        .filter((workflow) => workflow.ownerPluginId === ownerPluginId)),
    });
    this.#stopSettings = this.#settings.subscribe(() => this.#publish());
  }

  register(registration: PluginRegistration): void {
    this.#assertAlive();
    if (this.phase() === "running") throw new Error("Plugin platform has already started");
    let plugin: PluginModule;
    let pluginPackage: PluginPackage | null = null;
    if (isUiPluginPackage(registration)) {
      pluginPackage = registration;
      plugin = adaptPluginPackage(registration, { settings: (pluginId) => this.#settingsHost(pluginId) });
    } else if ("projections" in registration) {
      plugin = adaptInternalUiPluginModule(registration);
    } else {
      plugin = capturePluginModule(registration);
    }
    if (this.#records.has(plugin.manifest.id)) throw new Error(`Plugin already registered: ${plugin.manifest.id}`);
    createPluginKernelAssemblyPlanV1([
      ...[...this.#records.values()].map((record) => kernelPackageSource(record.manifest)),
      kernelPackageSource(plugin.manifest),
    ]);
    if (pluginPackage?.settings) this.#settings.register(plugin.manifest.id, pluginPackage.settings);
    this.#catalog.register(plugin);
    this.#activation.register(plugin.manifest.id, plugin.manifest.activation);
    this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "discovered"));
    this.#publish();
  }

  registerAll(plugins: readonly PluginRegistration[]): void {
    for (const plugin of plugins) this.register(plugin);
  }

  start(options: PluginStartOptions = {}): PluginSessionPlanV1 {
    this.#assertAlive();
    if (this.phase() === "running") return this.sessionPlan();
    this.#activation.start(options.selectedPluginIds);
    for (const plugin of this.#catalog.installationPlan()) {
      if (!this.#activation.selectedForSession(plugin.manifest.id)) {
        this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "installed"));
        continue;
      }
      try {
        const missingFeatures = plugin.manifest.requires.hostFeatures.filter(id => !this.#uiFeatures.has(id));
        const missingProjections = plugin.manifest.requires.projections.filter(id => !this.#ui?.projections.has(id));
        if ((plugin.manifest.apiVersion === "4.0" || !this.#ui) && (missingFeatures.length || missingProjections.length)) throw new Error(
          `Unavailable plugin requirements: ${[...missingFeatures, ...missingProjections].join(", ")}`);
        const hostServiceGrant = this.#resolveHostServiceGrant(plugin);
        this.#validateInstruments(plugin);
        this.#validatePlaybackOutputs(plugin);
        this.#validateApplicationCapabilities(plugin);
        this.#validateWorkflows(plugin);
        if (plugin.ui && !this.#ui) throw new UiPluginHostError({
          code: "UI-PLG-003", stage: "requirements", plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "capability", id: "workbench.ui-host" },
          message: "插件需要的界面宿主不可用", detail: `Plugin ${plugin.manifest.id} requires a UI host`,
        });
        // Existing configured hosts also receive UI-free packages, preserving their original API checks/callbacks.
        this.#ui?.install(legacyUiPluginModule(plugin));
        for (const instrument of plugin.instruments ?? []) {
          this.#instrumentOwners.set(instrument.id, plugin.manifest.id);
        }
        for (const output of plugin.playbackOutputs ?? []) {
          this.#playbackOutputOwners.set(output.id, plugin.manifest.id);
        }
        for (const capability of plugin.applicationCapabilities ?? []) {
          this.#applicationCapabilities.set(capability.id, Object.freeze({
            ...capability,
            callers: Object.freeze([...capability.callers]),
            ownerPluginId: plugin.manifest.id,
          }));
        }
        for (const workflow of plugin.workflows ?? []) {
          this.#workflows.set(workflow.id, Object.freeze({
            ...workflow,
            operationIds: Object.freeze([...workflow.operationIds]),
            entryOperationIds: Object.freeze([...workflow.entryOperationIds]),
            ownerPluginId: plugin.manifest.id,
            ownerPluginVersion: plugin.manifest.version,
          }));
        }
        this.#hostServiceGrants.set(plugin.manifest.id, hostServiceGrant);
        this.#activation.markActive(plugin.manifest.id);
        this.#records.set(plugin.manifest.id, this.#runtimeInfo(plugin.manifest, "active"));
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
        this.#records.set(plugin.manifest.id, Object.freeze({ ...this.#runtimeInfo(plugin.manifest, "failed"), error: failure.diagnostic.detail }));
      }
    }
    this.#publish();
    return this.sessionPlan();
  }

  phase(): PluginPlatformPhase { return this.#disposed ? "disposed" : this.#activation.phase(); }

  list(): readonly PluginRuntimeInfo[] {
    return this.#snapshot;
  }

  readonly getSnapshot = (): readonly PluginRuntimeInfo[] => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#assertAlive();
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
    this.#assertAlive();
    this.#activation.restoreDesired(pluginIds);
    if (this.#refreshActivationRecords()) this.#publish();
  }

  activatedPluginIds(): ReadonlySet<string> {
    return this.#disposed ? new Set() : this.#activation.activeIds();
  }

  nextLaunchPluginIds(): ReadonlySet<string> {
    return this.#activation.nextLaunchIds();
  }

  restartRequired(): boolean {
    return this.#activation.restartRequired();
  }

  sessionPlan(): PluginSessionPlanV1 {
    if (this.phase() !== "running") throw new Error("Plugin platform has not started");
    return Object.freeze({
      planVersion: 1,
      pluginIds: Object.freeze([...this.#activation.activeIds()].sort()),
      hostServiceGrants: sortedHostServiceGrants(this.#hostServiceGrants.values()),
      kernelAssembly: this.kernelAssemblyPlan(),
    });
  }

  /** Data-only fixed-session plan. The trusted host resolves implementations in a separate execution adapter. */
  kernelAssemblyPlan(): PluginKernelAssemblyPlanV1 {
    return createPluginKernelAssemblyPlanV1(
      [...this.#records.values()]
        .filter((record) => this.phase() === "running" ? record.active : record.nextLaunchActive)
        .map((record) => kernelPackageSource(record.manifest)),
    );
  }

  components(): PluginComponentDirectory { return this.#componentDirectory; }
  interactions(): PluginInteractionDirectory { return this.#interactionDirectory; }
  projections(): PluginProjectionDirectory { return this.#projectionDirectory; }
  settings(): PluginSettingsDirectory { return this.#settingsDirectory; }
  hostServiceGrants(): PluginHostServiceGrantDirectory { return this.#hostServiceGrantDirectory; }
  applicationCapabilities(): ApplicationCapabilityDirectory { return this.#applicationCapabilityDirectory; }
  workflows(): WorkflowDirectory { return this.#workflowDirectory; }
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
    this.#assertAlive();
    if (this.phase() !== "running") throw new Error("Plugin platform has not started");
    if (this.#settingsPersistence) throw new Error("Plugin settings storage is already connected");
    this.#settingsPersistence = new PluginSettingsPersistence(this.#settings, storage);
    return this.#settingsPersistence;
  }
  connectActivation(storage: PluginActivationStoragePort): PluginActivationPersistence {
    this.#assertAlive();
    if (this.#activationPersistence) throw new Error("Plugin activation storage is already connected");
    this.#activationPersistence = new PluginActivationPersistence(this, storage);
    return this.#activationPersistence;
  }

  resolveCommands(snapshot: UiProjectionSnapshot): readonly WorkbenchCommand[] {
    this.#assertAlive();
    return this.#requireUiHost().resolveCommands(snapshot, this.#activation.activeIds());
  }

  resolveViews(snapshot: UiProjectionSnapshot): ReadonlyMap<string, UiResolvedViewContribution> {
    this.#assertAlive();
    return this.#requireUiHost().resolveViews(snapshot, this.#activation.activeIds());
  }

  /** Frozen, data-only mount descriptors for UI management; implementations remain private. */
  uiContributions(pluginId: string) {
    const ui = this.#catalog.list().find(plugin => plugin.manifest.id === pluginId)?.ui?.ui;
    if (!ui) return undefined;
    return Object.freeze({ components: Object.freeze(ui.components.map(({ mount: _mount, ...data }) => Object.freeze(data))),
      commands: Object.freeze(ui.commands.map(command => Object.freeze({ id: command.id, label: command.label ?? command.id }))),
      menuItems: ui.menuItems, shortcuts: ui.shortcuts });
  }

  /** Placement query over the active catalog. Does not own another registry or lifecycle. */
  facets(facetId?: string) {
    if (this.#disposed || facetId !== undefined && facetId !== "ui") return Object.freeze([]);
    return Object.freeze(this.#catalog.list().filter(plugin => this.#records.get(plugin.manifest.id)?.active && plugin.ui?.ui)
      .map(plugin => {
        const units = plugin.ui!.ui!.components;
        const surface = (unit: typeof units[number], kind: "module" | "page") => Object.freeze({ id: unit.id,
          componentId: unit.id, kind, slots: unit.slots, role: unit.role });
        const page = (unit: typeof units[number]) => unit.uiKind === "page" || unit.role === "view";
        return Object.freeze({ facetId: "ui", contractVersion: 1, pluginId: plugin.manifest.id,
          value: Object.freeze({ facetId: "ui", contractVersion: 1,
            modules: Object.freeze(units.filter(unit => !page(unit)).map(unit => surface(unit, "module"))),
            pages: Object.freeze(units.filter(page).map(unit => surface(unit, "page"))),
            slots: Object.freeze([...new Set(units.flatMap(unit => unit.slots))]) }) });
      }));
  }

  /** Ends this entire application session permanently. Not a per-plugin hot unload API. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopSettings();
    this.#settingsPersistence?.dispose(); this.#activationPersistence?.dispose();
    try { this.#ui?.dispose(); }
    finally {
      this.#catalog.clear(); this.#settings.dispose();
      this.#hostServiceGrants.clear(); this.#settingsHosts.clear(); this.#records.clear();
      this.#instrumentOwners.clear(); this.#playbackOutputOwners.clear();
      this.#applicationCapabilities.clear(); this.#workflows.clear();
      try { this.#publish(); } finally { this.#listeners.clear(); }
    }
  }

  #requireUiHost(): PluginContributionHost {
    if (!this.#ui) throw new Error("Plugin UI host is not configured");
    return this.#ui;
  }

  #assertAlive(): void { if (this.#disposed) throw new Error("Plugin platform is disposed"); }

  #setNextLaunchActivation(pluginId: string, enabled: boolean): PluginActivationChange {
    this.#assertAlive();
    const change = this.#activation.setDesired(pluginId, enabled);
    if (change.effect !== "rejected" && this.#refreshActivationRecord(pluginId)) this.#publish();
    return change;
  }

  #runtimeInfo(manifest: PluginManifest, status: PluginRuntimeStatus): PluginRuntimeInfo {
    return Object.freeze({ manifest, status, ...this.#activation.state(manifest.id) });
  }

  #refreshActivationRecord(pluginId: string): boolean {
    const record = this.#records.get(pluginId);
    if (!record) return false;
    const state = this.#activation.state(pluginId);
    if (record.active === state.active && record.nextLaunchActive === state.nextLaunchActive
      && record.restartRequired === state.restartRequired) return false;
    this.#records.set(pluginId, Object.freeze({ ...record, ...state }));
    return true;
  }

  #refreshActivationRecords(): boolean {
    let changed = false;
    for (const pluginId of this.#records.keys()) changed = this.#refreshActivationRecord(pluginId) || changed;
    return changed;
  }

  #report(diagnostic: UiPluginDiagnostic): void {
    this.diagnostics.report(diagnostic);
    if (this.#onDiagnostic) notifyObservers([() => this.#onDiagnostic?.(diagnostic)]);
  }

  #settingsHost(pluginId: string): PluginSettingsHost | null {
    if (!this.#settings.has(pluginId)) return null;
    const existing = this.#settingsHosts.get(pluginId);
    if (existing) return existing;
    const host: PluginSettingsHost = Object.freeze({
      read: <T = unknown>() => this.#settings.read<T>(pluginId),
      write: <T = unknown>(value: unknown) => { this.#assertAlive(); return this.#settingsPersistence
        ? this.#settingsPersistence.write<T>(pluginId, value)
        : Promise.resolve(this.#settings.write<T>(pluginId, value)); },
      reset: <T = unknown>() => { this.#assertAlive(); return this.#settingsPersistence
        ? this.#settingsPersistence.reset<T>(pluginId)
        : Promise.resolve(this.#settings.reset<T>(pluginId)); },
    });
    this.#settingsHosts.set(pluginId, host);
    return host;
  }

  #resolveHostServiceGrant(plugin: PluginModule): PluginHostServiceGrantV1 {
    const resolution = this.#hostServicePolicy.resolve({
      pluginId: plugin.manifest.id,
      pluginVersion: plugin.manifest.version,
      tier: plugin.manifest.tier ?? "product",
      requiredHostServices: plugin.manifest.requires.hostServices ?? [],
    });
    if (resolution.accepted) return resolution.grant;
    const denied = [
      ...resolution.denial.unavailable,
      ...resolution.denial.deniedByTier,
      ...resolution.denial.deniedByUser,
      ...resolution.denial.deniedBySession,
    ][0] ?? "unknown.host-service";
    throw new UiPluginHostError({
      code: "UI-PLG-003",
      stage: "permissions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "host-service", id: denied },
      message: "插件所需宿主服务未获授权",
      detail: `Plugin ${plugin.manifest.id} host service grant denied: ${
        describePluginHostServiceDenial(resolution.denial)}`,
    });
  }

  #validateInstruments(plugin: PluginModule): void {
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
        const extension = plugin.ui?.componentExtensions.find((item) => item.id === extensionId);
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

  #validatePlaybackOutputs(plugin: PluginModule): void {
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

  #validateApplicationCapabilities(plugin: PluginModule): void {
    const capabilities = plugin.applicationCapabilities ?? [];
    const actualIds = capabilities.map((capability) => capability.id);
    const declaredIds = plugin.manifest.contributes.applicationCapabilities ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length
      && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "应用能力与插件清单不一致",
      detail: `Plugin ${plugin.manifest.id} application capability binding does not match its manifest`,
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "capability", id: duplicateId },
      message: "插件包含重复应用能力",
      detail: `Plugin ${plugin.manifest.id} contains duplicate Application Capability: ${duplicateId}`,
    });
    for (const capability of capabilities) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(capability.id)
        || !Number.isSafeInteger(capability.contractVersion)
        || capability.contractVersion < 1
        || capability.callers.length === 0
        || capability.callers.length !== new Set(capability.callers).size
        || capability.callers.some((caller) => caller !== "ui" && caller !== "agent")
        || typeof capability.validateInput !== "function"
        || typeof capability.validateOutput !== "function") {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "capability", id: capability.id },
          message: "应用能力定义无效",
          detail: `Plugin ${plugin.manifest.id} contains an invalid Application Capability: ${capability.id}`,
        });
      }
      const ownerPluginId = this.#applicationCapabilities.get(capability.id)?.ownerPluginId;
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "capability", id: capability.id, ownerPluginId },
        message: "应用能力 ID 与其他插件冲突",
        detail: `Application Capability already owned: ${capability.id}`,
      });
    }
  }

  #validateWorkflows(plugin: PluginModule): void {
    const workflows = plugin.workflows ?? [];
    const actualIds = workflows.map((workflow) => workflow.id);
    const declaredIds = plugin.manifest.contributes.workflows ?? [];
    const sameDeclaration = actualIds.length === declaredIds.length
      && actualIds.every((id, index) => id === declaredIds[index]);
    if (!sameDeclaration) throw new UiPluginHostError({
      code: "UI-PLG-005",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      message: "工作流与插件清单不一致",
      detail: `Plugin ${plugin.manifest.id} workflow binding does not match its manifest`,
    });
    const duplicateId = actualIds.find((id, index) => actualIds.indexOf(id) !== index);
    if (duplicateId) throw new UiPluginHostError({
      code: "UI-PLG-006",
      stage: "contributions",
      plugin: uiPluginIdentity(plugin.manifest),
      subject: { kind: "workflow", id: duplicateId },
      message: "插件包含重复工作流",
      detail: `Plugin ${plugin.manifest.id} contains duplicate workflow: ${duplicateId}`,
    });
    for (const workflow of workflows) {
      const validOperationIds = workflow.operationIds.length > 0
        && workflow.operationIds.length === new Set(workflow.operationIds).size
        && workflow.operationIds.every((id) => /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(id));
      const validEntryIds = workflow.entryOperationIds.length > 0
        && workflow.entryOperationIds.length === new Set(workflow.entryOperationIds).size
        && workflow.entryOperationIds.every((id) => workflow.operationIds.includes(id));
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(workflow.id)
        || !Number.isSafeInteger(workflow.contractVersion)
        || workflow.contractVersion < 1
        || !workflow.name.trim()
        || !workflow.description.trim()
        || workflow.runtime !== "agent-orchestration-v1"
        || !validOperationIds
        || !validEntryIds) {
        throw new UiPluginHostError({
          code: "UI-PLG-007",
          stage: "contributions",
          plugin: uiPluginIdentity(plugin.manifest),
          subject: { kind: "workflow", id: workflow.id },
          message: "工作流定义无效",
          detail: `Plugin ${plugin.manifest.id} contains an invalid workflow: ${workflow.id}`,
        });
      }
      const ownerPluginId = this.#workflows.get(workflow.id)?.ownerPluginId;
      if (ownerPluginId) throw new UiPluginHostError({
        code: "UI-PLG-008",
        stage: "registration",
        plugin: uiPluginIdentity(plugin.manifest),
        subject: { kind: "workflow", id: workflow.id, ownerPluginId },
        message: "工作流 ID 与其他插件冲突",
        detail: `Workflow already owned: ${workflow.id}`,
      });
    }
  }

  #publish(): void {
    this.#snapshot = Object.freeze([...this.#records.values()].map((record) => Object.freeze({ ...record })));
    notifyObservers(this.#listeners);
  }
}
