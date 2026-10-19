// Review-only shared vocabulary and host budgets, not a published plugin SDK.
export const API_VERSION = "motion-review/2";
export const SHAPE_EXTENT = 512;
export const MOTION_LIMITS = Object.freeze({ "content-transition": 24, "selection-transition": 256, "drag-settle": 512, "shape-transition": SHAPE_EXTENT });

export function fields(value, allowed, name) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`Invalid ${name}`);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError(`Unknown ${name} field`);
}
export const validVariantName = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);
function bounded(value, min, max, name) {
  if (!Number.isFinite(value) || value < min || value > max) throw new TypeError(`Out of range animation ${name}`);
  return value;
}
function snapshotVariant(input, intent) {
  if (input?.type === "instant") {
    fields(input, ["type"], "animation variant");
    return Object.freeze({ type: "instant" });
  }
  if (input?.type === "spring" && !["content-transition", "shape-transition"].includes(intent)) {
    fields(input, ["type", "stiffness", "damping"], "animation variant");
    return Object.freeze({ type: "spring", stiffness: bounded(input.stiffness, 80, 800, "stiffness"), damping: bounded(input.damping, 10, 80, "damping") });
  }
  if (input?.type !== "tween") throw new TypeError("Invalid animation variant type");
  const content = intent === "content-transition";
  fields(input, content ? ["type", "duration", "ease", "fadeDuration", "exitDuration"] : ["type", "duration", "ease"], "animation variant");
  if (!Array.isArray(input.ease) || input.ease.length !== 4) throw new TypeError("Invalid animation ease");
  const result = { type: "tween", duration: bounded(input.duration, .04, .3, "duration"), ease: Object.freeze(Array.from(input.ease, value => bounded(value, 0, 1, "ease"))) };
  if (content) {
    result.fadeDuration = bounded(input.fadeDuration, .04, .3, "fadeDuration");
    result.exitDuration = bounded(input.exitDuration, .04, .3, "exitDuration");
  }
  return Object.freeze(result);
}

// Copy before binding: author mutation must not rewrite an accepted definition.
// Optional absence is empty; malformed supplied definitions always fail.
export function snapshotAnimationDefinitions(input) {
  if (input == null) return Object.freeze({});
  fields(input, Object.keys(MOTION_LIMITS), "animation definitions");
  return Object.freeze(Object.fromEntries(Object.entries(input).map(([intent, definition]) => {
    fields(definition, ["defaultVariant", "variants"], "animation definition");
    const variants = definition.variants;
    fields(variants, Object.keys(variants ?? {}), "animation variants");
    const names = Object.keys(variants);
    if (!names.length || names.length > 8 || names.some(name => !validVariantName(name)) || !validVariantName(definition.defaultVariant) || !Object.hasOwn(variants, definition.defaultVariant)) throw new TypeError("Invalid animation default or variants");
    return [intent, Object.freeze({ defaultVariant: definition.defaultVariant,
      variants: Object.freeze(Object.fromEntries(names.map(name => [name, snapshotVariant(variants[name], intent)]))) })];
  })));
}
