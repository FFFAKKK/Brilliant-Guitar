// Only this adapter imports the engine. Plugin-local animation ports don't.
import { animate, animateDom } from "../../../vendor/motion-review.js";
import { SHAPE_EXTENT } from "./definition-contract.js";

const rectangleClip = value => `inset(0px ${SHAPE_EXTENT - value.width}px ${SHAPE_EXTENT - value.height}px 0px round 2px)`;

export function createMotionAdapter() {
  const read = (node, intent) => {
    const style = getComputedStyle(node);
    const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
    const value = { x: matrix.m41, y: matrix.m42, opacity: Number(style.opacity) };
    if (intent === "shape-transition") {
      const parts = style.clipPath === "none" ? [0] : style.clipPath.slice(6).split("round")[0].match(/[\d.]+/g).map(Number);
      const right = parts[1] ?? parts[0], bottom = parts[2] ?? parts[0];
      value.width = SHAPE_EXTENT - right; value.height = SHAPE_EXTENT - bottom;
    }
    return value;
  };
  const write = (node, values, intent) => {
    if (values.x != null || values.y != null) {
      const current = read(node);
      node.style.transform = `translate3d(${values.x ?? current.x}px, ${values.y ?? current.y}px, 0)`;
    }
    if (values.opacity != null) node.style.opacity = String(values.opacity);
    if (intent === "shape-transition") node.style.clipPath = rectangleClip(values);
  };
  return Object.freeze({
    name: "Motion 14.0.0",
    read, write,
    capture: node => ({ transform: node.style.transform, opacity: node.style.opacity, clipPath: node.style.clipPath }),
    restore: (node, original) => { node.style.transform = original.transform; node.style.opacity = original.opacity; node.style.clipPath = original.clipPath; },
    start({ node, from, to, intent, velocity, settings, complete, failed }) {
      const controls = [];
      let stopped = false;
      if (settings.type === "spring") {
        // Numeric springs retain release velocity in px/s. Render only a full
        // transform on this single local node; no layout properties are animated.
        const position = { ...from };
        for (const axis of ["x", "y"]) {
          if (from[axis] === to[axis] && velocity[axis] === 0) continue;
          controls.push(animate(from[axis], to[axis], {
            type: "spring", mass: 1, stiffness: settings.stiffness / settings.multiplier ** 2,
            damping: settings.damping / settings.multiplier, velocity: velocity[axis] / settings.multiplier,
            onUpdate: value => { if (!stopped) { position[axis] = value; write(node, position); } },
          }));
        }
      } else {
        const keyframes = {
          transform: [`translate3d(${from.x}px, ${from.y}px, 0)`, `translate3d(${to.x}px, ${to.y}px, 0)`],
        };
        if (intent === "shape-transition") keyframes.clipPath = [rectangleClip(from), rectangleClip(to)];
        controls.push(animateDom(node, keyframes, { duration: settings.duration * settings.multiplier, ease: settings.ease }));
        if (from.opacity !== to.opacity) controls.push(animateDom(node, {
          opacity: [from.opacity, to.opacity],
        }, { duration: settings.fadeDuration * settings.multiplier, ease: settings.ease }));
      }
      Promise.all(controls.map(control => control.finished)).then(() => { if (!stopped) complete(); }).catch(error => { if (!stopped) failed(error); });
      return { stop() { stopped = true; for (const control of controls) { if (intent === "shape-transition") control.cancel(); else control.stop(); } } };
    },
  });
}
