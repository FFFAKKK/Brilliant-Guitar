import { h } from "./dom.js";
import { graphic, visualButton } from "./visual-controls.js";
import { actionReason, applyActionPresentation } from "./action-presentation.js";
import { openPopover, closePopover, popoverAnchor } from "./popover.js";
import { revealFrameFocus } from "./frame-accessibility.js";
import { captureFocusRecovery, isPlainKey, isReservedKey } from "../host/focus-boundary.js";
import { createDisposalScope, rollback } from "../runtime/runtime-support.js";

// Current visual shell's menu consumer. It receives data and a narrowed execute port, never a router.
export function createCommandMenuBar(binding, { fallbackFocus, pointerPresentation } = {}) {
  const scope = createDisposalScope(), triggers = new Map();
  let opened = null, disposed = false, tabStop = null;
  const root = h("nav", { class: "v-menus", role: "menubar", "aria-label": "应用菜单" });
  const availableTriggers = () => [...triggers.values()].filter(node => !node.disabled);
  const resolved = id => binding.menus.resolve().find(menu => menu.id === id);
  function syncTabStops() {
    if (!triggers.get(tabStop) || triggers.get(tabStop).disabled) tabStop = availableTriggers()[0]?.dataset.menu ?? null;
    for (const [id, node] of triggers) node.tabIndex = id === tabStop ? 0 : -1;
  }
  function focusTrigger(node) {
    if (triggers.get(node?.dataset.menu) === node) { tabStop = node.dataset.menu; syncTabStops(); }
    node?.focus({ preventScroll: true });
  }
  function close({ restoreFocus = true } = {}) {
    const previous = opened;
    if (!previous) return;
    if (popoverAnchor() === previous.trigger) closePopover({ restoreFocus: false });
    if (restoreFocus && !disposed) {
      const target = !previous.trigger.disabled && previous.trigger.isConnected !== false ? previous.trigger : availableTriggers()[0] ?? fallbackFocus?.();
      focusTrigger(target);
    }
  }
  function report(session, text) {
    if (disposed) return;
    if (opened === session) { session.feedback.hidden = false; session.feedback.textContent = text; }
    try { binding.notify?.(text, "error"); } catch { /* menu feedback survives a notice failure */ }
  }
  function fail(session, result) {
    const code = result?.code;
    report(session, ["permission.denied", "command.missing", "command.disabled", "command.state-error", "menu.missing"].includes(code)
      ? actionReason({ reason: code }) : "操作失败，请重试。");
  }
  function activate(session, item) {
    if (disposed || opened !== session || session.pending) return;
    const state = binding.state(item);
    if (!state.enabled) { syncOpened(); fail(session, { code: state.reason }); return; }
    session.feedback.hidden = true; session.feedback.textContent = "";
    session.pending = item; syncOpened();
    const finish = result => {
      session.pending = null;
      if (disposed) return;
      if (result?.ok) { if (opened === session) close(); }
      else {
        if (opened === session) {
          const resume = root.ownerDocument.activeElement === session.list;
          syncOpened();
          const row = session.rows.get(item)?.node;
          if (resume) focusMenuNode(session, row);
        }
        fail(session, result);
      }
    };
    try {
      const result = binding.execute(item);
      if (result?.then) Promise.resolve(result).then(finish, () => finish({ ok: false }));
      else finish(result);
    } catch { finish({ ok: false }); }
  }
  function enabledRows(session = opened) { return session ? session.order.map(item => session.rows.get(item).node).filter(node => !node.disabled) : []; }
  function focusMenuNode(session, node) {
    if (disposed || opened !== session || !node || node.disabled || !session.panel?.contains(node)) return;
    node.focus({ preventScroll: true });
    revealFrameFocus(node);
  }
  function focusRow(last = false) {
    const nodes = enabledRows();
    focusMenuNode(opened, (last ? nodes.at(-1) : nodes[0]) ?? opened?.list);
  }
  function syncOpened() {
    const session = opened;
    if (!session) return;
    const menu = resolved(session.id);
    if (!menu) { close(); return; }
    const snapshot = binding.actions.snapshot(), currentItems = menu.groups.flat();
    session.list.setAttribute("aria-busy", String(!!session.pending));
    const previouslyFocused = root.ownerDocument.activeElement, orderBefore = session.order;
    const oldIndex = orderBefore.findIndex(item => session.rows.get(item).node === previouslyFocused);
    session.order = currentItems;
    for (const [item, row] of session.rows) if (!currentItems.includes(item)) { row.node.remove(); session.rows.delete(item); }
    const children = [];
    menu.groups.forEach((group, index) => {
      if (index) {
        if (!session.rules[index]) session.rules[index] = h("div", { class: "v-menu-rule", role: "separator" });
        children.push(session.rules[index]);
      }
      for (const item of group) {
        if (!session.rows.has(item)) {
          const label = h("span", { class: "v-menu-label" }), key = h("kbd", { class: "v-menu-key" });
          const pending = graphic("more", 14); pending.classList.add("v-menu-pending"); pending.hidden = true;
          const node = h("button", { type: "button", class: "v-menu-item", tabindex: -1, "data-command": item.command,
            onclick: event => pointerPresentation ? pointerPresentation.run(event, () => activate(session, item)) : activate(session, item) }, h("span", { class: "v-menu-check", "aria-hidden": "true" }, pending), label, key);
          session.rows.set(item, { node, label, key, pending });
        }
        const row = session.rows.get(item), state = binding.state(item, snapshot);
        row.label.textContent = item.label ?? "未命名操作";
        const pending = session.pending === item;
        row.node.setAttribute("aria-busy", String(pending)); row.pending.hidden = !pending;
        applyActionPresentation(row.node, { actions: [{ ...state, id: item.command }] }, item.command,
          { disabled: !!session.pending, hint: pending ? "正在处理…" : row.label.textContent, checkedAttribute: "aria-checked" });
        row.node.setAttribute("role", state.checked === null ? "menuitem" : "menuitemcheckbox");
        const isMac = globalThis.navigator?.platform?.includes("Mac") ?? false;
        row.key.textContent = state.keys[0]?.replace(/^Mod(?=\+)/, isMac ? "⌘" : "Ctrl") ?? "";
        children.push(row.node);
      }
    });
    for (const node of [...session.list.children]) if (!children.includes(node)) node.remove();
    for (const [index, node] of children.entries()) if (session.list.children[index] !== node) session.list.insertBefore(node, session.list.children[index] ?? null);
    const rows = session.order.map(item => session.rows.get(item).node);
    if (oldIndex >= 0 && (!rows.includes(previouslyFocused) || previouslyFocused.disabled)) {
      const enabled = enabledRows(session);
      focusMenuNode(session, enabled.find(node => rows.indexOf(node) >= oldIndex) ?? enabled.at(-1) ?? session.list);
    }
  }
  function open(id, { last = false } = {}) {
    if (disposed) return;
    const trigger = triggers.get(id);
    if (!trigger || trigger.disabled || !resolved(id)) return;
    tabStop = id; syncTabStops();
    if (opened?.id === id) { close(); return; }
    close({ restoreFocus: false });
    const resources = createDisposalScope();
    const list = h("div", { class: "v-menu-list", role: "menu", tabindex: -1, "aria-label": trigger.textContent });
    const feedback = h("p", { class: "v-menu-feedback", role: "status", "aria-live": "polite", hidden: true });
    const content = h("div", { class: "v-menu-content" }, list, feedback);
    const session = { id, trigger, list, feedback, rows: new Map(), rules: [], order: [], pending: null, resources };
    opened = session;
    try {
      const panel = openPopover(trigger, content, { label: trigger.textContent, role: "presentation", className: "popover v-menu-popup", constrainToViewport: true,
        onClose() { if (opened === session) opened = null; resources.dispose(); } });
      session.panel = panel;
      panel.id = "frame-read-command-menu";
      panel.dataset.frameReading = panel.id;
      const keydown = event => {
        if (isReservedKey(event) || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Tab") { close(); return; }
        if (!isPlainKey(event)) return;
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); const nodes = enabledRows(session), at = nodes.indexOf(root.ownerDocument.activeElement);
          const index = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1
            : at < 0 ? event.key === "ArrowDown" ? 0 : nodes.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length;
          focusMenuNode(session, nodes[index] ?? list);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault(); const nodes = availableTriggers(), at = nodes.indexOf(trigger), next = nodes[(at + (event.key === "ArrowRight" ? 1 : -1) + nodes.length) % nodes.length];
          if (next && next !== trigger) open(next.dataset.menu);
        } else if (["Enter", " "].includes(event.key)) {
          const item = [...session.rows].find(([, row]) => row.node === root.ownerDocument.activeElement)?.[0];
          if (item) { event.preventDefault(); activate(session, item); }
        }
      };
      panel.addEventListener("keydown", keydown); resources.add(() => panel.removeEventListener("keydown", keydown));
      const focusout = event => { if (event.relatedTarget && !panel.contains(event.relatedTarget)) close({ restoreFocus: false }); };
      panel.addEventListener("focusout", focusout); resources.add(() => panel.removeEventListener("focusout", focusout));
      const resize = () => close(); window.addEventListener("resize", resize); resources.add(() => window.removeEventListener("resize", resize));
      syncOpened();
      resources.add(binding.actions.subscribe(syncOpened));
      focusRow(last);
    } catch (error) {
      if (popoverAnchor() === trigger) closePopover({ restoreFocus: false }); else { if (opened === session) opened = null; resources.dispose(); }
      try { trigger.focus({ preventScroll: true }); binding.notify?.("菜单暂时无法打开，请重试。", "error"); } catch {}
      throw error;
    }
  }
  function update() {
    const ownsFocus = root.contains(root.ownerDocument.activeElement);
    const recoverFocus = captureFocusRecovery(root);
    for (const [id, trigger] of triggers) trigger.disabled = !resolved(id);
    syncTabStops();
    syncOpened();
    if (ownsFocus) recoverFocus(availableTriggers()[0] ?? fallbackFocus?.());
  }
  for (const definition of binding.definitions) {
    const trigger = visualButton(definition.label, null, () => { try { open(definition.id); } catch {} },
      { id: "menu-" + definition.id, className: "v-menu", role: "menuitem", "aria-haspopup": "menu", "aria-expanded": "false", dataset: { menu: definition.id } });
    trigger.addEventListener("focus", () => { if (!disposed && !trigger.disabled) { tabStop = definition.id; syncTabStops(); } });
    trigger.addEventListener("keydown", event => {
      if (disposed) return;
      if (!isPlainKey(event)) return;
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault(); try { open(definition.id, { last: event.key === "ArrowUp" }); } catch {}
      } else if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const nodes = availableTriggers(), at = nodes.indexOf(trigger);
        const index = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : (at + (event.key === "ArrowRight" ? 1 : -1) + nodes.length) % nodes.length;
        focusTrigger(nodes[index]);
      }
    });
    trigger.addEventListener("pointerenter", () => { if (opened && opened.trigger !== trigger && !trigger.disabled) { try { open(definition.id); } catch {} } });
    triggers.set(definition.id, trigger); root.append(trigger);
  }
  try { update(); scope.add(binding.menus.subscribe(update)); }
  catch (error) { rollback(scope, error); }
  return Object.freeze({ element: root, close, dispose() {
    if (disposed) return;
    disposed = true; close({ restoreFocus: false }); scope.dispose(); root.remove();
  } });
}
