import { h } from "../shell/dom.js";
import { ANIMATION_BUDGET, ANIMATION_LIMITS, captureAnimationContribution } from "../contracts/animation.js";

// Frame-owned list movement. It neither changes composition nor obtains a
// plugin's private targets. Only the neutral carriers are animation targets.
const declaration = Object.freeze({ owner: "frame.builtin", id: "frame.builtin.content-order",
  permissions: { animations: ["drag-settle", "content-transition"] },
  animations: captureAnimationContribution({ contractVersion: 1, definitions: {
    "drag-settle": { defaultVariant: "continuous", variants: {
      continuous: { type: "spring", stiffness: 260, damping: 32 },
      focused: { type: "spring", stiffness: 260, damping: 32 },
      quiet: { type: "instant" },
    } },
    "content-transition": { defaultVariant: "continuous", variants: {
      continuous: { type: "tween", duration: .16, fadeDuration: .16, exitDuration: .12, ease: [.23, 1, .32, 1] },
      focused: { type: "tween", duration: .18, fadeDuration: .18, exitDuration: .12, ease: [.16, 1, .3, 1] },
      quiet: { type: "instant" },
    } },
  } }),
});
const origin = Object.freeze({ x: 0, y: 0 });
const request = (to, intent = "drag-settle") => ({ intent, target: "item", to });
const same = (a, b) => a.length === b.length && a.every((node, index) => node === b[index]);
const rect = node => {
  const box = node.getBoundingClientRect();
  return { x: box.x ?? box.left, y: box.y ?? box.top, width: box.width, height: box.height };
};
const valid = box => box && Object.values(box).every(Number.isFinite) && box.width > 0 && box.height > 0;
const opacity = node => {
  const style = node.ownerDocument.defaultView?.getComputedStyle?.(node) ?? node.style;
  const value = style.opacity === "" || style.opacity == null ? 1 : Number(style.opacity);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
};

export function createFrameContentOrderPresentation({ root, workspaceRoot, service }) {
  const component = service.forComponent(declaration, root), records = new Map();
  const listeners = new AbortController();
  let released = false, initialized = false, previous = [], before = new Map(), scroll = null;
  const available = () => !workspaceRoot.hidden && workspaceRoot.style.display !== "none"
    && workspaceRoot.ownerDocument.visibilityState !== "hidden";
  function rest(record) {
    record.token = null; record.port?.place(request({ ...origin, opacity: 1 }, "content-transition"));
    // Identity transforms still create containing blocks for private fixed
    // children. A neutral carrier must have no transform while at rest.
    record.element.style.transform = "";
    record.element.style.opacity = "";
  }
  function settle() {
    for (const record of records.values()) rest(record);
    before.clear();
  }
  function remove(record) {
    record.token = null; record.port?.dispose(); records.delete(record.node);
  }
  const resize = () => settle();
  const observer = typeof MutationObserver === "function" ? new MutationObserver(resize) : null;
  observer?.observe(workspaceRoot, { attributes: true, attributeFilter: ["hidden", "style"] });
  root.ownerDocument.defaultView?.addEventListener("resize", resize, { signal: listeners.signal });
  root.ownerDocument.addEventListener("visibilitychange", resize, { signal: listeners.signal });
  root.addEventListener("scroll", resize, { signal: listeners.signal });

  return Object.freeze({
    item(node) {
      if (released) throw new Error("内容排序呈现已释放");
      let record = records.get(node);
      if (!record) {
        const element = h("div", { class: "v-frame-order-row", role: "presentation" }, node);
        record = { node, element, port: null, token: null }; records.set(node, record);
      } else if (node.parentNode !== record.element) record.element.append(node);
      return record.element;
    },
    beforeRender() {
      if (released) return;
      before = new Map(previous.map(node => [node, { ...rect(node), opacity: opacity(node) }]));
      scroll = [root.scrollLeft, root.scrollTop];
    },
    update(nodes, { pointer = false, stable = true, open = true } = {}) {
      if (released) return;
      for (const record of [...records.values()]) if (!root.contains(record.element) || !record.element.contains(record.node)) remove(record);
      const ordered = nodes.filter(node => records.has(node) && !node.hidden).map(node => records.get(node).element);
      // Bind only host-owned carriers, after they are attached. A large list
      // stays fully usable; targets beyond the existing budget remain static.
      for (const record of records.values()) if (!record.port && records.size <= ANIMATION_BUDGET.targets) {
        record.port = component.bind({ item: { node: record.element, intents: ["drag-settle", "content-transition"] } });
      }
      const policy = service.snapshot(), unchanged = same(ordered, previous), first = !initialized;
      initialized = true;
      if (unchanged && stable && open && available()) return;
      const animate = !first && !unchanged && pointer && stable && open && available() && policy.visible
        && records.size <= ANIMATION_BUDGET.targets
        && ["full", "slow"].includes(policy.mode) && policy.profile !== "quiet"
        && scroll?.[0] === root.scrollLeft && scroll?.[1] === root.scrollTop;
      // getBoundingClientRect captured the current animated position before
      // reordering. Clear transforms now to measure accepted layout anchors.
      for (const record of records.values()) rest(record);
      if (animate) {
        const moves = ordered.map(node => {
          const old = before.get(node), next = rect(node), entering = !previous.includes(node);
          return { node, entering, opacity: old?.opacity ?? 1, from: valid(next) && (entering || valid(old))
            ? entering ? origin : { x: old.x - next.x, y: old.y - next.y } : null };
        });
        const limit = ANIMATION_LIMITS["drag-settle"];
        const bounded = moves.every(({ from }) => from && Math.abs(from.x) <= limit && Math.abs(from.y) <= limit)
          && service.snapshot().active + moves.length <= ANIMATION_BUDGET.active;
        if (bounded) for (const { node, entering, opacity, from } of moves) {
          const record = [...records.values()].find(item => item.element === node);
          const moving = Math.abs(from.x) > .5 || Math.abs(from.y) > .5;
          const fade = entering || !moving && opacity < 1;
          if (record.port && (fade || moving)) {
            try {
              const token = {}; record.token = token;
              const playback = fade ? { ...request({ opacity: 1 }, "content-transition"), from: { opacity: entering ? 0 : opacity } }
                : { ...request(origin), from };
              record.port.play(playback).finished.then(() => {
                if (!released && record.token === token) rest(record);
              });
            }
            catch { settle(); break; } // Concurrent host capacity loss is static; accepted order remains usable.
          }
        }
      }
      previous = ordered; before.clear();
    },
    dispose() {
      if (released) return;
      released = true; listeners.abort(); observer?.disconnect();
      for (const record of records.values()) { record.token = null; record.port?.dispose(); }
      component.dispose();
      for (const { node, element } of records.values()) {
        if (element.parentNode && node.parentNode === element) element.parentNode.insertBefore(node, element);
        element.remove();
      }
      records.clear(); previous = []; before.clear();
    },
  });
}
