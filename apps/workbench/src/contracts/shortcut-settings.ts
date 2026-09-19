const COMMAND_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9-]+)*$/;
const NAMED_KEYS = new Set([
  "Space", "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert",
  "Home", "End", "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Plus", "Minus", "Comma", "Period", "Slash", "Backslash", "Semicolon", "Quote",
  "BracketLeft", "BracketRight", "Backquote",
]);

export interface ShortcutSettingsV1 {
  readonly profileName: string;
  /** Missing commands use their contribution's official binding; null explicitly removes a binding. */
  readonly bindings: Readonly<Record<string, string | null>>;
}

export interface ShortcutTemplateV1 {
  readonly kind: "brilliant-guitar-shortcut-template";
  readonly schemaVersion: 1;
  readonly name: string;
  readonly bindings: Readonly<Record<string, string | null>>;
}

export const OFFICIAL_SHORTCUT_PROFILE_NAME = "官方默认";
export const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettingsV1 = {
  profileName: OFFICIAL_SHORTCUT_PROFILE_NAME,
  bindings: {},
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

export function isShortcutCommandId(value: string): boolean {
  return value.length <= 160 && COMMAND_ID_PATTERN.test(value);
}

export function isNormalizedShortcut(value: string): boolean {
  if (value.length === 0 || value.length > 64 || value.trim() !== value) return false;
  const parts = value.split("+");
  if (parts.some((part) => part.length === 0)) return false;
  const key = parts.at(-1);
  if (!key) return false;
  const modifiers = parts.slice(0, -1);
  const ordered = ["Mod", "Alt", "Shift"].filter((modifier) => modifiers.includes(modifier));
  if (ordered.length !== modifiers.length || ordered.some((modifier, index) => modifier !== modifiers[index])) return false;
  return NAMED_KEYS.has(key) || /^[A-Z0-9]$/.test(key)
    || (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key));
}

/** Describes bindings that deliberately take precedence over the staff's direct-entry grammar. */
export function notationInputShortcutConflict(shortcut: string): string | null {
  if (!isNormalizedShortcut(shortcut)) return null;
  const parts = shortcut.split("+");
  const key = parts.at(-1) ?? "";
  const modifiers = parts.slice(0, -1);
  if (modifiers.includes("Mod") || modifiers.includes("Alt")) return null;
  if (/^[A-G]$/.test(key) && modifiers.every((modifier) => modifier === "Shift")) {
    return "会占用五线谱音名输入";
  }
  if (key === "R" && modifiers.every((modifier) => modifier === "Shift")) {
    return "会占用五线谱休止符输入";
  }
  if (/^[2-6]$/.test(key) && modifiers.length === 0) return "会占用五线谱组号输入";
  return null;
}

function normalizedBindings(value: unknown): Readonly<Record<string, string | null>> | null {
  const bindings = record(value);
  if (bindings === null || Object.keys(bindings).length > 512) return null;
  const result: Record<string, string | null> = {};
  const assigned = new Set<string>();
  for (const [commandId, shortcut] of Object.entries(bindings)) {
    if (!isShortcutCommandId(commandId) || (shortcut !== null
      && (typeof shortcut !== "string" || !isNormalizedShortcut(shortcut) || assigned.has(shortcut)))) return null;
    result[commandId] = shortcut;
    if (shortcut !== null) assigned.add(shortcut);
  }
  return result;
}

function validProfileName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80
    && value.trim() === value && !/\p{Cc}/u.test(value);
}

export function normalizeShortcutSettings(value: unknown): ShortcutSettingsV1 | null {
  const settings = record(value);
  const bindings = normalizedBindings(settings?.bindings);
  if (settings === null || !onlyKeys(settings, ["profileName", "bindings"])
    || !validProfileName(settings.profileName) || bindings === null) return null;
  return { profileName: settings.profileName, bindings };
}

export function isShortcutSettingsV1(value: unknown): value is ShortcutSettingsV1 {
  return normalizeShortcutSettings(value) !== null;
}

export function parseShortcutTemplate(value: unknown): ShortcutTemplateV1 | null {
  const template = record(value);
  const bindings = normalizedBindings(template?.bindings);
  if (template === null || !onlyKeys(template, ["kind", "schemaVersion", "name", "bindings"])
    || template.kind !== "brilliant-guitar-shortcut-template" || template.schemaVersion !== 1
    || !validProfileName(template.name) || bindings === null) return null;
  return { kind: template.kind, schemaVersion: 1, name: template.name, bindings };
}

export function createShortcutTemplate(name: string,
  bindings: Readonly<Record<string, string | null>>): ShortcutTemplateV1 {
  const template = parseShortcutTemplate({
    kind: "brilliant-guitar-shortcut-template",
    schemaVersion: 1,
    name,
    bindings,
  });
  if (!template) throw new Error("快捷键模板格式无效");
  return template;
}
