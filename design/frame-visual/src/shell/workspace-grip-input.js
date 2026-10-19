// Move the divider in the key direction, matching the pointer resize geometry.
const deltas = Object.freeze({
  left: Object.freeze({ ArrowLeft: -4, ArrowRight: 4 }),
  right: Object.freeze({ ArrowLeft: 4, ArrowRight: -4 }),
  top: Object.freeze({ ArrowUp: -4, ArrowDown: 4 }),
  voice: Object.freeze({ ArrowUp: 4, ArrowDown: -4 }),
});
export function workspaceGripKeyDelta(side, key) {
  return Object.hasOwn(deltas, side) && Object.hasOwn(deltas[side], key) ? deltas[side][key] : null;
}
