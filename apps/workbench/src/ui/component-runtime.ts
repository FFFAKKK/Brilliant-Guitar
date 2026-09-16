import type { UiComponentContext, UiComponentDefinition, UiComponentInstance } from "./plugin-contract";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import { createScopedUiComponentContext } from "./scoped-component-context.ts";

/** Owns plugin instance lifecycle without prescribing DOM structure or styling. */
export class UiComponentRuntime {
  private readonly instances = new Map<string, { definition: UiComponentDefinition; instance: UiComponentInstance }>();
  readonly #onIssue: ((issue: WorkbenchIssue) => void) | undefined;

  constructor(onIssue?: (issue: WorkbenchIssue) => void) { this.#onIssue = onIssue; }

  #lifecycleIssue(definition: UiComponentDefinition, phase: "mount" | "update" | "dispose"): WorkbenchIssue {
    return { code: `component.${phase}-failed`, message: `组件 ${definition.id} 在 ${phase} 阶段失败`, severity: "error", source: "host",
      target: { scope: "component", componentId: definition.id }, retryable: phase !== "dispose" };
  }

  mount(definition: UiComponentDefinition, context: UiComponentContext): UiComponentInstance {
    if (this.instances.has(definition.id)) throw new Error(`UI component is already mounted: ${definition.id}`);
    let instance: UiComponentInstance;
    try { instance = definition.mount(createScopedUiComponentContext(definition, context, this.#onIssue)); }
    catch { this.#onIssue?.(this.#lifecycleIssue(definition, "mount")); instance = { update() {}, dispose() {} }; }
    this.instances.set(definition.id, { definition, instance });
    return instance;
  }

  update(componentId: string, context: UiComponentContext): boolean {
    const mounted = this.instances.get(componentId);
    if (!mounted) return false;
    try { mounted.instance.update(createScopedUiComponentContext(mounted.definition, context, this.#onIssue)); return true; }
    catch { this.#onIssue?.(this.#lifecycleIssue(mounted.definition, "update")); return false; }
  }

  unmount(componentId: string): boolean {
    const mounted = this.instances.get(componentId);
    if (!mounted) return false;
    this.instances.delete(componentId);
    try { mounted.instance.dispose(); } catch { this.#onIssue?.(this.#lifecycleIssue(mounted.definition, "dispose")); }
    return true;
  }

  has(componentId: string): boolean {
    return this.instances.has(componentId);
  }

  dispose(): void {
    for (const mounted of this.instances.values()) {
      try { mounted.instance.dispose(); } catch { this.#onIssue?.(this.#lifecycleIssue(mounted.definition, "dispose")); }
    }
    this.instances.clear();
  }
}
