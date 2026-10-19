import { isPlainKey, isUnavailable, pathFrom } from "../host/focus-boundary.js";

// Only these frame-owned reading surfaces participate. Plugin descendants opt in
// through their own contracts; this adapter never annotates them recursively.
const READING_SURFACES = ["v-page-content", "v-layout-content", "v-review-content", "v-modules", "v-rail-list",
  "v-layer-list", "ch-content", "ch-fixed", "hs-voice-scroll", "hs-voice-fixed", "fr-details-body"];
const own = node => node?.getAttribute?.("data-frame-ui") != null;
const usable = node => node && !isUnavailable(pathFrom(node))
  && (!node.getClientRects || node.getClientRects().length > 0);
const sideOf = node => {
  const path = pathFrom(node), has = name => path.some(item => item.classList?.contains(name));
  return has("v-left") || has("v-icon-rail") ? "left" : has("v-right") || has("v-page-rail") ? "right"
    : has("v-top") ? "top" : has("v-footer") || has("v-voice-content") ? "voice" : "stage";
};

export function prepareFrameReading(root) {
  for (const name of READING_SURFACES) {
    for (const node of root.querySelectorAll("." + name)) {
      if (!own(node) || node.getAttribute("role") === "tablist") continue;
      if (!node.id) node.id = "frame-read-" + name + "-" + sideOf(node);
      node.dataset.frameReading = node.id;
      if (node.getAttribute("role") == null) node.setAttribute("role", "region");
      if (node.getAttribute("aria-label") == null) {
        node.dataset.frameReadingName = "true";
        const region = ({ left: "左侧栏", right: "右侧栏", voice: "下侧栏", top: "上侧栏", stage: "详情" })[sideOf(node)];
        node.setAttribute("aria-label", region + ({ "ch-fixed": "固定区", "v-rail-list": "图标入口浏览", "fr-details-body": "内容浏览" }[name] ?? "内容浏览"));
      }
      if (node.getAttribute("tabindex") == null || node.dataset.frameReadingAuto === "true") {
        node.dataset.frameReadingAuto = "true";
        node.tabIndex = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1 ? 0 : -1;
      }
    }
  }
  const stage = root.querySelector(".v-stage");
  if (own(stage)) stage.dataset.frameReading = "score-scroll";
}

export function readingKey(node, event) {
  if (!isPlainKey(event)) return false;
  const page = Math.max(40, node.clientHeight - 40);
  switch (event.key) {
    case "ArrowUp": node.scrollTop -= 40; break;
    case "ArrowDown": node.scrollTop += 40; break;
    case "PageUp": node.scrollTop -= page; break;
    case "PageDown": node.scrollTop += page; break;
    case "Home": node.scrollTop = 0; break;
    case "End": node.scrollTop = node.scrollHeight; break;
    case "ArrowLeft": node.scrollLeft -= 40; break;
    case "ArrowRight": node.scrollLeft += 40; break;
    default: return false;
  }
  event.preventDefault();
  return true;
}

// Nearest-edge exposure avoids jumping across a target larger than the viewport.
// Geometry may be absent in markup-only environments; never write NaN scroll offsets.
function revealDelta(start, end, leading, trailing) {
  if (![start, end, leading, trailing].every(Number.isFinite) || trailing <= leading) return 0;
  if (start < leading && end > trailing) return 0;
  const oversized = end - start > trailing - leading;
  if (start < leading) return oversized ? end - trailing : start - leading;
  if (end > trailing) return oversized ? start - leading : end - trailing;
  return 0;
}

export function revealFrameFocus(node) {
  if (!own(node) || !usable(node)) return;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (!own(parent) || !parent.dataset.frameReading || parent.id === "score-scroll") continue;
    const box = node.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
    const sticky = parent.querySelector("[data-frame-focus-inset]");
    const top = bounds.top + (own(sticky) && usable(sticky) && !sticky.contains(node) ? sticky.getBoundingClientRect().height : 0) + 4;
    const vertical = revealDelta(box.top, box.bottom, top, bounds.bottom - 4);
    const horizontal = revealDelta(box.left, box.right, bounds.left + 4, bounds.right - 4);
    if (vertical) parent.scrollTop += vertical;
    if (horizontal) parent.scrollLeft += horizontal;
  }
}

export function installFrameReading(root, options = {}) {
  root.addEventListener("keydown", event => {
    const node = event.target;
    if (!own(node) || !node.dataset.frameReading) return;
    const scroller = root.ownerDocument.getElementById(node.dataset.frameReading);
    if (scroller) readingKey(scroller, event);
  }, options);
  root.addEventListener("focusin", event => {
    if (event.target.matches?.(":focus-visible")) revealFrameFocus(event.target);
  }, options);
}

// Fixture redraws replace nodes. Retain identity by id, then label within the
// same region. A vanished control returns to a local opener or the score stage.
export function captureFrameFocus(root) {
  const previous = root.ownerDocument.activeElement;
  if (!root.contains(previous) || !own(previous)) return () => {};
  const id = previous.id, label = previous.getAttribute("aria-label"), side = sideOf(previous), tag = previous.tagName;
  const fallbackId = previous.getAttribute("data-frame-focus-fallback");
  return () => {
    const identified = id ? root.ownerDocument.getElementById(id) : null;
    let next = root.contains(identified) && own(identified) ? identified : null;
    if (!next && label) next = [...root.querySelectorAll("[data-frame-ui]")].find(node =>
      node.tagName === tag && node.getAttribute("aria-label") === label && sideOf(node) === side && usable(node));
    if (!usable(next) && fallbackId) {
      const fallback = root.ownerDocument.getElementById(fallbackId);
      if (root.contains(fallback) && own(fallback)) next = fallback;
    }
    if (!usable(next)) {
      const openerId = { left: "#module-panel-trigger", voice: "#voice-trigger", top: "#layout-top" }[side];
      const opener = side === "right" ? root.querySelector(".v-page-rail")?.querySelector('[aria-selected="true"]')
        : openerId ? root.querySelector(openerId) : null;
      next = [root.querySelector('[id="region-' + side + '"]'), opener,
        root.querySelector(".v-stage")].find(node => own(node) && usable(node));
    }
    if (usable(next)) { next.focus({ preventScroll: true }); revealFrameFocus(next); }
  };
}
