import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import { UiComponentRegistry } from "./component-registry.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";
import type { UiPluginManifest } from "./plugin-manifest.ts";
import { isUiPluginManifest, WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";
import type { AnyUiProjection, UiProjectionReader, UiProjectionSnapshot } from "./projection-registry.ts";
import { UiProjectionRegistry } from "./projection-registry.ts";
import type { UiComponentExtensionContribution, UiComponentViewContribution, UiResolvedComponentExtension,
  UiResolvedViewContribution } from "./view-contribution.ts";
import { UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";
import type { UiPluginDiagnostic, UiPluginFailureCode, UiPluginFailureStage, UiPluginFailureSubject } from "./plugin-diagnostic.ts";
import { NotationInteractionRegistry } from "../input/notation-interaction-registry.ts";
import type { NotationInteractionContribution } from "../input/notation-interaction-registry.ts";
import type { PluginInstrumentContribution, PluginPlaybackOutputContribution } from "../plugins/plugin-sdk.ts";

export interface UiCommandContribution {
  readonly id: string;
  create(projections: UiProjectionReader): WorkbenchCommand;
}

export interface InternalUiPluginModule {
  readonly manifest: UiPluginManifest;
  readonly projections: readonly AnyUiProjection[];
  readonly commands: readonly UiCommandContribution[];
  readonly views: readonly UiComponentViewContribution[];
  readonly interactions: readonly NotationInteractionContribution<any, any, any, any, any, any, any>[];
  readonly componentExtensions: readonly UiComponentExtensionContribution[];
  readonly instruments?: readonly PluginInstrumentContribution[];
  readonly playbackOutputs?: readonly PluginPlaybackOutputContribution[];
}

interface InstalledPlugin {
  readonly module: InternalUiPluginModule;
  readonly projections: UiProjectionReader;
}

function sameIds(actual: readonly string[], declared: readonly string[]): boolean {
  return actual.length === declared.length && actual.every((id, index) => id === declared[index]);
}

/** Startup-only host for compiled first-party UI plugins. */
export class UiPluginHost {
  readonly components = new UiComponentRegistry();
  readonly projections: UiProjectionRegistry;
  readonly interactions = new NotationInteractionRegistry();
  readonly #capabilities: WorkbenchCapabilityRegistry;
  readonly #plugins = new Map<string, InternalUiPluginModule>();
  readonly #componentOwners = new Map<string, string>();
  readonly #commandOwners = new Map<string, string>();
  readonly #interactionOwners = new Map<string, string>();
  readonly #notationOwners = new Map<string, string>();
  readonly #extensionOwners = new Map<string, string>();
  readonly #extensionPointOwners = new Map<string, Readonly<{ componentId: string; pluginId: string }>>();
  readonly #reportDiagnostic: ((diagnostic: UiPluginDiagnostic) => void) | undefined;

  constructor(capabilities: WorkbenchCapabilityRegistry, projections: UiProjectionRegistry,
    reportDiagnostic?: (diagnostic: UiPluginDiagnostic) => void) {
    this.#capabilities = capabilities;
    this.projections = projections;
    this.#reportDiagnostic = reportDiagnostic;
  }

  #failure(plugin: InternalUiPluginModule, code: UiPluginFailureCode, stage: UiPluginFailureStage,
    message: string, detail: string, subject?: UiPluginFailureSubject, cause?: unknown): UiPluginHostError {
    return new UiPluginHostError({ code, stage, plugin: uiPluginIdentity(plugin.manifest), message, detail,
      ...(subject ? { subject } : {}), ...(cause === undefined ? {} : { cause }) });
  }

  #resolveFailure(error: UiPluginHostError): void {
    if (!this.#reportDiagnostic) throw error;
    this.#reportDiagnostic(error.diagnostic);
  }

  install(plugin: InternalUiPluginModule): void {
    if (!isUiPluginManifest(plugin.manifest)) throw this.#failure(plugin, "UI-PLG-001", "manifest",
      "界面插件清单无效", "Invalid UI plugin manifest");
    if (this.#plugins.has(plugin.manifest.id)) throw this.#failure(plugin, "UI-PLG-002", "registration",
      "界面插件重复加载", `UI plugin already installed: ${plugin.manifest.id}`,
      { kind: "plugin", id: plugin.manifest.id, ownerPluginId: plugin.manifest.id });
    const missingCapabilities = this.#capabilities.missing(plugin.manifest.requires.capabilities);
    if (missingCapabilities.length > 0)
      throw this.#failure(plugin, "UI-PLG-003", "requirements", "插件需要的工作台能力不可用",
        `UI plugin ${plugin.manifest.id} requires unavailable capabilities: ${missingCapabilities.join(", ")}`,
        { kind: "capability", id: missingCapabilities.join(", ") });
    const missingProjections = plugin.manifest.requires.projections.filter((id) => !this.projections.has(id));
    if (missingProjections.length > 0)
      throw this.#failure(plugin, "UI-PLG-004", "requirements", "插件需要的数据投影不可用",
        `UI plugin ${plugin.manifest.id} requires unavailable projections: ${missingProjections.join(", ")}`,
        { kind: "projection", id: missingProjections.join(", ") });

    const projectionIds = plugin.projections.map((projection) => projection.id);
    const viewIds = plugin.views.map((view) => view.definition.id);
    const commandIds = plugin.commands.map((command) => command.id);
    const interactionIds = plugin.interactions.map((interaction) => interaction.id);
    const extensionIds = plugin.componentExtensions.map((extension) => extension.id);
    if (!sameIds(projectionIds, plugin.manifest.requires.projections))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件数据投影与清单不一致",
        `UI plugin ${plugin.manifest.id} projection binding does not match its manifest`);
    if (!sameIds(viewIds, plugin.manifest.contributes.views))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件视图与清单不一致",
        `UI plugin ${plugin.manifest.id} view binding does not match its manifest`);
    if (!sameIds(commandIds, plugin.manifest.contributes.commands))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件命令与清单不一致",
        `UI plugin ${plugin.manifest.id} command binding does not match its manifest`);
    if (!sameIds(interactionIds, plugin.manifest.contributes.interactions))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件交互规则与清单不一致",
        `UI plugin ${plugin.manifest.id} interaction binding does not match its manifest`);
    if (!sameIds(extensionIds, plugin.manifest.contributes.componentExtensions))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "组件扩展与清单不一致",
        `UI plugin ${plugin.manifest.id} component extension binding does not match its manifest`);
    if (new Set(viewIds).size !== viewIds.length || new Set(commandIds).size !== commandIds.length
      || new Set(interactionIds).size !== interactionIds.length
      || new Set(extensionIds).size !== extensionIds.length
      || new Set(plugin.interactions.map((interaction) => interaction.notationKind)).size !== plugin.interactions.length)
      throw this.#failure(plugin, "UI-PLG-006", "contributions", "插件包含重复贡献",
        `UI plugin ${plugin.manifest.id} contains duplicate contributions`);

    const declaredExtensionPoints = new Set<string>();
    for (const view of plugin.views) {
      const definition = view.definition;
      if (!isUiComponentDefinition(definition)) throw this.#failure(plugin, "UI-PLG-007", "contributions",
        "插件视图定义无效", `UI plugin ${plugin.manifest.id} contains an invalid view definition`);
      const componentOwner = this.#componentOwners.get(definition.id);
      if (componentOwner) throw this.#failure(plugin, "UI-PLG-008", "registration", "组件 ID 与其他插件冲突",
        `UI component already owned: ${definition.id}`,
        { kind: "component", id: definition.id, ownerPluginId: componentOwner });
      if (definition.permissions.projections.some((id) => !projectionIds.includes(id)))
        throw this.#failure(plugin, "UI-PLG-009", "permissions", "组件请求了插件未声明的数据投影",
          `UI component ${definition.id} requests an undeclared projection`, { kind: "component", id: definition.id });
      const undeclaredCommand = definition.permissions.commands.find((id) => !commandIds.includes(id));
      if (undeclaredCommand)
        throw this.#failure(plugin, "UI-PLG-009", "permissions", "组件请求了插件未声明的命令",
          `UI component ${definition.id} requests an undeclared command: ${undeclaredCommand}`,
          { kind: "command", id: undeclaredCommand });
      for (const extensionPoint of definition.extensionPoints ?? []) {
        const owner = this.#extensionPointOwners.get(extensionPoint);
        if (owner || declaredExtensionPoints.has(extensionPoint)) throw this.#failure(plugin, "UI-PLG-008", "registration", "组件扩展点与其他组件冲突",
          `UI component extension point already owned: ${extensionPoint}`,
          { kind: "extension-point", id: extensionPoint, ownerPluginId: owner?.pluginId ?? plugin.manifest.id });
        declaredExtensionPoints.add(extensionPoint);
      }
    }
    for (const commandId of commandIds) {
      const commandOwner = this.#commandOwners.get(commandId);
      if (commandOwner) throw this.#failure(plugin, "UI-PLG-010", "registration", "命令 ID 与其他插件冲突",
        `Workbench command already owned: ${commandId}`,
        { kind: "command", id: commandId, ownerPluginId: commandOwner });
    }
    for (const interaction of plugin.interactions) {
      const owner = this.#interactionOwners.get(interaction.id) ?? this.#notationOwners.get(interaction.notationKind);
      if (owner) throw this.#failure(plugin, "UI-PLG-008", "registration", "谱式交互规则与其他插件冲突",
        `Notation interaction already owned: ${interaction.id} (${interaction.notationKind})`,
        { kind: "interaction", id: interaction.id, ownerPluginId: owner });
    }
    const availableExtensionPoints = new Map(this.#extensionPointOwners);
    for (const view of plugin.views) for (const extensionPoint of view.definition.extensionPoints ?? []) {
      availableExtensionPoints.set(extensionPoint, { componentId: view.definition.id, pluginId: plugin.manifest.id });
    }
    for (const extension of plugin.componentExtensions) {
      if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(extension.id)
        || typeof extension.render !== "function" || (extension.order !== undefined && !Number.isFinite(extension.order)))
        throw this.#failure(plugin, "UI-PLG-007", "contributions", "组件扩展定义无效",
          `UI plugin ${plugin.manifest.id} contains an invalid component extension`,
          { kind: "component-extension", id: extension.id });
      const owner = this.#extensionOwners.get(extension.id);
      if (owner) throw this.#failure(plugin, "UI-PLG-008", "registration", "组件扩展 ID 与其他插件冲突",
        `UI component extension already owned: ${extension.id}`,
        { kind: "component-extension", id: extension.id, ownerPluginId: owner });
      if (!availableExtensionPoints.has(extension.extensionPoint))
        throw this.#failure(plugin, "UI-PLG-009", "permissions", "组件扩展点不存在",
          `UI component extension point is not installed: ${extension.extensionPoint}`,
          { kind: "extension-point", id: extension.extensionPoint });
    }

    for (const view of plugin.views) {
      this.components.register(view.definition);
      this.#componentOwners.set(view.definition.id, plugin.manifest.id);
      for (const extensionPoint of view.definition.extensionPoints ?? []) {
        this.#extensionPointOwners.set(extensionPoint, { componentId: view.definition.id, pluginId: plugin.manifest.id });
      }
    }
    for (const commandId of commandIds) this.#commandOwners.set(commandId, plugin.manifest.id);
    for (const interaction of plugin.interactions) {
      this.interactions.register(interaction);
      this.#interactionOwners.set(interaction.id, plugin.manifest.id);
      this.#notationOwners.set(interaction.notationKind, plugin.manifest.id);
    }
    for (const extension of plugin.componentExtensions) this.#extensionOwners.set(extension.id, plugin.manifest.id);
    this.#plugins.set(plugin.manifest.id, plugin);
  }

  list(): readonly UiPluginManifest[] { return [...this.#plugins.values()].map((plugin) => plugin.manifest); }

  ownerOf(componentId: string): UiPluginManifest | undefined {
    const owner = this.#componentOwners.get(componentId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  ownerOfCommand(commandId: string): UiPluginManifest | undefined {
    const owner = this.#commandOwners.get(commandId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  ownerOfInteraction(interactionId: string): UiPluginManifest | undefined {
    const owner = this.#interactionOwners.get(interactionId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  ownerOfComponentExtension(extensionId: string): UiPluginManifest | undefined {
    const owner = this.#extensionOwners.get(extensionId);
    return owner ? this.#plugins.get(owner)?.manifest : undefined;
  }

  #installed(snapshot: UiProjectionSnapshot, activatedPluginIds?: ReadonlySet<string>): readonly InstalledPlugin[] {
    return [...this.#plugins.values()]
      .filter((module) => module.manifest.activation === "always" || activatedPluginIds?.has(module.manifest.id))
      .map((module) => ({ module, projections: snapshot.scoped(module.projections) }));
  }

  resolveCommands(snapshot: UiProjectionSnapshot, activatedPluginIds?: ReadonlySet<string>): readonly WorkbenchCommand[] {
    const result: WorkbenchCommand[] = [];
    for (const plugin of this.#installed(snapshot, activatedPluginIds)) {
      for (const contribution of plugin.module.commands) {
        try {
          const command = contribution.create(plugin.projections);
          if (command.id !== contribution.id) throw this.#failure(plugin.module, "UI-PLG-011", "resolution",
            "插件命令在装配时改变了声明 ID", `UI command factory changed its declared ID: ${contribution.id}`,
            { kind: "command", id: contribution.id });
          result.push(command);
        } catch (error) {
          const failure = error instanceof UiPluginHostError ? error : this.#failure(plugin.module, "UI-PLG-012", "resolution",
            "插件命令装配失败", `UI command contribution failed: ${contribution.id}: ${error instanceof Error ? error.message : String(error)}`,
            { kind: "command", id: contribution.id }, error);
          this.#resolveFailure(failure);
        }
      }
    }
    return result;
  }

  resolveViews(snapshot: UiProjectionSnapshot,
    activatedPluginIds?: ReadonlySet<string>): ReadonlyMap<string, UiResolvedViewContribution> {
    const result = new Map<string, UiResolvedViewContribution>();
    const installed = this.#installed(snapshot, activatedPluginIds);
    const extensions = (extensionPoint: string): readonly UiResolvedComponentExtension[] => installed
      .flatMap((plugin) => plugin.module.componentExtensions
        .filter((extension) => extension.extensionPoint === extensionPoint)
        .map((extension) => ({ id: extension.id, order: extension.order ?? 0,
          render: () => extension.render(plugin.projections) })))
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    for (const plugin of installed) {
      for (const view of plugin.module.views) {
        const componentId = view.definition.id;
        if (result.has(componentId)) {
          this.#resolveFailure(this.#failure(plugin.module, "UI-PLG-008", "resolution", "组件视图发生运行时冲突",
            `Duplicate UI view contribution: ${componentId}`, { kind: "component", id: componentId }));
          continue;
        }
        result.set(componentId, { componentId, label: view.label, ...(view.icon === undefined ? {} : { icon: view.icon }),
          ...(view.inlineZone === undefined ? {} : { inlineZone: view.inlineZone }),
          render: () => view.render(plugin.projections, { extensions }) });
      }
    }
    return result;
  }
}
