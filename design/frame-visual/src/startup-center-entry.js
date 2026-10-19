import { mountStartupCenterVisual } from "./startup-center-preview.js";

const root = globalThis.document?.getElementById("launch-root");
if (root) {
  try {
    const preview = mountStartupCenterVisual({ root });
    const pagehide = event => {
      if (!event.persisted) { preview.dispose(); window.removeEventListener("pagehide", pagehide); }
    };
    window.addEventListener("pagehide", pagehide);
  } catch (error) {
    const message = document.createElement("p");
    message.setAttribute("role", "alert"); message.textContent = "启动中心预览加载失败：" + error.message;
    root.replaceChildren(message);
  }
}
