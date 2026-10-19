import { LAYOUT_TOGGLE_EMPHASIS } from "../features/workspace-layout-motion-recipes.js";

// Only the author's editing tools participate. Commands accept first; hidden
// outgoing controls are inert immediately, even while their pixels fade out.
export function createWorkspaceLayoutEditMotion({ edit, actions, groups, state, onIssue }) {
  let editing = !!state.editing, port = null, visible = true, released = false;
  const pending = new Map();
  const records = actions ? [
    { target: "edit:begin", node: edit, layer: true, active: () => !editing },
    { target: "edit:finish", node: actions, layer: true, active: () => editing },
    ...groups.map((node, index) => ({ target: "edit:group-" + index, node, layer: false, active: () => editing })),
  ] : [];
  const doc = edit.ownerDocument, viewport = doc.defaultView;
  const opacity = record => record.active() ? 1 : record.layer ? 0 : .64;
  const request = record => ({ intent: "content-transition", target: record.target, to: { opacity: opacity(record) } });
  const semantics = record => {
    if (!record.layer) return;
    const active = record.active();
    record.node.inert = !active;
    if (active) record.node.removeAttribute("aria-hidden");
    else record.node.setAttribute("aria-hidden", "true");
    record.node.hidden = !active && !pending.has(record.target);
  };
  const finish = (record, token) => {
    if (released || pending.get(record.target) !== token) return;
    pending.delete(record.target); semantics(record);
  };
  function play(record, token) {
    const playback = port.play(request(record));
    if (typeof playback?.finished?.then !== "function") throw new TypeError("Invalid layout editing playback");
    playback.finished.then(() => finish(record, token), error => {
      if (!released && pending.get(record.target) === token) onIssue(error);
    });
    const placed = record.node.style.opacity === String(opacity(record));
    if (placed) finish(record, token);
    return { playback, placed };
  }
  function settle() {
    if (!port || released) return;
    pending.clear();
    for (const record of records) { port.place(request(record)); semantics(record); }
  }
  function detachMotion() {
    const old = port; port = null; pending.clear();
    try { old?.dispose?.(); } finally {
      for (const record of records) {
        if (record.layer) {
          record.node.hidden = !record.active(); record.node.inert = false;
          record.node.removeAttribute("aria-hidden");
        }
      }
    }
  }
  const onResize = () => { try { settle(); } catch (error) { onIssue(error); } };
  const onHidden = () => { if (doc.hidden) onResize(); };
  viewport?.addEventListener("resize", onResize);
  doc.addEventListener("visibilitychange", onHidden);
  return Object.freeze({
    update(next, { immediate = true, geometryChanged = false } = {}) {
      if (released) return;
      const changed = editing !== !!next.editing; editing = !!next.editing;
      if (!port) return;
      if (!changed) {
        if (geometryChanged) settle();
        else for (const record of records) semantics(record);
        return;
      }
      if (immediate || !visible || doc.hidden) { settle(); return; }
      for (const record of records) {
        const wasPending = pending.has(record.target);
        if (wasPending) port.hold({ intent: "content-transition", target: record.target });
        if (record.layer && record.active() && !wasPending) {
          port.place({ intent: "content-transition", target: record.target, to: { opacity: 0 } });
        }
        const token = {}; pending.set(record.target, token); semantics(record);
      }
      // Both tool groups share one fixed slot. Do not crossfade different
      // words on top of one another; the outgoing group fades first.
      const outgoing = records.find(record => record.layer && !record.active());
      const incoming = records.find(record => record.layer && record.active());
      const incomingToken = pending.get(incoming.target);
      const enter = () => {
        if (released || !port || pending.get(incoming.target) !== incomingToken) return;
        try { play(incoming, incomingToken); } catch (error) { onIssue(error); }
      };
      const exit = play(outgoing, pending.get(outgoing.target));
      if (exit.placed) enter();
      else exit.playback.finished.then(enter, () => {});
      for (const record of records.filter(record => !record.layer)) play(record, pending.get(record.target));
    },
    attachMotion(bind, root) {
      if (released || port) throw new TypeError("Layout editing already bound or released");
      if (!records.length) return;
      try {
        const targets = Object.fromEntries(records.map(record => [record.target, { node: record.node, intents: ["content-transition"] }]));
        port = bind({ root, targets, animations: { "content-transition": LAYOUT_TOGGLE_EMPHASIS } }) ?? null;
        if (!port) return;
        if (["hold", "place", "play", "dispose"].some(key => typeof port[key] !== "function")) throw new TypeError("Invalid layout editing port");
        settle();
      } catch (error) { try { detachMotion(); } catch (cleanupError) { onIssue(cleanupError); } throw error; }
    },
    detachMotion,
    setVisible(next) { visible = next; settle(); },
    dispose() {
      if (released) return;
      try { detachMotion(); } finally {
        released = true; viewport?.removeEventListener("resize", onResize);
        doc.removeEventListener("visibilitychange", onHidden);
      }
    },
  });
}
