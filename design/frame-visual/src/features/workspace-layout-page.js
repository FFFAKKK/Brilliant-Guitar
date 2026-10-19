import { h } from "../shell/dom.js";
import { createWorkspaceLayoutVisual } from "../shell/workspace-layout-visual.js";
import { WORKSPACE_COMMANDS as C } from "../contracts/workspace-layout.js";
import { createSidebarContentSettings } from "../shell/sidebar-content-settings.js";
import { createDisposalScope } from "../runtime/runtime-support.js";
import { actionState } from "../shell/action-presentation.js";
import { captureFrameFocus } from "../shell/frame-accessibility.js";

// The page consumes the existing read-only port and permitted commands.
// Its input nodes remain mounted while the display follows the host snapshot.
export function mountWorkspaceLayout(element, ctx, layout, contents, actions, viewPort) {
  let entered = null, wasEditing = false;
  const scope = createDisposalScope();
  ctx.onDispose?.(() => scope.dispose());
  const executeAction = (command, payload) => {
    const state = actionState(actions?.snapshot(), command);
    if (state?.enabled === false) {
      update(layout.snapshot());
      return { ok: false, code: state.reason };
    }
    return ctx.execute(command, payload);
  };
  const contentView = contents ? createSidebarContentSettings({
    execute(command, payload) {
      const panel = contents.snapshot().panels.find(item => item.id === payload.id);
      return panel?.available ? executeAction(command, payload) : { ok: false, code: "component.contents-unavailable" };
    }, notify: (text, level) => ctx.notify(text, level),
  }) : null;
  if (contentView) scope.add(() => contentView.dispose());
  const editLayout = (command, payload) => {
    if (layout.snapshot().adjusting) return executeAction(command, payload);
  };
  const view = createWorkspaceLayoutVisual({ state: { ...layout.snapshot(), editing: layout.snapshot().adjusting },
    begin: () => { if (!layout.snapshot().adjusting) executeAction(C.begin); },
    finish: confirm => editLayout(C.finish, { confirm }),
    region: side => executeAction(C.region, { region: side }),
    resize: (side, value) => executeAction(C.resize, { side, value }),
    arrange: mode => executeAction(C.arrange, { mode }),
    view: viewPort,
    zoom: value => executeAction(C.zoom, { value }),
    fit: () => executeAction(C.fit, { mode: "width" }),
    sections: contentView ? [contentView.element] : [],
    editGroups: contentView?.editGroups ?? [],
  });
  scope.add(() => view.dispose());
  element.append(h("div", { class: "v-page-content", "aria-label": "工作区布局内容" }, view.element));
  if (ctx.motion) view.attachMotion(({ targets }) => ctx.motion.bind(targets), {
    shapeTransition: true, selectionTransition: true, toggleTransition: true, editTransition: true,
    onIssue: error => ctx.notify(`布局动画失败，已恢复静态显示：${error?.message ?? String(error)}`, "error"),
  });
  function update(state) {
    const recoverFocus = captureFrameFocus(element);
    if (state.adjusting && !wasEditing) entered = state;
    if (!state.adjusting) entered = null;
    wasEditing = state.adjusting;
    const snapshot = contents?.snapshot();
    const actionSnapshot = actions?.snapshot();
    contentView?.update(snapshot, state.adjusting, actionSnapshot);
    view.update({ ...state, editing: state.adjusting }, entered, snapshot?.changes, actionSnapshot, viewPort?.snapshot());
    recoverFocus();
  }
  update(layout.snapshot());
  scope.add(layout.subscribe(update));
  if (contents) scope.add(contents.subscribe(() => update(layout.snapshot())));
  if (actions) scope.add(actions.subscribe(() => update(layout.snapshot())));
  if (viewPort) scope.add(viewPort.subscribe(() => update(layout.snapshot())));
  return { setVisible: visible => view.setVisible(visible), dispose: () => scope.dispose() };
}
