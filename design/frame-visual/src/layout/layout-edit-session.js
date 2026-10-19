// Coordinates existing configuration owners. Workspace.adjusting remains the only mode flag.
export function createLayoutEditSession({ workspace, composition, reservedPanelIds = [] } = {}) {
  if (!workspace?.read || typeof workspace.batch !== "function") throw new TypeError("布局会话需要工作区状态所有者");
  if (!Array.isArray(reservedPanelIds) || reservedPanelIds.some(id => typeof id !== "string")) throw new TypeError("固定布局入口需要 id 数组");
  const reserved = new Set(reservedPanelIds);
  const currentComposition = () => typeof composition === "function" ? composition() : composition;
  let baseline = null, busy = false, disposed = false;
  const fail = code => ({ ok: false, code: `layout.${code}` });
  const atomic = (owner, callback) => workspace.batch(() => owner ? owner.batch(callback) : callback());
  // Workspace use stays available outside component-layout editing and never joins its baseline.
  const operateWorkspace = callback => withLock(() => workspace.batch(callback));
  function withLock(callback) {
    if (disposed) return fail("disposed");
    if (busy) return fail("busy");
    busy = true;
    try { return callback(); } finally { busy = false; }
  }
  function canConfigure() {
    // Availability is derived from committed mode/baseline even while observers run.
    // Reentrant writes are rejected by the operation lock, not cached as disabled UI.
    return !disposed && baseline !== null && workspace.read.snapshot().adjusting
      && currentComposition() === baseline.owner;
  }
  function configure(callback, needsComposition = false) {
    if (disposed) return fail("disposed");
    if (busy) return fail("busy");
    if (!workspace.read.snapshot().adjusting) return fail("edit-required");
    if (!baseline || currentComposition() !== baseline.owner) return fail("edit-desynchronized");
    if (needsComposition && !baseline.owner) return fail("no-composition");
    return withLock(() => atomic(baseline.owner, () => callback(baseline.owner)));
  }
  const configurePanel = (id, callback) => configure(owner => reserved.has(id)
    ? fail("reserved-panel") : callback(owner), true);
  function changes() {
    if (!canConfigure() || !baseline.owner) return Object.freeze([]);
    const before = new Map(baseline.snapshot.panels.map(panel => [panel.id, panel]));
    return Object.freeze(baseline.owner.read.snapshot().panels.flatMap(after => {
      const original = before.get(after.id);
      return original && ["slot", "enabled", "order"].some(key => original[key] !== after[key])
        ? [Object.freeze({ id: after.id, before: original, after })] : [];
    }));
  }
  function finish(confirm) {
    if (typeof confirm !== "boolean") return { ok: false, code: "workspace.invalid-payload" };
    return withLock(() => {
      if (!baseline || !workspace.read.snapshot().adjusting) return { ok: false, code: "workspace.no-adjustment" };
      if (currentComposition() !== baseline.owner) return fail("edit-desynchronized");
      const saved = baseline;
      try { return atomic(saved.owner, () => {
        if (!confirm && saved.owner) {
          const restored = saved.owner.restore(saved.snapshot);
          if (!restored.ok) return restored;
        }
        const result = workspace.finishAdjustment(confirm);
        if (result?.ok) baseline = null;
        return result;
      }); } finally {
        if (workspace.read.snapshot().adjusting) baseline = saved;
      }
    });
  }
  return Object.freeze({
    canConfigure, changes,
    begin() {
      return withLock(() => {
        if (workspace.read.snapshot().adjusting) return baseline && currentComposition() === baseline.owner
          ? { ok: true, changed: false } : fail("edit-desynchronized");
        const owner = currentComposition(), snapshot = owner?.read.snapshot();
        baseline = { owner, snapshot };
        try { return atomic(owner, () => workspace.beginAdjustment()); }
        finally { if (!workspace.read.snapshot().adjusting) baseline = null; }
      });
    },
    finish,
    resize: (side, value) => operateWorkspace(() => workspace.resize(side, value)),
    arrange: mode => operateWorkspace(() => workspace.arrange(mode)),
    configureRegion: (region, open) => operateWorkspace(() => workspace.setRegionOpen(region, open)),
    move: (id, slot, index) => configurePanel(id, owner => owner.move(id, slot, index)),
    setEnabled: (id, enabled) => configurePanel(id, owner => owner.setEnabled(id, enabled)),
    reorder: (id, index) => configurePanel(id, owner => owner.reorder(id, index)),
    dispose() {
      if (disposed) return { ok: true, changed: false };
      if (busy) return fail("busy");
      if (baseline) { const result = finish(false); if (!result?.ok) return result; }
      disposed = true;
      return { ok: true, changed: false };
    },
  });
}
