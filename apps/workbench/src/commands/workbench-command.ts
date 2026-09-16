import type { KeyboardEvent } from "react";

export type WorkbenchCommandScope = "global" | "score";

export interface WorkbenchCommand {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly shortcutLabel?: string;
  readonly scope: WorkbenchCommandScope;
  readonly enabled: boolean;
  readonly run: () => void | Promise<void>;
}

export function normalizedShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key === "+" || key === "=" ? "Plus" : key === "-" || key === "_" ? "Minus" : key);
  return parts.join("+");
}

export class WorkbenchCommandRouter {
  readonly #commands: Map<string, WorkbenchCommand>;

  constructor(commands: readonly WorkbenchCommand[] = []) {
    this.#commands = new Map();
    for (const command of commands) this.register(command);
  }

  register(command: WorkbenchCommand): () => void {
    if (this.#commands.has(command.id)) throw new Error(`Duplicate workbench command: ${command.id}`);
    this.#commands.set(command.id, command);
    return () => { if (this.#commands.get(command.id) === command) this.#commands.delete(command.id); };
  }

  get(id: string): WorkbenchCommand | undefined { return this.#commands.get(id); }

  list(scope?: WorkbenchCommandScope): readonly WorkbenchCommand[] {
    return [...this.#commands.values()].filter((command) => !scope || command.scope === "global" || command.scope === scope);
  }

  execute(id: string): boolean {
    const command = this.#commands.get(id);
    if (!command?.enabled) return false;
    void command.run();
    return true;
  }

  handle(event: KeyboardEvent, scope: WorkbenchCommandScope): boolean {
    if (event.nativeEvent.isComposing || event.repeat) return false;
    const shortcut = normalizedShortcut(event);
    const command = [...this.#commands.values()].find((item) => item.enabled && item.shortcut === shortcut
      && (item.scope === "global" || item.scope === scope));
    if (!command) return false;
    event.preventDefault(); event.stopPropagation(); void command.run();
    return true;
  }
}
