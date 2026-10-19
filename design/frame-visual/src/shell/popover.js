// One transient surface at a time. Closes on outside press or Escape and returns focus to its anchor.
import { h } from "./dom.js";
import { isPlainKey } from "../host/focus-boundary.js";

let current = null;

export function closePopover({ restoreFocus = true } = {}) {
  if (!current) return;
  const { panel, anchor, cleanup, onClose } = current;
  current = null;
  cleanup();
  anchor.setAttribute("aria-expanded", "false");
  panel.remove();
  onClose?.();
  if (restoreFocus) anchor.focus({ preventScroll: true });
}

export function openPopover(anchor, content, { label, align = "start", onClose, role = "dialog", className = "popover", constrainToViewport = false } = {}) {
  if (current?.anchor === anchor) { closePopover(); return null; }
  closePopover({ restoreFocus: false });
  const panel = h("div", { class: className, role, "aria-label": role === "presentation" ? null : label }, content);
  document.body.append(panel);
  const box = anchor.getBoundingClientRect();
  const width = panel.offsetWidth ?? panel.getBoundingClientRect().width;
  const left = align === "end" ? box.right - width : box.left;
  panel.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, left))}px`;
  const height = panel.offsetHeight ?? panel.getBoundingClientRect().height;
  panel.style.top = `${constrainToViewport ? Math.max(8, Math.min(innerHeight - height - 8, box.bottom + 6)) : box.bottom + 6}px`;
  // Inline feedback can grow after opening. Keep that growth in this surface's
  // own scroll area without moving its anchor or the workspace.
  if (constrainToViewport) panel.style.maxHeight = `${Math.max(0, innerHeight - Number.parseFloat(panel.style.top) - 8)}px`;
  panel.style.transformOrigin = align === "end" ? "top right" : "top left";
  anchor.setAttribute("aria-expanded", "true");
  const onPointer = (event) => { if (current?.panel === panel && !panel.contains(event.target) && !anchor.contains(event.target)) closePopover({ restoreFocus: false }); };
  const onKey = (event) => { if (current?.panel === panel && event.key === "Escape" && isPlainKey(event)) { event.stopPropagation(); closePopover(); } };
  document.addEventListener("pointerdown", onPointer, true);
  panel.addEventListener("keydown", onKey);
  current = { panel, anchor, onClose, cleanup() { document.removeEventListener("pointerdown", onPointer, true); panel.removeEventListener("keydown", onKey); } };
  panel.querySelector("button, [tabindex='0']")?.focus({ preventScroll: true });
  return panel;
}

export const popoverAnchor = () => current?.anchor ?? null;
