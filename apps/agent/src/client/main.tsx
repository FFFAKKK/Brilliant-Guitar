import { createRoot } from "react-dom/client";
import { AgentApp } from "./agent-app.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Agent root is missing");
createRoot(root).render(<AgentApp/>);
