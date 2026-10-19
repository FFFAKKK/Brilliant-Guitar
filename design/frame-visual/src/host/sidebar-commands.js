import { createDisposalScope, isRecord, rollback } from "../runtime/runtime-support.js";
import { SIDEBAR_COMMANDS } from "../contracts/workspace-layout.js";
export { SIDEBAR_COMMANDS } from "../contracts/workspace-layout.js";

// Bind host methods on the one UI router. This is a module, not a plugin or bus.
export function bindSidebarCommands({ router, editSession }) {
  if (!editSession || !["canConfigure", "move", "setEnabled", "reorder"].every(key => typeof editSession[key] === "function")) {
    throw new TypeError("侧栏命令需要共享的布局编辑会话");
  }
  const bindings = [
    [SIDEBAR_COMMANDS.move, ["id", "slot", "index"], payload => editSession.move(payload.id, payload.slot, payload.index)],
    [SIDEBAR_COMMANDS.enabled, ["id", "enabled"], payload => editSession.setEnabled(payload.id, payload.enabled)],
    [SIDEBAR_COMMANDS.reorder, ["id", "index"], payload => editSession.reorder(payload.id, payload.index)],
  ];
  const scope = createDisposalScope();
  try {
    for (const [id, fields, handler] of bindings) scope.add(router.register("frame.sidebar", { id, enabled: editSession.canConfigure,
      run: payload => isRecord(payload) && Object.keys(payload).every(key => fields.includes(key))
        ? handler(payload) : { ok: false, code: "sidebar.invalid-payload" },
    }));
    return () => scope.dispose();
  } catch (error) { rollback(scope, error); }
}
