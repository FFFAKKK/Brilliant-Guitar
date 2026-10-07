import { fileURLToPath } from "node:url";
import { StandaloneAgentHost } from "./agent-host.ts";
import { createStandaloneServer } from "./http-server.ts";

const development = process.argv.includes("--dev");
const host = new StandaloneAgentHost();
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
