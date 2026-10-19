import { createWorkspaceViewState } from "./workspace-view-state.js";

// Owns view coordinates and scroll compensation independently of layout and document state.
export function createStageViewport({ shell, stage, scroll, paper, view, execute }) {
  const ownedView = view ? null : createWorkspaceViewState();
  view ??= ownedView;
  let width = null;
  let origin = null;
  let zoomValue = view?.read.snapshot().zoom ?? 100;
  let disposed = false;
  let remembered = null;
  let rememberedWindow = null;
  let suspended = false;
  let recenterOnResume = false;
  let initialized = false;
  let wheelRemainder = 0;

  function pan() {
    const rect = stage.getBoundingClientRect();
    const x = origin.x - rect.x, y = origin.y - rect.y;
    // Layout padding is quantized by the browser. Keep its integer extent
    // conservative and carry the fractional remainder in the existing transform.
    const left = Math.max(0, Math.ceil(x)), top = Math.max(0, Math.ceil(y));
    shell.style.setProperty("--paper-left", left + "px");
    shell.style.setProperty("--paper-top", top + "px");
    shell.style.setProperty("--paper-pan-x", x - left + "px");
    shell.style.setProperty("--paper-pan-y", y - top + "px");
  }

  function position(recenter = false) {
    const rect = stage.getBoundingClientRect();
    if (width == null) {
      // Fit against the actual stage viewport. The previous calculation used
      // the window center, which can fall outside a narrow stage after a
      // sidebar is open and collapse the paper to a few pixels.
      width = Math.round(700 * zoomValue / 100);
    }
    const centeredX = rect.x + Math.max(20, (rect.width - width) / 2);
    origin ??= { x: centeredX, y: rect.y + 20 };
    if (recenter) origin.x = centeredX;
    shell.style.setProperty("--paper-width", width + "px");
    pan();
  }

  function capture() {
    const rect = paper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    // Hidden ancestors have zero browser geometry. They cannot become a
    // reading baseline, even while the frame still needs to settle its lanes.
    if (!(rect.width > 0 && stageRect.width > 0 && stageRect.height > 0)) return null;
    return { x: rect.x, y: rect.y, width: rect.width, scrollX: scroll.scrollLeft, scrollY: scroll.scrollTop };
  }

  function remember() {
    const next = capture();
    if (suspended || !next) return;
    remembered = next;
    rememberedWindow = { width: innerWidth, height: innerHeight };
  }
  function preserve(update, { recenter = false } = {}) {
    if (disposed) return;
    const measured = capture();
    const previous = (recenter || suspended || !measured) && remembered ? remembered : measured;
    update();
    if (!capture()) {
      if (!suspended && previous) {
        remembered = previous;
        rememberedWindow = { width: innerWidth, height: innerHeight };
      }
      suspended = true;
      recenterOnResume ||= recenter;
      return;
    }
    restore(previous ?? capture(), recenter || recenterOnResume);
    suspended = recenterOnResume = false;
    remember();
  }
  function onScroll() {
    // Native scroll may clamp before resize fires. Do not replace the preceding screen position
    // with that automatic clamp; genuine scrolling in the same window updates the view baseline.
    if (rememberedWindow?.width === innerWidth && rememberedWindow?.height === innerHeight) remember();
  }
  scroll.addEventListener("scroll", onScroll, { passive: true });

  function onViewChange() {
    if (disposed) return;
    const next = view.read.snapshot().zoom;
    wheelRemainder = 0;
    if (next === zoomValue) return;
    if (!initialized) { zoomValue = next; return; }
    preserve(() => { zoomValue = next; width = null; }, { recenter: true });
  }
  const stopView = view?.read.subscribe(onViewChange) ?? (() => {});

  function onWheel(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    // Normalize line/page wheels to pixels; preserve high-resolution motion
    // instead of converting every event to the same five-percent jump.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1;
    if (!Number.isFinite(event.deltaY) || !Number.isFinite(unit)) return;
    const requested = wheelRemainder - event.deltaY * unit * 0.05;
    const delta = Math.trunc(requested * 10 + Math.sign(requested) * 1e-8) / 10;
    if (!delta) { wheelRemainder = requested; return; }
    const result = execute ? execute("frame.workspace.view.zoomBy", { delta }) : view.adjustZoom(delta);
    wheelRemainder = result?.ok && result.changed !== false ? requested - delta : 0;
  }
  scroll.addEventListener("wheel", onWheel, { passive: false });

  function restore(previous, recenter = false) {
    position(recenter);
    const rect = paper.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const centeredX = stageRect.x + Math.max(20, (stageRect.width - rect.width) / 2);
    const targetX = recenter ? centeredX : previous.x + (previous.width - rect.width) / 2;
    // Express preserved screen coordinates against the current stage's normal
    // origin. Region compensation can then shrink again instead of becoming
    // a permanent padding/scroll pair and leaving blank space at the start.
    origin.x = Math.max(centeredX, targetX);
    origin.y = Math.max(stageRect.y + 20, previous.y);
    const scrollX = origin.x - targetX;
    const scrollY = origin.y - previous.y;
    shell.style.setProperty("--paper-scroll-width", scrollX > 0 ? Math.ceil(scroll.clientWidth + scrollX) + "px" : "0px");
    shell.style.setProperty("--paper-scroll-height", scrollY > 0 ? Math.ceil(scroll.clientHeight + scrollY) + "px" : "0px");
    pan();
    scroll.scrollLeft = scrollX;
    scroll.scrollTop = scrollY;
    // Native scrolling can round CSS coordinates. Retain only that residual
    // in the origin so fractional geometry still preserves the screen rect.
    origin.x += scroll.scrollLeft - scrollX;
    origin.y += scroll.scrollTop - scrollY;
    pan();
  }

  function fitZoom(mode) {
    const rect = stage.getBoundingClientRect();
    const availableWidth = mode === "page"
      ? Math.min(rect.width - 40, (rect.height - 40) * 700 / 990) : rect.width - 40;
    const fitWidth = Math.max(80, Math.floor(availableWidth));
    return Math.min(400, Math.max(25, Math.floor((fitWidth / 7) * 10) / 10));
  }

  // Preserve the old no-argument complete-page entry. Reading controls opt in to width.
  function fit(mode = "page") {
    if (disposed) return { ok: false, code: "view.disposed" };
    if (mode !== "width" && mode !== "page") return { ok: false, code: "view.invalid-fit-mode" };
    const rect = stage.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return { ok: false, code: "view.unmeasurable" };
    const result = view.setZoom(fitZoom(mode));
    // An explicit fit presents the page from its beginning, even if zoom was
    // already at this value. Ordinary zoom/layout changes preserve reading Y.
    if (initialized) {
      origin = { x: rect.x + Math.max(20, (rect.width - width) / 2), y: rect.y + 20 };
      shell.style.setProperty("--paper-scroll-width", "0px");
      shell.style.setProperty("--paper-scroll-height", "0px");
      scroll.scrollLeft = scroll.scrollTop = 0;
      position(true); remember();
    }
    return result;
  }

  return Object.freeze({
    initialize() {
      view.setZoom(fitZoom("width"));
      zoomValue = view.read.snapshot().zoom;
      position(); remember(); initialized = true;
    },
    preserve,
    zoom(value) {
      if (disposed) return { ok: false, code: "view.disposed" };
      // Historical standalone callers use "fit" to mean a complete page.
      if (value === "fit") return fit("page");
      return view.setZoom(value);
    },
    zoomBy(delta) {
      if (disposed) return { ok: false, code: "view.disposed" };
      return view.adjustZoom(delta);
    },
    fit,
    zoomValue: () => zoomValue,
    dispose() { disposed = true; stopView(); ownedView?.dispose(); scroll.removeEventListener("scroll", onScroll); scroll.removeEventListener("wheel", onWheel); },
  });
}
