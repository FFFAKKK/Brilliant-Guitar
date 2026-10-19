// Versioned local presentation contract, shared by author capture and execution.
export const ANIMATION_CONTRACT_VERSION = 1;
export const ANIMATION_API_VERSION = "ui-motion/1";
export const ANIMATION_SHAPE_EXTENT = 512;
export const ANIMATION_LIMITS = Object.freeze({
  "content-transition": 24, "selection-transition": 256, "drag-settle": 512,
  "shape-transition": ANIMATION_SHAPE_EXTENT,
});
export const ANIMATION_BUDGET = Object.freeze({ targets: 32, active: 128, variants: 8, velocity: 1600, springSeconds: 0.8 });

export function animationRecord(value, allowed, name) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError(`Invalid ${name}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !allowed.includes(key)
    || !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) throw new TypeError(`Unknown or non-data ${name} field`);
  return value;
}
export const validAnimationVariant = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);
function dataArray(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`Invalid animation ${name}`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Reflect.ownKeys(descriptors).some(key => !allowed.has(key) || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError(`Invalid animation ${name}`);
  return Array.from({ length: value.length }, (_, index) => {
    if (!descriptors[index]) throw new TypeError(`Sparse animation ${name}`);
    return descriptors[index].value;
  });
}
function bounded(value, min, max, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new TypeError(`Out of range animation ${name}`);
  return value;
}
function variant(input, intent) {
  animationRecord(input, ["type", "duration", "ease", "fadeDuration", "exitDuration", "stiffness", "damping"], "animation variant");
  if (input.type === "instant") { animationRecord(input, ["type"], "instant variant"); return Object.freeze({ type: "instant" }); }
  if (input.type === "spring" && !["content-transition", "shape-transition"].includes(intent)) {
    animationRecord(input, ["type", "stiffness", "damping"], "spring variant");
    return Object.freeze({ type: "spring", stiffness: bounded(input.stiffness, 80, 800, "stiffness"), damping: bounded(input.damping, 10, 80, "damping") });
  }
  if (input.type !== "tween") throw new TypeError("Invalid animation variant type");
  const content = intent === "content-transition";
  animationRecord(input, content ? ["type", "duration", "ease", "fadeDuration", "exitDuration"] : ["type", "duration", "ease"], "tween variant");
  if (!Array.isArray(input.ease) || input.ease.length !== 4) throw new TypeError("Invalid animation ease");
  const ease = Object.freeze(dataArray(input.ease, "ease").map(item => bounded(item, 0, 1, "ease")));
  const result = { type: "tween", duration: bounded(input.duration, .04, .3, "duration"), ease };
  if (content) {
    result.fadeDuration = bounded(input.fadeDuration, .04, .3, "fadeDuration");
    result.exitDuration = bounded(input.exitDuration, .04, .3, "exitDuration");
  }
  return Object.freeze(result);
}
export function captureAnimationContribution(input) {
  if (input == null) return Object.freeze({ contractVersion: ANIMATION_CONTRACT_VERSION, definitions: Object.freeze({}) });
  animationRecord(input, ["contractVersion", "definitions"], "animation contribution");
  if (input.contractVersion !== ANIMATION_CONTRACT_VERSION) throw new TypeError("Incompatible animation contract version");
  const definitions = input.definitions ?? {};
  animationRecord(definitions, Object.keys(ANIMATION_LIMITS), "animation definitions");
  return Object.freeze({ contractVersion: ANIMATION_CONTRACT_VERSION, definitions: Object.freeze(Object.fromEntries(Object.entries(definitions).map(([intent, definition]) => {
    animationRecord(definition, ["defaultVariant", "variants"], "animation definition");
    const choices = definition.variants;
    animationRecord(choices, Object.keys(choices ?? {}), "animation variants");
    const names = Object.keys(choices);
    if (!names.length || names.length > ANIMATION_BUDGET.variants || names.some(name => !validAnimationVariant(name))
      || !validAnimationVariant(definition.defaultVariant) || !Object.hasOwn(choices, definition.defaultVariant)) throw new TypeError("Invalid animation default or variants");
    return [intent, Object.freeze({ defaultVariant: definition.defaultVariant,
      variants: Object.freeze(Object.fromEntries(names.map(name => [name, variant(choices[name], intent)]))) })];
  }))) });
}
export function captureAnimationPermissions(input) {
  if (input == null) return Object.freeze([]);
  const intents = dataArray(input, "permissions");
  if (intents.some(intent => !Object.hasOwn(ANIMATION_LIMITS, intent)) || new Set(intents).size !== intents.length) throw new TypeError("Invalid animation permissions");
  return Object.freeze(intents);
}
export function captureAnimationValues(input, intent) {
  if (!Object.hasOwn(ANIMATION_LIMITS, intent)) throw new TypeError("Unknown animation intent");
  if (intent === "shape-transition") {
    animationRecord(input, ["x", "y", "width", "height", "opacity"], "animation rectangle");
    const rectangle = Object.fromEntries(["x", "y", "width", "height"].map(key =>
      [key, bounded(input[key], 0, ANIMATION_SHAPE_EXTENT, key)]));
    if (rectangle.x + rectangle.width > ANIMATION_SHAPE_EXTENT || rectangle.y + rectangle.height > ANIMATION_SHAPE_EXTENT) {
      throw new TypeError("Animation rectangle exceeds shape extent");
    }
    if (Object.hasOwn(input, "opacity")) rectangle.opacity = bounded(input.opacity, 0, 1, "opacity");
    return Object.freeze(rectangle);
  }
  animationRecord(input, ["x", "y", "opacity"], "animation values");
  if (!Object.keys(input).length) throw new TypeError("Empty animation values");
  return Object.freeze(Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (key === "opacity") {
      if (intent !== "content-transition") throw new TypeError("Only content can change opacity");
      return [key, bounded(value, 0, 1, key)];
    }
    return [key, bounded(value, -ANIMATION_LIMITS[intent], ANIMATION_LIMITS[intent], key)];
  })));
}
