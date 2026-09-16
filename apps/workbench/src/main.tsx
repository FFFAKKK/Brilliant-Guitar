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

const root = document.getElementById("root");
if (!root) throw new Error("Missing workbench root element");

createRoot(root).render(
  <StrictMode>
    <WorkbenchApp />
  </StrictMode>,
);
