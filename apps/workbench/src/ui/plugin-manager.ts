import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import { UiComponentRegistry } from "./component-registry.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";
import type { UiPluginManifest } from "./plugin-manifest.ts";
import { isUiPluginManifest, WorkbenchCapabilityRegistry } from "./plugin-manifest.ts";
import type { AnyUiProjection, UiProjectionReader, UiProjectionSnapshot } from "./projection-registry.ts";
import { UiProjectionRegistry } from "./projection-registry.ts";
import type { UiComponentViewContribution, UiResolvedViewContribution } from "./view-contribution.ts";
import { UiPluginHostError, uiPluginIdentity } from "./plugin-diagnostic.ts";
import type { UiPluginDiagnostic, UiPluginFailureCode, UiPluginFailureStage, UiPluginFailureSubject } from "./plugin-diagnostic.ts";

export interface UiCommandContribution {
  readonly id: string;
  create(projections: UiProjectionReader): WorkbenchCommand;
}

export interface InternalUiPluginModule {
  readonly manifest: UiPluginManifest;
  readonly projections: readonly AnyUiProjection[];
  readonly commands: readonly UiCommandContribution[];
  readonly views: readonly UiComponentViewContribution[];
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
  readonly #capabilities: WorkbenchCapabilityRegistry;
  readonly #plugins = new Map<string, InternalUiPluginModule>();
  readonly #componentOwners = new Map<string, string>();
  readonly #commandOwners = new Map<string, string>();
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
    if (!sameIds(projectionIds, plugin.manifest.requires.projections))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件数据投影与清单不一致",
        `UI plugin ${plugin.manifest.id} projection binding does not match its manifest`);
    if (!sameIds(viewIds, plugin.manifest.contributes.views))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件视图与清单不一致",
        `UI plugin ${plugin.manifest.id} view binding does not match its manifest`);
    if (!sameIds(commandIds, plugin.manifest.contributes.commands))
      throw this.#failure(plugin, "UI-PLG-005", "contributions", "插件命令与清单不一致",
        `UI plugin ${plugin.manifest.id} command binding does not match its manifest`);
    if (new Set(viewIds).size !== viewIds.length || new Set(commandIds).size !== commandIds.length)
      throw this.#failure(plugin, "UI-PLG-006", "contributions", "插件包含重复贡献",
        `UI plugin ${plugin.manifest.id} contains duplicate contributions`);

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
    }
    for (const commandId of commandIds) {
      const commandOwner = this.#commandOwners.get(commandId);
      if (commandOwner) throw this.#failure(plugin, "UI-PLG-010", "registration", "命令 ID 与其他插件冲突",
        `Workbench command already owned: ${commandId}`,
        { kind: "command", id: commandId, ownerPluginId: commandOwner });
    }

    for (const view of plugin.views) {
      this.components.register(view.definition);
      this.#componentOwners.set(view.definition.id, plugin.manifest.id);
    }
    for (const commandId of commandIds) this.#commandOwners.set(commandId, plugin.manifest.id);
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

  #installed(snapshot: UiProjectionSnapshot): readonly InstalledPlugin[] {
    return [...this.#plugins.values()].map((module) => ({ module, projections: snapshot.scoped(module.projections) }));
  }

  resolveCommands(snapshot: UiProjectionSnapshot): readonly WorkbenchCommand[] {
    const result: WorkbenchCommand[] = [];
    for (const plugin of this.#installed(snapshot)) {
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

  resolveViews(snapshot: UiProjectionSnapshot): ReadonlyMap<string, UiResolvedViewContribution> {
    const result = new Map<string, UiResolvedViewContribution>();
    for (const plugin of this.#installed(snapshot)) {
      for (const view of plugin.module.views) {
        const componentId = view.definition.id;
        if (result.has(componentId)) {
          this.#resolveFailure(this.#failure(plugin.module, "UI-PLG-008", "resolution", "组件视图发生运行时冲突",
            `Duplicate UI view contribution: ${componentId}`, { kind: "component", id: componentId }));
          continue;
        }
        result.set(componentId, { componentId, label: view.label, ...(view.icon === undefined ? {} : { icon: view.icon }),
          ...(view.inlineZone === undefined ? {} : { inlineZone: view.inlineZone }), render: () => view.render(plugin.projections) });
      }
    }
    return result;
  }
}
