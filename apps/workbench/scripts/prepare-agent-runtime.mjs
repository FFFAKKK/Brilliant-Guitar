import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const runtime = fileURLToPath(new URL("../../../packages/agent-runtime/", import.meta.url));
const compiler = fileURLToPath(new URL("../../../packages/agent-runtime/node_modules/typescript/bin/tsc", import.meta.url));
const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], { cwd: runtime, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const installed = new URL("../node_modules/@brilliant-guitar/agent-runtime/", import.meta.url);
if (!existsSync(installed)) throw new Error("Install Workbench dependencies before building the Agent runtime.");
// npm's install-links avoids Windows symlink privileges. Refresh generated output only.
cpSync(new URL("../../../packages/agent-runtime/dist/", import.meta.url), new URL("dist/", installed), { recursive: true });
cpSync(new URL("../../../packages/agent-runtime/package.json", import.meta.url), new URL("package.json", installed));
