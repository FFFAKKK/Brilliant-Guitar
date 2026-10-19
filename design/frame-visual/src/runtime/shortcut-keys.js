// Shared key syntax; the command module re-exports these names for old callers.
const MODIFIERS = ["Mod", "Alt", "Shift"];
const rank = part => MODIFIERS.includes(part) ? MODIFIERS.indexOf(part) : 9;

export function normalizeShortcut(combo) {
  if (typeof combo !== "string") throw new TypeError("快捷键必须是字符串");
  const parts = combo.split("+").map(part => part.trim()).map(part => part.length === 1 ? part.toUpperCase() : part);
  if (parts.some(part => !part) || new Set(parts).size !== parts.length || parts.filter(part => !MODIFIERS.includes(part)).length !== 1) {
    throw new Error(`无效快捷键 ${combo}`);
  }
  return parts.sort((a, b) => rank(a) - rank(b)).join("+");
}

export function normalizeKeys(keys) {
  if (!Array.isArray(keys)) throw new TypeError("keys 必须是数组");
  const normalized = keys.map(normalizeShortcut);
  if (new Set(normalized).size !== normalized.length) throw new Error("快捷键重复");
  return Object.freeze(normalized);
}

export function comboOf(event, isMac = false) {
  const parts = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!["Control", "Meta", "Alt", "Shift"].includes(key)) parts.push(key);
  try { return normalizeShortcut(parts.join("+")); } catch { return ""; }
}
