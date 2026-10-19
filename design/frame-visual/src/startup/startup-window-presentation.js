/** The window port completes before DOM visibility changes and viewport mounting. */
export function createStartupWindowPresentation({ root, workspaceRoot, windowPort }) {
  const document = root.ownerDocument;
  if (workspaceRoot.ownerDocument !== document || typeof windowPort?.present !== "function") throw new TypeError("启动视图需要同文档root与窗口端口");
  let active = true;
  return Object.freeze({
    async showView(mode) {
      if (!active) throw new Error("启动视图已释放");
      if (!["welcome", "workspace"].includes(mode)) throw new Error("未知启动视图");
      await windowPort.present(mode);
      if (!active) throw new Error("启动视图已释放");
      root.hidden = mode !== "welcome"; workspaceRoot.hidden = mode !== "workspace";
      if (mode === "workspace") document.body.classList.add("startup-workspace-active");
      else document.body.classList.remove("startup-workspace-active");
      document.defaultView?.dispatchEvent(new Event("resize"));
    },
    dispose() { active = false; document.body.classList.remove("startup-workspace-active"); windowPort.dispose(); },
  });
}
