// Internal UI module: one binding directory, with immutable defaults and in-memory key overrides.
// It chooses commands; it has no DOM, command handlers, layout state or platform lifecycle.
import { captureConfig, isRecord, notifyObservers } from "./runtime-support.js";
import { normalizeKeys, normalizeShortcut } from "./shortcut-keys.js";
const ID = /^[a-z][\w-]*(\.[a-z][\w-]*)*$/;
const SCOPES = ["global", "component", "score"];
const sameKeys = (a, b) => a.length === b.length && a.every((key, index) => key === b[index]);
const scopeKey = binding => binding.scope === "global" ? "global" : `component:${binding.componentId}`;

export function validateShortcut(binding) {
  if (!isRecord(binding)) return ["快捷键声明必须是对象"];
  const problems = Object.keys(binding).filter(key => !["id", "command", "keys", "scope", "componentId"].includes(key)).map(key => `快捷键不支持字段 ${key}`);
  if (typeof binding.id !== "string" || !ID.test(binding.id)) problems.push("快捷键 id 无效");
  if (typeof binding.command !== "string" || !ID.test(binding.command)) problems.push("快捷键 command 无效");
  const scope = binding.scope ?? "global";
  if (!SCOPES.includes(scope)) problems.push("快捷键 scope 无效");
  if (scope === "global" && binding.componentId !== undefined) problems.push("global 快捷键不能指定 componentId");
  if (scope !== "global" && (typeof binding.componentId !== "string" || !ID.test(binding.componentId))) problems.push("局部快捷键需要 componentId");
  try { normalizeKeys(binding.keys); } catch (error) { problems.push(error.message); }
  return problems;
}

export function captureShortcut(owner, raw) {
  const binding = captureConfig(raw, "shortcut");
  const problems = validateShortcut(binding);
  if (problems.length) throw new Error(`${binding?.id ?? "shortcut"}: ${problems.join("；")}`);
  return Object.freeze({ ...binding, owner, scope: binding.scope ?? "global", keys: normalizeKeys(binding.keys) });
}

// Legacy keys use a stable id without introducing another active key map.
export function declaredShortcuts(manifest) {
  return [
    ...(manifest.commands ?? []).filter(command => command.keys?.length).map(command => ({ id: command.id,
      command: command.id, keys: command.keys, scope: "global" })),
    ...(manifest.shortcuts ?? []),
  ];
}

function conflicts(entries, keysOf) {
  const ids = new Set(), slots = new Map(), problems = [];
  for (const entry of entries) {
    if (ids.has(entry.id)) problems.push(`快捷键 id ${entry.id} 已被注册或重复声明`);
    ids.add(entry.id);
    for (const key of keysOf(entry)) {
      const slot = `${scopeKey(entry)}|${key}`, previous = slots.get(slot);
      if (previous) problems.push(`快捷键 ${key} 已被 ${previous.command} (${previous.id}) 占用`);
      else slots.set(slot, entry);
    }
  }
  return problems;
}

export function createShortcutRouter({ onObserverError } = {}) {
  const bindings = new Map(), overrides = new Map(), listeners = new Set();
  const effective = entry => overrides.get(entry.id) ?? entry.keys;
  const describe = entry => entry ? Object.freeze({ ...entry, defaultKeys: entry.keys,
    keys: effective(entry), overridden: overrides.has(entry.id) }) : null;
  const list = () => Object.freeze([...bindings.values()].map(describe));
  const changed = () => notifyObservers(listeners, onObserverError);

  // This is a temporary validation view of active + pending declarations, not a second registry.
  function preflight(owner, rawBindings, pending = []) {
    try {
      const incoming = rawBindings.map(raw => captureShortcut(owner, raw));
      const entries = [...bindings.values(), ...pending.map(({ owner: pendingOwner, binding }) => captureShortcut(pendingOwner, binding)), ...incoming];
      return [...new Set([...conflicts(entries, entry => entry.keys),
        ...conflicts(entries, entry => bindings.get(entry.id) === entry ? effective(entry) : entry.keys)])];
    } catch (error) { return [error.message]; }
  }

  function register(owner, raw) {
    const entry = captureShortcut(owner, raw);
    const problems = preflight(owner, [raw]);
    if (problems.length) throw new Error(problems.join("；"));
    bindings.set(entry.id, entry); changed();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (bindings.get(entry.id) !== entry) return;
      bindings.delete(entry.id); overrides.delete(entry.id); changed();
    };
  }

  function setKeys(id, rawKeys) {
    const entry = bindings.get(id);
    if (!entry) return { ok: false, code: "shortcut.missing" };
    let keys;
    try { keys = normalizeKeys(rawKeys); }
    catch (error) { return { ok: false, code: "shortcut.invalid-keys", problems: Object.freeze([error.message]) }; }
    const problems = conflicts([...bindings.values()], binding => binding === entry ? keys : effective(binding));
    if (problems.length) return { ok: false, code: "shortcut.conflict", problems: Object.freeze(problems) };
    const overridden = !sameKeys(keys, entry.keys);
    if (sameKeys(keys, effective(entry)) && overrides.has(id) === overridden) return { ok: true, changed: false };
    if (overridden) overrides.set(id, keys); else overrides.delete(id);
    changed(); return { ok: true, changed: true };
  }

  const applies = (entry, context) => entry.scope === "global" || (entry.componentId === context.componentId
    && (context.owner === undefined || entry.owner === context.owner) && (entry.scope === "component" || context.score === true));
  function resolve(combo, context = {}, { localOnly = false } = {}) {
    let key;
    try { key = normalizeShortcut(combo); } catch { return null; }
    const eligible = [...bindings.values()].filter(entry => applies(entry, context) && effective(entry).includes(key));
    return describe(eligible.find(entry => entry.scope !== "global") ?? (localOnly ? null : eligible.find(entry => entry.scope === "global")));
  }

  return Object.freeze({
    register, preflight, setKeys,
    reset(id) { const entry = bindings.get(id); return entry ? setKeys(id, entry.keys) : { ok: false, code: "shortcut.missing" }; },
    describe: id => describe(bindings.get(id)), list, resolve,
    keysFor(command, context = {}) { return Object.freeze([...new Set([...bindings.values()]
      .filter(entry => entry.command === command && applies(entry, context)).flatMap(effective))]); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  });
}
