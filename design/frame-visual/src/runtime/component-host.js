// Mounts each component once into its own persistent cell. The shell may move the cell between
// dock, tab and flyout without remounting, so user-kept state survives layout changes.
// A component only receives a narrowed context: permitted commands, notices, its own variant.
import { assertSynchronousResult, createDisposalScope, isRecord } from "./runtime-support.js";
import { markFrameUi } from "./style-boundary.js";

export function createComponentHost({ registry, router, notices, dialogs, animationService = null }) {
  const cells = new Map();
  let disposed = false;

  function report(definition, text) {
    try { notices.push({ level: "error", source: definition.id, text }); }
    catch { /* a reporting failure must not interrupt other component cleanup */ }
  }

  function contextFor(definition, record) {
    const allowed = new Set(definition.permissions?.commands ?? []);
    const context = {
      execute(commandId, payload) {
        if (!record.active) return { ok: false, code: "component.disposed" };
        if (!allowed.has(commandId)) {
          report(definition, `${definition.title}没有执行 ${commandId} 的权限`);
          return { ok: false, code: "permission.denied" };
        }
        return router.execute(commandId, payload);
      },
      notify: (text, level = "info") => record.active ? notices.push({ level, text, source: definition.id }) : null,
      // Register subscriptions/listeners as soon as acquired, so mount failure can release them.
      onDispose: callback => record.scope.add(callback),
    };
    if (animationService) {
      if (!record.motion) {
        const motion = animationService.forComponent(definition, record.element);
        record.motion = motion;
        record.scope.add(() => motion.dispose());
      }
      // The author may name local nodes, but cannot replace the accepted
      // identity, root, definitions, policy or provider used by the host.
      if (definition.permissions?.animations?.length) context.motion = Object.freeze({ bind(targets) {
        if (!record.active) throw new TypeError("Released animation component");
        return record.motion.bind(targets);
      } });
    }
    if (dialogs) {
      if (!record.dialogs) {
        const port = dialogs.forComponent({ definition, element: record.element, execute: context.execute,
          active: () => record.active, visible: () => record.visible, notify: context.notify });
        record.dialogs = port;
        record.scope.add(() => port.dispose({ restoreFocus: !disposed }));
      }
      context.confirm = request => record.dialogs.confirm(request);
    }
    return context;
  }

  function ensure(componentId, variant) {
    if (disposed) throw new Error("组件宿主已释放");
    const existing = cells.get(componentId);
    if (existing) { setVariant(componentId, variant); return existing.element; }
    const definition = registry.get(componentId);
    if (!definition) throw new Error(`组件 ${componentId} 未注册`);
    const element = markFrameUi(document.createElement("section"));
    element.className = "component-cell";
    element.dataset.component = componentId;
    element.dataset.variant = variant;
    element.setAttribute("aria-label", definition.title);
    const record = { element, variant, visible: true, definition, instance: null, active: true, scope: createDisposalScope() };
    cells.set(componentId, record);
    try {
      record.instance = definition.mount(element, contextFor(definition, record), { variant }) ?? null;
      assertSynchronousResult(record.instance, "mount 需要同步返回实例对象或空值");
      if (record.instance !== null && !isRecord(record.instance)) throw new Error("mount 需要同步返回实例对象或空值");
      if (record.instance?.dispose !== undefined) {
        if (typeof record.instance.dispose !== "function") throw new Error("实例 dispose 必须是函数");
        record.scope.add(() => record.instance.dispose());
      }
      if (record.instance?.setVariant !== undefined && typeof record.instance.setVariant !== "function") throw new Error("实例 setVariant 必须是函数");
      if (record.instance?.setVisible !== undefined && typeof record.instance.setVisible !== "function") throw new Error("实例 setVisible 必须是函数");
      if (record.instance?.handleKeyDown !== undefined && typeof record.instance.handleKeyDown !== "function") throw new Error("实例 handleKeyDown 必须是函数");
    } catch (error) {
      record.active = false;
      try { record.scope.dispose(); } catch (cleanupError) { report(definition, `${definition.title}清理失败：${cleanupError.message}`); }
      record.instance = null;
      // Fault isolation: a broken component shows its own error; the frame keeps working.
      element.replaceChildren(Object.assign(markFrameUi(document.createElement("p")), { className: "component-fault", textContent: `${definition.title}加载失败` }));
      report(definition, `${definition.title}加载失败：${error?.message ?? error}`);
    }
    return element;
  }

  function setVariant(componentId, variant) {
    const record = cells.get(componentId);
    if (!record || !record.active || record.variant === variant) return;
    record.variant = variant;
    record.element.dataset.variant = variant;
    try { assertSynchronousResult(record.instance?.setVariant?.(variant), "setVariant 必须同步完成"); }
    catch (error) { report(record.definition, `${record.definition.title}形态更新失败：${error?.message ?? error}`); }
  }

  function release(componentId, expectedElement) {
    const record = cells.get(componentId);
    if (!record || (expectedElement !== undefined && record.element !== expectedElement)) return;
    // Remove ownership first: cleanup may re-enter release or registry notifications.
    cells.delete(componentId);
    record.active = false;
    try { record.scope.dispose(); }
    catch (error) { report(record.definition, `${record.definition.title}清理失败：${error.message}`); }
    finally { record.element.remove(); }
  }

  // Presentation reports actual visibility. This hook neither moves nor hides DOM and
  // never releases an instance; a hidden panel can resume with its private state intact.
  function setVisible(componentId, visible) {
    if (typeof visible !== "boolean") throw new TypeError("组件可见状态必须是布尔值");
    const record = cells.get(componentId);
    if (!record || !record.active || record.visible === visible) return;
    record.visible = visible;
    if (!visible) record.dialogs?.hide();
    record.motion?.setVisible(visible);
    try { assertSynchronousResult(record.instance?.setVisible?.(visible), "setVisible 必须同步完成"); }
    catch (error) { report(record.definition, `${record.definition.title}可见状态更新失败：${error?.message ?? error}`); }
  }

  // Resolve the nearest actual cell, not a spoofable data-component id or a remembered selection.
  // A focused panel never sends its unhandled keys to an unrelated background view.
  function recordFor(path) {
    const records = [...cells.values()];
    let record;
    for (const node of path) {
      record = records.find(cell => cell.element === node);
      if (record) break;
    }
    return record?.active && record.visible ? record : null;
  }

  function focusContext(path) {
    const record = recordFor(path);
    return record ? Object.freeze({ componentId: record.definition.id, owner: record.definition.owner,
      score: record.definition.role === "view" }) : Object.freeze({});
  }

  function executeShortcut(binding, path) {
    const record = recordFor(path);
    if (!record || binding.componentId !== record.definition.id || binding.owner !== record.definition.owner
      || !["component", "score"].includes(binding.scope)
      || (binding.scope === "score" && record.definition.role !== "view")) return { ok: false, code: "shortcut.inactive-component" };
    // Reuse exactly the same permissions and disposed-context check as buttons.
    return contextFor(record.definition, record).execute(binding.command);
  }

  function handleKeyDown(event, path) {
    const record = recordFor(path);
    if (!record?.instance?.handleKeyDown) return false;
    try {
      const result = record.instance.handleKeyDown(event);
      if (result !== undefined && typeof result !== "boolean") {
        // Drain a rejected async return, but never await or permit a delayed key claim.
        if (result?.then) Promise.resolve(result).catch(() => {});
        throw new TypeError("handleKeyDown 必须同步返回布尔值或 undefined");
      }
      return result === true || event.defaultPrevented || event.cancelBubble;
    } catch (error) {
      report(record.definition, `${record.definition.title}按键处理失败：${error?.message ?? error}`);
      return true;
    }
  }

  // Removing a definition releases its instance even when no shell is present.
  const unsubscribe = registry.subscribe(() => {
    for (const [id, record] of [...cells]) if (registry.get(id) !== record.definition) release(id);
  });

  return {
    ensure, setVariant, setVisible, handleKeyDown, focusContext, executeShortcut, release,
    has: (id, expectedElement) => cells.has(id) && (expectedElement === undefined || cells.get(id).element === expectedElement),
    mounted: () => [...cells.keys()],
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      [...cells.keys()].reverse().forEach(id => release(id));
    },
  };
}
