import { createLayoutEditSession } from "../layout/layout-edit-session.js";
import { createDisposalScope, rollback } from "../runtime/runtime-support.js";
import { WORKSPACE_COMMANDS } from "../contracts/workspace-layout.js";
export { WORKSPACE_COMMANDS } from "../contracts/workspace-layout.js";

// These are handlers on the existing router, not another command bus.
// Document commands may call an application service / CorePort once from their own handler.
export function bindWorkspaceCommands({ router, store, stage, sidebar, editSession }) {
  const edit = editSession ?? createLayoutEditSession({ workspace: store });
  const C = WORKSPACE_COMMANDS;
  const invalid = () => ({ ok: false, code: "workspace.invalid-payload" });
  function select(payload) {
    const model = sidebar?.snapshot();
    if (model && !model.right.some(item => item.id === payload.id)) return invalid();
    return store.selectPage(payload.id, payload.toggle === undefined ? true : payload.toggle, model?.activeRight?.id);
  }
  function step(payload) {
    if (!sidebar) return store.stepPage(payload.delta);
    if (payload.delta !== -1 && payload.delta !== 1) return invalid();
    const model = sidebar.snapshot();
    if (!model.activeRight) return invalid();
    const index = model.right.findIndex(item => item.id === model.activeRight.id);
    const next = Math.max(0, Math.min(model.right.length - 1, index + payload.delta));
    return store.navigatePage(model.right[next].id);
  }
  const bindings = [
    [C.region, payload => store.toggleRegion(payload?.region)],
    [C.configureRegion, payload => Object.keys(payload).every(key => ["region", "open"].includes(key))
      ? edit.configureRegion(payload.region, payload.open) : invalid()],
    [C.resize, payload => edit.resize(payload?.side, payload?.value)],
    [C.arrange, payload => edit.arrange(payload?.mode)],
    [C.page, select],
    [C.step, step],
    [C.begin, () => edit.begin()],
    [C.finish, payload => edit.finish(payload?.confirm)],
    [C.zoom, payload => stage.zoom(payload?.value)],
    [C.zoomBy, payload => stage.zoomBy(payload?.delta)],
    [C.fit, payload => Object.keys(payload).every(key => key === "mode")
      && (payload.mode === undefined || payload.mode === "width" || payload.mode === "page")
      ? stage.fit(payload.mode) : invalid()],
  ];
  const scope = createDisposalScope();
  if (!editSession) scope.add(() => edit.dispose());
  try {
    for (const [id, handler, enabled] of bindings) scope.add(router.register("frame.workspace", { id, ...(enabled ? { enabled } : {}),
      run: payload => payload && typeof payload === "object" && !Array.isArray(payload)
        ? handler(payload) : { ok: false, code: "workspace.invalid-payload" },
    }));
    return () => scope.dispose();
  } catch (error) { rollback(scope, error); }
}
