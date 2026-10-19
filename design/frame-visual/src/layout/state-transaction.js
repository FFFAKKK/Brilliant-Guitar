// Owner-local synchronous transaction. The owner supplies its immutable state references.
// Nested owners can finish together before either publishes; this is not a command dispatcher.
export function createStateTransaction({ capture, restore, notify }) {
  let depth = 0, pending = false;
  return Object.freeze({
    changed() {
      if (depth) pending = true;
      else notify();
    },
    batch(callback) {
      if (typeof callback !== "function") throw new TypeError("状态事务需要同步函数");
      const saved = capture(), pendingBefore = pending;
      let accepted = false;
      depth++;
      try {
        const result = callback();
        if (result?.then) {
          Promise.resolve(result).catch(() => {});
          throw new TypeError("布局状态事务必须同步完成");
        }
        accepted = result?.ok !== false;
        return result;
      } finally {
        depth--;
        if (!accepted) { restore(saved); pending = pendingBefore; }
        if (!depth && pending) { pending = false; notify(); }
      }
    },
  });
}
