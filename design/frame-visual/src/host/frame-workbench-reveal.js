const keys = ["position", "left", "top", "width", "height", "clipPath", "zIndex"];
const valid = rect => rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;

// Keep the original workbench behind the part of a lane not yet revealed.
// The region's existing clock supplies progress: no score motion, cloned DOM,
// geometry command, or second animation. Complementary clips never overlap.
export function createFrameWorkbenchReveal(stage) {
  const original = Object.fromEntries(keys.map(key => [key, stage.style[key]]));
  let bands = new Map(), owned = false;
  function restoreGeometry() {
    if (!owned) return;
    for (const key of keys) stage.style[key] = original[key];
    owned = false;
  }
  function clip() {
    const inset = ["top", "right", "voice", "left"].map(side => {
      const band = bands.get(side);
      return band ? band.extent * band.alpha : 0;
    });
    stage.style.clipPath = `inset(${inset.map(value => value + "px").join(" ")})`;
  }
  return Object.freeze({
    restoreGeometry,
    has: side => bands.has(side),
    project(accepted, next) {
      restoreGeometry();
      bands = new Map(next.filter(([, band]) => Number.isFinite(band.extent) && band.extent > 0));
      if (!bands.size || !valid(accepted)) { bands.clear(); return; }
      const extent = side => bands.get(side)?.extent ?? 0;
      Object.assign(stage.style, { position: "fixed", left: accepted.x - extent("left") + "px",
        top: accepted.y - extent("top") + "px", width: accepted.width + extent("left") + extent("right") + "px",
        height: accepted.height + extent("top") + extent("voice") + "px", zIndex: "2" });
      owned = true;
      clip();
    },
    advance(side, alpha) {
      const band = bands.get(side);
      if (!band || !owned) return;
      band.alpha = Math.max(0, Math.min(1, alpha));
      clip();
    },
    dispose() { restoreGeometry(); bands.clear(); },
  });
}
