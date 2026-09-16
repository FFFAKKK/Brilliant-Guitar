import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const app = fileURLToPath(new URL("../", import.meta.url));
const compiler = fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url));
const compiled = spawnSync(process.execPath, [compiler, "-p", "tsconfig.kernel.json"], { cwd: app, stdio: "inherit" });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
// This isolated host build never cleans or overwrites the kernel team's dist/addon.
mkdirSync(new URL("../.kernel/", import.meta.url), { recursive: true });
writeFileSync(new URL("../.kernel/package.json", import.meta.url), '{"type":"commonjs"}\n');
