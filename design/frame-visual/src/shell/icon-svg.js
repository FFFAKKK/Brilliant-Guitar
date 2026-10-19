import { FRAME_UI_ATTRIBUTE } from "../runtime/style-boundary.js";

// Both bundled glyph catalogs use this shell-owned SVG envelope. The marker
// opts into block layout without applying frame styles to private plugin SVGs.
export function renderIconSvg(content, size) {
  return `<svg ${FRAME_UI_ATTRIBUTE}="" class="icon" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
