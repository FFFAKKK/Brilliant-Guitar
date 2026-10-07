import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { StandaloneAgentHost } from "./agent-host.ts";
import { createStandaloneServer } from "./http-server.ts";
import { FileConnectionSettingsStore } from "./connection-store.ts";
import { FileSessionStore } from "./session-store.ts";

const development = process.argv.includes("--dev");
const dataIndex = process.argv.indexOf("--data-dir");
if (dataIndex >= 0 && (!process.argv[dataIndex + 1] || process.argv[dataIndex + 1]!.startsWith("--"))) throw new Error("Agent data directory is missing");
const dataDirectory = resolve(dataIndex >= 0 ? process.argv[dataIndex + 1]! : ".agent-data");
const host = await StandaloneAgentHost.open({ settingsStore: new FileConnectionSettingsStore(dataDirectory), sessionStore: new FileSessionStore(dataDirectory) });
const appRoot = fileURLToPath(new URL("../../", import.meta.url));
const vite = development ? await (await import("vite")).createServer({ root: appRoot, server: { middlewareMode: true }, appType: "spa" }) : null;
const server = createStandaloneServer({ host, ...(vite ? { middleware: vite.middlewares } : { clientDirectory: fileURLToPath(new URL("../client/", import.meta.url)) }) });
const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8787;
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Agent port is invalid");
server.on("error", (error) => { console.error(error.message); process.exitCode = 1; void host.dispose(); });
server.listen(port, "127.0.0.1", () => console.log(`Agent: http://127.0.0.1:${port}`));
let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await host.dispose();
  await vite?.close();
  server.closeAllConnections();
  server.close();
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
