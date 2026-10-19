// Decides how each dock is expressed for the current window size. Pure function, no DOM.
// "expanded": full panel; "rail": auto-narrowed to an icon rail. User-closed docks are a separate state.
export const MIN_STAGE_WIDTH = 520;
export const MIN_STAGE_HEIGHT = 300;
export const RAIL_WIDTH = 44;
export const RAIL_HEIGHT = 36;

export function dockModes({ width, height, frameHeight, layout, occupied }) {
  const modes = {};
  const side = (name) => (occupied[name] && layout.docks[name].open ? layout.docks[name].size : 0);
  // Right yields first: assistant-style tools are the least tied to continuous input.
  let used = side("left") + side("right");
  modes.right = occupied.right ? "expanded" : "empty";
  modes.left = occupied.left ? "expanded" : "empty";
  if (width - used < MIN_STAGE_WIDTH && side("right")) { modes.right = "rail"; used = side("left") + RAIL_WIDTH; }
  if (width - used < MIN_STAGE_WIDTH && side("left")) modes.left = "rail";

  const top = occupied.top && layout.docks.top.open ? layout.docks.top.size : 0;
  const bottom = side("bottom");
  modes.top = occupied.top ? "expanded" : "empty";
  modes.bottom = occupied.bottom ? "expanded" : "empty";
  if (height - frameHeight - top - bottom < MIN_STAGE_HEIGHT && bottom) modes.bottom = "rail";
  return modes;
}
