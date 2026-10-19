// Internal skin opt-in for a single framework-created node, never its arbitrary descendants.
export const FRAME_UI_ATTRIBUTE = "data-frame-ui";

export function markFrameUi(element) {
  element.setAttribute(FRAME_UI_ATTRIBUTE, "");
  return element;
}
