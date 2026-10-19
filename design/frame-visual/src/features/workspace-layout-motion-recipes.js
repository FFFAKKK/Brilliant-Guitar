// Private layout artwork. No identity, engine or host implementation dependency.
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const profiles = freeze({
  continuous: {
    travel: { x: 16, y: 0 },
    "content-transition": { type: "tween", duration: .25, fadeDuration: .16, exitDuration: .08, ease: [.23, 1, .32, 1] },
    "selection-transition": { type: "tween", duration: .25, ease: [.77, 0, .175, 1] },
    "drag-settle": { type: "spring", stiffness: 260, damping: 32 },
  },
  focused: {
    travel: { x: 0, y: 12 },
    "content-transition": { type: "tween", duration: .26, fadeDuration: .2, exitDuration: .1, ease: [.16, 1, .3, 1] },
    "selection-transition": { type: "tween", duration: .26, ease: [.77, 0, .175, 1] },
    "drag-settle": { type: "spring", stiffness: 260, damping: 32 },
  },
  quiet: {
    travel: { x: 0, y: 0 },
    "content-transition": { type: "tween", duration: .14, fadeDuration: .14, exitDuration: .07, ease: [.23, 1, .32, 1] },
    "selection-transition": { type: "instant" },
    "drag-settle": { type: "spring", stiffness: 500, damping: 46 },
  },
});
export const WORKSPACE_LAYOUT_ANIMATIONS = freeze(Object.fromEntries(["content-transition", "selection-transition", "drag-settle"].map(intent => [intent, {
  defaultVariant: "continuous", variants: Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, profile[intent]])),
}])));
export const LAYOUT_REGION_EMPHASIS = freeze({ defaultVariant: "continuous", variants: Object.fromEntries(Object.entries(profiles).map(([name, profile]) => [name, {
  ...profile["content-transition"], duration: profile["content-transition"].fadeDuration,
}])) });
export const LAYOUT_TOGGLE_EMPHASIS = freeze({ defaultVariant: "continuous", variants: {
  continuous: { type: "tween", duration: .16, fadeDuration: .16, exitDuration: .12, ease: [.23, 1, .32, 1] },
  focused: { type: "tween", duration: .18, fadeDuration: .18, exitDuration: .12, ease: [.16, 1, .3, 1] },
  quiet: { type: "tween", duration: .10, fadeDuration: .10, exitDuration: .08, ease: [.23, 1, .32, 1] },
} });
// Artwork only. Formal permission/registration is owned by the engineering
// host; exporting this does not add shape-transition to its public contract.
export const LAYOUT_PREVIEW_SHAPE = freeze({ defaultVariant: "continuous", variants: {
  continuous: { type: "tween", duration: .28, ease: [.77, 0, .175, 1] },
  focused: { type: "tween", duration: .26, ease: [.32, .72, 0, 1] },
  quiet: { type: "tween", duration: .14, ease: [.23, 1, .32, 1] },
} });
export const LAYOUT_RELEASE_WINDOW = .12;
export function layoutContentTravel(profile, direction) {
  const { x, y } = (Object.hasOwn(profiles, profile) ? profiles[profile] : profiles.continuous).travel;
  return { incoming: { x: x * direction, y }, outgoing: { x: -x * direction, y: -y } };
}
