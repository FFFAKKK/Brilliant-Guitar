// Shell-owned icons on a 20px grid, 1.5px stroke. Components bring their own icons.
import { renderIconSvg } from "./icon-svg.js";

const paths = {
  library: '<rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2"/><rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2"/><rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2"/><path d="M13.75 11v5.5M11 13.75h5.5"/>',
  layout: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 7.5h14M7.5 7.5V16"/>',
  bell: '<path d="M6 13.5V9a4 4 0 0 1 8 0v4.5l1.2 1.5H4.8z"/><path d="M8.5 17h3"/>',
  close: '<path d="M6 6l8 8M14 6l-8 8"/>',
  minimize: '<path d="M5 10h10"/>',
  maximize: '<rect x="5" y="5" width="10" height="10" rx="1"/>',
  chevron: '<path d="M7 8.5l3 3 3-3"/>',
  more: '<circle cx="5.5" cy="10" r=".9"/><circle cx="10" cy="10" r=".9"/><circle cx="14.5" cy="10" r=".9"/>',
  collapseLeft: '<path d="M12 6l-4 4 4 4"/>',
  collapseRight: '<path d="M8 6l4 4-4 4"/>',
  collapseDown: '<path d="M6 8l4 4 4-4"/>',
  reset: '<path d="M4.5 10a5.5 5.5 0 1 0 1.7-4"/><path d="M4.5 4v3h3"/>',
};

export function icon(name, size = 18) {
  return renderIconSvg(paths[name] ?? "", size);
}
