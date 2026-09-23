import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WorkbenchApp } from "./workbench-app";
import "./styles/theme.css";
import "./styles/workbench.css";
import "./styles/shared-dock.css";
import "./styles/paper-zoom.css";
import "./styles/history-control.css";
import "./styles/note-control.css";
import "./styles/preferences.css";
import "./styles/playback-transport.css";
import "./styles/component-placement.css";
import "./styles/playback-output.css";
import "./styles/agent-recovery.css";
import {
  initializeWorkbenchPluginPreview,
  markWorkbenchPluginStartupStable,
} from "./ui/workbench-plugins.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Missing workbench root element");
const rootElement = root;

function mount(): void {
  createRoot(rootElement).render(
    <StrictMode>
      <WorkbenchApp />
    </StrictMode>,
  );
  const markStable = () => { void markWorkbenchPluginStartupStable(); };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(markStable);
  else markStable();
}

void Promise.resolve()
  .then(initializeWorkbenchPluginPreview)
  .then(mount, mount);
