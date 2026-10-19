// One command id serves menus, shortcuts and buttons. The router knows nothing about layout or UI.
import { captureConfig, isRecord, notifyObservers } from "./runtime-support.js";
import { normalizeShortcut } from "./shortcut-keys.js";
import { createShortcutRouter, declaredShortcuts } from "./shortcut-router.js";
export { normalizeShortcut, comboOf } from "./shortcut-keys.js";

export function validateCommand(command) {
  if (!isRecord(command)) return ["命令必须是对象"];
  const problems = [];
  if (typeof command.id !== "string" || !/^[a-z][\w-]*(\.[a-z][\w-]*)*$/.test(command.id)) problems.push("命令 id 无效");
  if (typeof command.run !== "function") problems.push("缺少 run");
  if (command.enabled !== undefined && typeof command.enabled !== "function") problems.push("enabled 必须是函数");
  if (command.checked != null && typeof command.checked !== "function") problems.push("checked 必须是函数或 null");
  if (command.keys !== undefined && !Array.isArray(command.keys)) problems.push("keys 必须是数组");
  else {
    const seen = new Set();
    for (const combo of command.keys ?? []) {
      try {
        const key = normalizeShortcut(combo);
        if (seen.has(key)) problems.push(`快捷键 ${key} 重复`);
        seen.add(key);
      } catch (error) { problems.push(error.message); }
    }
  }
  return problems;
}

export function createCommandRouter({ onObserverError, shortcuts = createShortcutRouter({ onObserverError }) } = {}) {
  const commands = new Map();
  const listeners = new Set();
  const changed = () => notifyObservers(listeners, onObserverError);
  shortcuts.subscribe(changed);

  function register(owner, raw) {
    const command = captureConfig(raw, "command");
    const problems = validateCommand(command);
    if (problems.length) throw new Error(`${command?.id ?? "command"}: ${problems.join("；")}`);
    if (commands.has(command.id)) throw new Error(`command ${command.id} already owned by ${commands.get(command.id).owner}`);
    const entry = Object.freeze({ ...command, owner, enabled: command.enabled ?? (() => true), checked: command.checked ?? null, keys: command.keys ?? Object.freeze([]) });
    const legacy = declaredShortcuts({ commands: [entry] });
    const bindingProblems = shortcuts.preflight(owner, legacy);
    if (bindingProblems.length) throw new Error(`shortcut already bound: ${bindingProblems.join("；")}`);
    // Publish the handler before a binding observer can execute it. Preflight is atomic.
    commands.set(entry.id, entry);
    let releaseKeys;
    try { releaseKeys = legacy.length ? shortcuts.register(owner, legacy[0]) : null; }
    catch (error) { commands.delete(entry.id); throw error; }
    if (!releaseKeys) changed();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (commands.get(entry.id) !== entry) return;
      commands.delete(entry.id);
      if (releaseKeys) releaseKeys(); else changed();
    };
  }

  function execute(id, payload = {}) {
    const command = commands.get(id);
    if (!command) return { ok: false, code: "command.missing" };
    if (!command.enabled()) return { ok: false, code: "command.disabled" };
    return command.run(payload) ?? { ok: true };
  }

  return {
    register,
    execute,
    shortcuts,
    describe: (id) => commands.get(id) ?? null,
    commandFor: combo => shortcuts.resolve(combo)?.command ?? null,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    refresh: changed,
  };
}
