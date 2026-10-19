import { captureConfig, createDisposalScope, rollback } from "../runtime/runtime-support.js";
import { createActionStateReadPort } from "./action-state-read-port.js";
import { WORKSPACE_COMMANDS as C } from "./workspace-commands.js";

export const WORKSPACE_MENU_DEFINITIONS = captureConfig([
  ["file", "文件"], ["edit", "编辑"], ["view", "视图"], ["score", "谱面"],
  ["playback", "播放"], ["plugins", "插件"], ["help", "帮助"],
].map(([id, label]) => ({ id, label })));
const regionKeys = Object.freeze({ top: "topOpen", left: "leftOpen", right: "rightOpen", voice: "voiceOpen" });

// Trusted host wiring. Contributions are data; the one existing router owns execution.
export function createWorkspaceMenus({ router, registry, layout, layoutPageId, pluginPageId, notify } = {}) {
  const scope = createDisposalScope();
  let active = true;
  try {
    for (const [order, [region, label]] of [["top", "上侧栏"], ["left", "左侧栏"], ["right", "右侧栏"], ["voice", "下侧栏"]].entries()) {
      scope.add(registry.contribute("frame.workspace", { menu: "view", group: 0, order, label,
        command: C.region, payload: { region } }));
    }
    scope.add(registry.contribute("frame.workspace", { menu: "view", group: 1, order: 0, label: "工作区布局…",
      command: C.page, payload: { id: layoutPageId, toggle: false } }));
    if (pluginPageId) scope.add(registry.contribute("frame.workspace", { menu: "plugins", group: 0, order: 0, label: "插件状态…",
      command: C.page, payload: { id: pluginPageId, toggle: false } }));
    const registered = () => registry.resolve().flatMap(menu => menu.groups.flat());
    // Fixed-session command set, derived from actual menu contributions, not page permissions.
    const actions = createActionStateReadPort({ router, commands: registered().map(item => item.command), sources: [layout] });
    const contains = item => active && registered().includes(item);
    function state(item, snapshot = actions.snapshot()) {
      if (!contains(item)) return Object.freeze({ enabled: false, checked: null, keys: Object.freeze([]), reason: "menu.missing" });
      const command = snapshot.actions.find(action => action.id === item.command);
      if (!command) return Object.freeze({ enabled: false, checked: null, keys: Object.freeze([]), reason: "permission.denied" });
      const key = item.command === C.region && Object.hasOwn(regionKeys, item.payload?.region) ? regionKeys[item.payload.region] : null;
      // Current shortcuts supply no payload; a generic binding cannot identify one parameterized item.
      const keys = item.payload && Object.keys(item.payload).length ? Object.freeze([]) : command.keys;
      return Object.freeze({ ...command, keys, checked: key && command.exists ? layout.snapshot()[key] : command.checked });
    }
    return Object.freeze({
      definitions: WORKSPACE_MENU_DEFINITIONS,
      menus: Object.freeze({ resolve: () => registry.resolve(), subscribe: listener => registry.subscribe(listener) }),
      actions, state,
      execute(item) {
        if (!contains(item)) return { ok: false, code: "menu.missing" };
        const current = state(item);
        if (!current.enabled) return { ok: false, code: current.reason };
        return router.execute(item.command, item.payload);
      },
      notify: (text, level) => active ? notify?.(text, level) : null,
      dispose() { if (!active) return; active = false; scope.dispose(); },
    });
  } catch (error) { active = false; rollback(scope, error); }
}
