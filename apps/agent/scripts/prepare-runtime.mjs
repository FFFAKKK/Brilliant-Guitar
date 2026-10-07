import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = new URL("../../../packages/agent-runtime/", import.meta.url);
const compiler = fileURLToPath(new URL("node_modules/typescript/bin/tsc", root));
const result = spawnSync(process.execPath, [compiler, "-p", "tsconfig.json"], { cwd: fileURLToPath(root), stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const installed = new URL("../node_modules/@brilliant-guitar/agent-runtime/", import.meta.url);
if (!existsSync(installed)) throw new Error("Install standalone Agent dependencies first.");
cpSync(new URL("dist/", root), new URL("dist/", installed), { recursive: true });
cpSync(new URL("package.json", root), new URL("package.json", installed));
