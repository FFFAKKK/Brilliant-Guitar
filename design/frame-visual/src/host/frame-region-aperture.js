// The frame projects its own reveal boundary from the existing motion plane's
// computed opacity. There is one clock/provider, and no new plugin permission,
// geometry command, timer, or animation of the score viewport.
export function createFrameRegionAperture({ viewport, side, element, content, header = null, backdrops = [], onProgress = null }) {
  const request = viewport?.requestAnimationFrame?.bind(viewport);
  const cancel = viewport?.cancelAnimationFrame?.bind(viewport);
  const computed = viewport?.getComputedStyle?.bind(viewport);
  const originalClip = element.style.clipPath;
  const originalHeaderTransform = header?.style.transform;
  const originalBackdropOpacity = backdrops.map(node => node.style.opacity);
  let frame = null, token = null, owned = false;
  const collapsedClip = () => side === "left" ? "inset(0px 100% 0px 0px)"
    : side === "right" ? "inset(0px 0px 0px 100%)"
      : side === "top" ? "inset(0px 0px 100% 0px)" : "inset(100% 0px 0px 0px)";
  function stop() {
    token = null;
    if (frame !== null) cancel?.(frame);
    frame = null;
    if (owned) {
      element.style.clipPath = originalClip;
      if (header) header.style.transform = originalHeaderTransform;
      backdrops.forEach((node, index) => { node.style.opacity = originalBackdropOpacity[index]; });
      owned = false;
    }
  }
  return Object.freeze({
    prepare(alpha = 0) {
      // Opening elements may still be `hidden`, so their box is unavailable.
      // Set a percentage boundary first; it is dimension-independent and keeps
      // opaque artwork/ghost pages from painting a full carrier for one frame.
      stop();
      owned = true;
      const value = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
      backdrops.forEach(node => { node.style.opacity = String(value); });
      onProgress?.(value);
      const { width, height } = element.getBoundingClientRect?.() ?? {};
      if (![width, height].every(item => Number.isFinite(item) && item > 0)) {
        element.style.clipPath = value >= 1 ? "inset(0px)" : collapsedClip();
        return;
      }
      const covered = (side === "left" || side === "right" ? width : height) * (1 - value);
      const inset = side === "left" ? [0, covered, 0, 0] : side === "right" ? [0, 0, 0, covered]
        : side === "top" ? [0, 0, covered, 0] : [covered, 0, 0, 0];
      element.style.clipPath = `inset(${inset.map(item => item + "px").join(" ")})`;
    },
    start() {
      // Cancel only the previous sampler. Keep the prepared first-paint clip
      // and artwork until the native track's first sample has been projected.
      token = null;
      if (frame !== null) cancel?.(frame);
      frame = null;
      // Static/non-browser hosts need no frame sampler. The animation owner
      // still completes, fails, reduces, and releases through its original port.
      if (!request || !cancel || !computed) return;
      const { width, height } = element.getBoundingClientRect();
      if (![width, height].every(value => Number.isFinite(value) && value > 0)) return;
      const current = {}; token = current; owned = true;
      const project = () => {
        const value = Number(computed(content).opacity);
        const alpha = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
        const covered = (side === "left" || side === "right" ? width : height) * (1 - alpha);
        const inset = side === "left" ? [0, covered, 0, 0] : side === "right" ? [0, 0, 0, covered]
          : side === "top" ? [0, 0, covered, 0] : [covered, 0, 0, 0];
        element.style.clipPath = `inset(${inset.map(value => value + "px").join(" ")})`;
        backdrops.forEach(node => { node.style.opacity = String(alpha); });
        // The bottom strip persists when folded. Its original node follows
        // the same reveal boundary instead of jumping to the expanded origin.
        if (header) header.style.transform = `${originalHeaderTransform && originalHeaderTransform !== "none" ? originalHeaderTransform + " " : ""}translate3d(0px, ${height * (1 - alpha)}px, 0px)`;
        onProgress?.(alpha);
      };
      const tick = () => {
        if (token !== current) return;
        project(); frame = request(tick);
      };
      project(); frame = request(tick);
    },
    stop,
  });
}
