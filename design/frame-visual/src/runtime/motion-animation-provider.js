// Only the host-selected provider imports the engine; components receive no
// engine or provider handle. The existing pinned bundle is the shared engine.
import { animate, animateDom } from "../../vendor/motion-review.js";
import { animationRectangleClip } from "./dom-animation-driver.js";

export function createMotionAnimationProvider() {
  return Object.freeze({
    name: "Motion 14.0.0",
    start({ node, intent, from, to, velocity, settings, isCurrent, write, complete, failed }) {
      const controls = [], nativeControls = new Set();
      let stopped = false;
      const startNative = (values, options) => {
        const control = animateDom(node, values, options);
        nativeControls.add(control); controls.push(control);
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        const errors = [];
        for (const control of controls) {
          try {
            // Native stop() commits computed styles and can throw after the
            // host has hidden its DOM. The service has already sampled the
            // position and owns the next static write, so cancel the native
            // tracks directly without another style commit.
            if (nativeControls.has(control)) control.cancel();
            else control.stop();
          } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, "Animation provider cleanup failed");
      };
      try {
        if (intent === "shape-transition") {
          // One timing/easing for the complete rectangle and its opacity.
          // The local plane stays 512px; no width/height/top/left or scale track.
          startNative({
            transform: [`translate3d(${from.x}px, ${from.y}px, 0)`, `translate3d(${to.x}px, ${to.y}px, 0)`],
            clipPath: [animationRectangleClip(from), animationRectangleClip(to)],
            opacity: [from.opacity, to.opacity],
          }, { duration: settings.duration * settings.multiplier, ease: settings.ease });
        } else if (settings.type === "spring") {
          const position = { ...from };
          for (const axis of ["x", "y"]) {
            if (from[axis] === to[axis] && velocity[axis] === 0) continue;
            controls.push(animate(from[axis], to[axis], {
              type: "spring", mass: 1, stiffness: settings.stiffness / settings.multiplier ** 2,
              damping: settings.damping / settings.multiplier, velocity: velocity[axis] / settings.multiplier,
              onUpdate: value => { if (!stopped && isCurrent()) { position[axis] = value; write(position); } },
            }));
          }
        } else {
          if (from.x !== to.x || from.y !== to.y) startNative({
            transform: [`translate3d(${from.x}px, ${from.y}px, 0)`, `translate3d(${to.x}px, ${to.y}px, 0)`],
          }, { duration: settings.duration * settings.multiplier, ease: settings.ease });
          if (from.opacity !== to.opacity) startNative({ opacity: [from.opacity, to.opacity] },
            { duration: (settings.fadeDuration ?? settings.duration) * settings.multiplier, ease: settings.ease });
        }
      } catch (error) {
        try { stop(); } catch { /* preserve the creation failure */ }
        throw error;
      }
      Promise.all(controls.map(control => control.finished)).then(() => {
        if (!stopped && isCurrent()) complete();
      }).catch(error => { if (!stopped && isCurrent()) failed(error); });
      return Object.freeze({ stop });
    },
  });
}
