// One data view over permitted commands and their existing owners, with no execution or cache.
import { createDisposalScope, notifyObservers, rollback } from "../runtime/runtime-support.js";

export function createActionStateReadPort({ router, commands, context = {}, sources = [], onObserverError } = {}) {
  if (!router || !Array.isArray(commands) || commands.some(id => typeof id !== "string")
    || !Array.isArray(sources) || sources.some(source => typeof source?.subscribe !== "function")) throw new TypeError("动作状态需要命令名单和只读通知源");
  const ids = Object.freeze([...new Set(commands)]), shortcutContext = Object.freeze({ ...context });
  const readFlag = (command, key, fallback) => {
    const value = command[key] ? command[key]() : fallback;
    if (value?.then) { Promise.resolve(value).catch(() => {}); throw new TypeError("动作状态必须同步完成"); }
    return value;
  };
  function snapshot() {
    return Object.freeze({ actions: Object.freeze(ids.map(id => {
      const command = router.describe(id);
      if (!command) return Object.freeze({ id, exists: false, enabled: false, checked: null, keys: Object.freeze([]), reason: "command.missing" });
      try {
        const enabled = readFlag(command, "enabled"), checked = readFlag(command, "checked", null);
        if (typeof enabled !== "boolean" || (checked !== null && typeof checked !== "boolean")) throw new TypeError("动作状态必须同步返回布尔值");
        return Object.freeze({ id, exists: true, enabled, checked, keys: router.shortcuts.keysFor(id, shortcutContext),
          reason: enabled ? null : "command.disabled" });
      } catch {
        return Object.freeze({ id, exists: true, enabled: false, checked: null, keys: Object.freeze([]), reason: "command.state-error" });
      }
    })) });
  }
  return Object.freeze({ snapshot, subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("动作状态订阅者必须是函数");
    const scope = createDisposalScope();
    let active = true;
    const publish = () => { if (active) notifyObservers([() => listener(snapshot())], onObserverError); };
    try {
      scope.add(router.subscribe(publish));
      for (const source of sources) scope.add(source.subscribe(publish));
      return () => { active = false; scope.dispose(); };
    } catch (error) { active = false; rollback(scope, error); }
  } });
}
