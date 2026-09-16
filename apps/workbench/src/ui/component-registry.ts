import type { UiComponentDefinition } from "./plugin-contract.ts";
import { isUiComponentDefinition } from "./plugin-contract.ts";

export class UiComponentRegistry {
  private readonly definitions = new Map<string, UiComponentDefinition>();

  register(definition: UiComponentDefinition): void {
    if (!isUiComponentDefinition(definition)) throw new Error("Invalid UI component definition");
    if (this.definitions.has(definition.id)) throw new Error(`UI component already registered: ${definition.id}`);
    this.definitions.set(definition.id, definition);
  }

  unregister(id: string): boolean {
    return this.definitions.delete(id);
  }

  get(id: string): UiComponentDefinition | undefined {
    return this.definitions.get(id);
  }

  list(): readonly UiComponentDefinition[] {
    return [...this.definitions.values()];
  }
}
