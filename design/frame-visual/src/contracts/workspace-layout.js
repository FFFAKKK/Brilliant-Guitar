// Public backup UI contract. Handlers and authoritative state remain in the host.
export const WORKSPACE_LAYOUT_CONTRACT_VERSION = 1;
export const WORKSPACE_COMMANDS = Object.freeze({
  region: "frame.workspace.region.toggle",
  configureRegion: "frame.workspace.region.configure",
  resize: "frame.workspace.region.resize",
  arrange: "frame.workspace.arrange",
  page: "frame.workspace.page.select",
  step: "frame.workspace.page.step",
  begin: "frame.workspace.adjust.begin",
  finish: "frame.workspace.adjust.finish",
  zoom: "frame.workspace.view.zoom",
  zoomBy: "frame.workspace.view.zoomBy",
  fit: "frame.workspace.view.fit",
});
export const SIDEBAR_COMMANDS = Object.freeze({
  move: "frame.sidebar.panel.move",
  enabled: "frame.sidebar.panel.enabled",
  reorder: "frame.sidebar.panel.reorder",
});
export const WORKSPACE_ZOOM_MIN = 25;
export const WORKSPACE_ZOOM_MAX = 400;
export const WORKSPACE_ZOOM_STEP = 0.1;
export function isWorkspaceZoomValue(value) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= WORKSPACE_ZOOM_MIN && numeric <= WORKSPACE_ZOOM_MAX;
}

// Shape checking is done once at the injection boundary. No store/router or
// extra source methods escape. Each consumer owns its subscriptions.
export function captureLayoutReadPorts({ layout, contents, actions, view } = {}) {
  const capture = (source, name, required = false) => {
    if (source == null) {
      if (required) throw new TypeError(`Missing layout read port: ${name}`);
      return null;
    }
    if (typeof source.snapshot !== "function" || typeof source.subscribe !== "function") {
      throw new TypeError(`Invalid layout read port: ${name}`);
    }
    return Object.freeze({
      snapshot: () => source.snapshot(),
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError(`Invalid ${name} listener`);
        let active = true;
        const stop = source.subscribe(snapshot => { if (active) return listener(snapshot); });
        if (typeof stop !== "function") { active = false; throw new TypeError(`Invalid ${name} subscription disposer`); }
        return () => { if (active) { active = false; stop(); } };
      },
    });
  };
  return Object.freeze({ layout: capture(layout, "layout", true), contents: capture(contents, "contents"),
    actions: capture(actions, "actions"), view: capture(view, "view") });
}
