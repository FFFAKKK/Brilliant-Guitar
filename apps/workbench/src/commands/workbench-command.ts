import type { KeyboardEvent } from "react";
import { isNormalizedShortcut } from "../contracts/shortcut-settings.ts";

export type WorkbenchCommandScope = "global" | "score";

export interface WorkbenchCommand {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly shortcutLabel?: string;
  /** Original contribution binding retained while a user override is active. */
  readonly defaultShortcut?: string;
  readonly defaultShortcutLabel?: string;
  readonly scope: WorkbenchCommandScope;
  readonly enabled: boolean;
  readonly run: () => void | Promise<void>;
}

export function normalizedShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const aliases: Readonly<Record<string, string>> = {
    " ": "Space", "+": "Plus", "=": "Plus", "-": "Minus", "_": "Minus", ",": "Comma", ".": "Period",
    "/": "Slash", "\\": "Backslash", ";": "Semicolon", "'": "Quote", "[": "BracketLeft", "]": "BracketRight", "`": "Backquote",
  };
  const key = aliases[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  parts.push(key);
  return parts.join("+");
}

export function shortcutLabel(shortcut: string): string {
  const labels: Readonly<Record<string, string>> = {
    Mod: "Ctrl/⌘", Alt: "Alt", Shift: "Shift", Space: "Space", Plus: "＋", Minus: "−",
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Backspace: "Backspace",
    Delete: "Delete", Enter: "Enter", Escape: "Esc", Tab: "Tab", PageUp: "Page Up", PageDown: "Page Down",
    BracketLeft: "[", BracketRight: "]", Backquote: "`", Comma: ",", Period: ".", Slash: "/",
    Backslash: "\\", Semicolon: ";", Quote: "'",
  };
  return shortcut.split("+").map((part) => labels[part] ?? part).join(" + ");
}

export function applyShortcutBindings(commands: readonly WorkbenchCommand[],
  bindings: Readonly<Record<string, string | null>>): readonly WorkbenchCommand[] {
  return commands.map((command) => {
    const defaultShortcut = command.defaultShortcut ?? command.shortcut;
    const defaultShortcutLabel = command.defaultShortcutLabel ?? command.shortcutLabel;
    if (!Object.prototype.hasOwnProperty.call(bindings, command.id)) return {
      ...command,
      ...(defaultShortcut ? { defaultShortcut } : {}),
      ...(defaultShortcutLabel ? { defaultShortcutLabel } : {}),
    };
    const configured = bindings[command.id];
    const { shortcut: _shortcut, shortcutLabel: _shortcutLabel, ...base } = command;
    if (configured === null) return {
      ...base,
      ...(defaultShortcut ? { defaultShortcut } : {}),
      ...(defaultShortcutLabel ? { defaultShortcutLabel } : {}),
    };
    if (!configured || !isNormalizedShortcut(configured)) return command;
    return {
      ...base,
      shortcut: configured,
      shortcutLabel: shortcutLabel(configured),
      ...(defaultShortcut ? { defaultShortcut } : {}),
      ...(defaultShortcutLabel ? { defaultShortcutLabel } : {}),
    };
  });
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
