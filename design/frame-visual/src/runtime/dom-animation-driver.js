// Static DOM operations also work when no animation provider is installed.
import { ANIMATION_SHAPE_EXTENT, captureAnimationValues } from "../contracts/animation.js";

export function animationRectangleClip(value) {
  const rectangle = captureAnimationValues(value, "shape-transition");
  return `inset(0px ${ANIMATION_SHAPE_EXTENT - rectangle.width}px ${ANIMATION_SHAPE_EXTENT - rectangle.height}px 0px round 2px)`;
}

function readRectangleClip(clip) {
  if (!clip || clip === "none") return { width: ANIMATION_SHAPE_EXTENT, height: ANIMATION_SHAPE_EXTENT };
  const match = /^inset\(([^)]+)\)$/.exec(clip);
  if (!match) throw new TypeError("Unsupported local animation rectangle clip");
  const [edges, radius, extra] = match[1].split(/\s+round\s+/);
  if (extra !== undefined || radius !== undefined && radius.trim() !== "2px") throw new TypeError("Unsupported local animation rectangle radius");
  const parts = edges.trim().split(/\s+/);
  if (!parts.length || parts.length > 4 || parts.some(part => !/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)px)$/.test(part))) {
    throw new TypeError("Unsupported local animation rectangle inset");
  }
  const values = parts.map(parseFloat);
  const [top, right = top, bottom = top, left = right] = values;
  if (top !== 0 || left !== 0 || right > ANIMATION_SHAPE_EXTENT || bottom > ANIMATION_SHAPE_EXTENT) {
    throw new TypeError("Unsupported local animation rectangle bounds");
  }
  return { width: ANIMATION_SHAPE_EXTENT - right, height: ANIMATION_SHAPE_EXTENT - bottom };
}

export function createDomAnimationDriver() {
  const read = (node, intent) => {
    const style = node.ownerDocument?.defaultView?.getComputedStyle?.(node) ?? globalThis.getComputedStyle?.(node) ?? node.style;
    const transform = style.transform;
    let x = 0, y = 0;
    if (transform && transform !== "none") {
      if (typeof globalThis.DOMMatrixReadOnly === "function") {
        const matrix = new DOMMatrixReadOnly(transform); x = matrix.m41; y = matrix.m42;
        if (intent === "shape-transition" && (!matrix.is2D || matrix.a !== 1 || matrix.b !== 0 || matrix.c !== 0 || matrix.d !== 1)) {
          throw new TypeError("Unsupported local animation rectangle transform");
        }
      } else {
        // Static DOM hosts may expose only inline translation without a
        // computed-style/matrix engine. It is the same format write produces.
        const match = /^translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px,\s*0\)$/.exec(transform);
        if (!match) throw new TypeError("Unsupported local animation transform");
        x = Number(match[1]); y = Number(match[2]);
      }
    }
    const value = { x, y, opacity: style.opacity === "" || style.opacity == null ? 1 : Number(style.opacity) };
    return intent === "shape-transition" ? captureAnimationValues({ ...value, ...readRectangleClip(style.clipPath) }, intent) : value;
  };
  return Object.freeze({
    read,
    write(node, value, intent) {
      if (intent === "shape-transition") {
        const rectangle = captureAnimationValues(value, intent);
        node.style.transform = `translate3d(${rectangle.x}px, ${rectangle.y}px, 0)`;
        node.style.clipPath = animationRectangleClip(rectangle);
        if (rectangle.opacity != null) node.style.opacity = String(rectangle.opacity);
        return;
      }
      if (value.x != null || value.y != null) {
        const current = read(node);
        node.style.transform = `translate3d(${value.x ?? current.x}px, ${value.y ?? current.y}px, 0)`;
      }
      if (value.opacity != null) node.style.opacity = String(value.opacity);
    },
    capture: (node, intents = []) => ({ transform: node.style.transform, opacity: node.style.opacity,
      ...(intents.includes("shape-transition") ? { clipPath: node.style.clipPath } : {}) }),
    restore(node, original) {
      node.style.transform = original.transform; node.style.opacity = original.opacity;
      if (Object.hasOwn(original, "clipPath")) node.style.clipPath = original.clipPath;
    },
  });
}
