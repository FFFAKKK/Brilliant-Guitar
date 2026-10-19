// Shared visual geometry; no region visibility, DOM, storage or document state.
// Capacity stays stable; horizontal bands may reduce the side panels' visible height.
export const WORKSPACE_CHROME = Object.freeze({ title: 34, top: 40, voiceTitle: 32, merge: 40 });
export const WORKSPACE_RAILS = Object.freeze({ left: 40, right: 40 });
// Paired regions use paired geometry. Fixed chrome (title/header rows) is
// separate from these adjustable content dimensions, so equal values remain
// visually comparable across the two axes.
export const WORKSPACE_DEFAULT_SIZES = Object.freeze({ left: 260, right: 260, top: 120, voice: 120 });
export const WORKSPACE_COMPACT_SIZES = Object.freeze({ left: 230, right: 230, top: 80, voice: 80 });
export const WORKSPACE_MINIMUMS = Object.freeze({ left: 230, right: 230, top: 80, voice: 80 });
export const WORKSPACE_SIZE_KEYS = Object.freeze({ left: "leftWidth", right: "rightWidth", top: "topHeight", voice: "voiceHeight" });
// Sidebars share one product-level upper bound. The effective maximum can
// still be lower when the viewport or the opposite sidebar needs space.
export const WORKSPACE_MAXIMUMS = Object.freeze({ left: 420, right: 420, top: 320, voice: 320 });

// The bottom height is the complete visible band, including its fixed header.
// Keeping this conversion here prevents the shell and hosted content views
// from applying different interpretations of the same slider value.
export function workspaceFooterHeight(state) {
  return state.voiceOpen ? state.voiceHeight : WORKSPACE_CHROME.voiceTitle;
}

export function workspaceVoiceContentHeight(state) {
  return state.voiceOpen ? Math.max(0, state.voiceHeight - WORKSPACE_CHROME.voiceTitle) : 0;
}

function verticalCapacity(height) {
  return Math.max(WORKSPACE_MINIMUMS.top + WORKSPACE_MINIMUMS.voice,
    height - WORKSPACE_CHROME.title - WORKSPACE_CHROME.merge - 300);
}

function horizontalCapacity(width) {
  // Small preview hosts retain usable symmetric panels; the stage uses the remainder.
  // Visibility never changes this budget, so opening a region cannot resize another.
  return Math.max(2 * Math.max(WORKSPACE_MINIMUMS.left, WORKSPACE_MINIMUMS.right),
    width - WORKSPACE_RAILS.left - WORKSPACE_RAILS.right - 480);
}

export function workspaceLimits(state, width, height) {
  const available = horizontalCapacity(width);
  const vertical = verticalCapacity(height);
  // These are the stable product-level ranges shown by controls. The accepted
  // value limit is resolved separately against the opposite side's current
  // value, so a single resize never rewrites the other side's value.
  return Object.freeze({
    left: Math.min(WORKSPACE_MAXIMUMS.left, available - WORKSPACE_MINIMUMS.right),
    right: Math.min(WORKSPACE_MAXIMUMS.right, available - WORKSPACE_MINIMUMS.left),
    top: Math.min(WORKSPACE_MAXIMUMS.top, vertical - WORKSPACE_MINIMUMS.voice),
    voice: Math.min(WORKSPACE_MAXIMUMS.voice, vertical - WORKSPACE_MINIMUMS.top),
  });
}

export function workspaceCapacity(state, side, width, height) {
  const available = side === "left" || side === "right" ? horizontalCapacity(width) : verticalCapacity(height);
  const other = side === "left" ? state.rightWidth
    : side === "right" ? state.leftWidth
      : side === "top" ? state.voiceHeight : state.topHeight;
  return available - other;
}

export function workspaceValueLimits(state, width, height) {
  const limits = workspaceLimits(state, width, height);
  return Object.freeze(Object.fromEntries(Object.keys(WORKSPACE_SIZE_KEYS).map(side =>
    [side, Math.max(WORKSPACE_MINIMUMS[side], Math.min(limits[side], workspaceCapacity(state, side, width, height)))])));
}

export function workspaceResizeValue(state, side, value, width, height) {
  return Math.round(Math.max(WORKSPACE_MINIMUMS[side], Math.min(value, workspaceValueLimits(state, width, height)[side])));
}

export function workspaceSizes(state) {
  return Object.fromEntries(Object.values(WORKSPACE_SIZE_KEYS).map(key => [key, state[key]]));
}

// Window adaptation is a pure projection. The owner keeps preferred sizes so a
// temporary small window cannot permanently replace the user's larger sizes.
export function constrainWorkspace(preferences, width, height) {
  const state = { ...preferences };
  const available = horizontalCapacity(width);
  const limits = workspaceLimits(state, width, height);
  state.leftWidth = Math.max(WORKSPACE_MINIMUMS.left, Math.min(limits.left, state.leftWidth));
  state.rightWidth = Math.max(WORKSPACE_MINIMUMS.right, Math.min(limits.right, state.rightWidth));
  if (state.leftWidth + state.rightWidth > available) {
    if (preferences.leftWidth === preferences.rightWidth) {
      const side = Math.floor(available / 2);
      state.leftWidth = Math.max(WORKSPACE_MINIMUMS.left, Math.min(limits.left, side));
      state.rightWidth = Math.max(WORKSPACE_MINIMUMS.right, Math.min(limits.right, side));
    } else {
      state.rightWidth = Math.max(WORKSPACE_MINIMUMS.right, Math.min(limits.right, available - state.leftWidth));
      state.leftWidth = Math.max(WORKSPACE_MINIMUMS.left, Math.min(limits.left, available - state.rightWidth));
    }
  }
  state.topHeight = Math.max(WORKSPACE_MINIMUMS.top, Math.min(limits.top, state.topHeight ?? WORKSPACE_DEFAULT_SIZES.top));
  state.voiceHeight = Math.max(WORKSPACE_MINIMUMS.voice, Math.min(limits.voice, state.voiceHeight));
  const vertical = verticalCapacity(height);
  if (state.topHeight + state.voiceHeight > vertical) {
    // Equal preferences remain visually paired when a short host has to
    // shrink both bands. Deliberately different user sizes stay independent.
    if (preferences.topHeight === preferences.voiceHeight) {
      const paired = Math.floor(vertical / 2);
      state.topHeight = Math.max(WORKSPACE_MINIMUMS.top, Math.min(limits.top, paired));
      state.voiceHeight = Math.max(WORKSPACE_MINIMUMS.voice, Math.min(limits.voice, paired));
    } else {
      state.voiceHeight = Math.max(WORKSPACE_MINIMUMS.voice, Math.min(limits.voice, vertical - state.topHeight));
      state.topHeight = Math.max(WORKSPACE_MINIMUMS.top, Math.min(limits.top, vertical - state.voiceHeight));
    }
  }
  return state;
}
