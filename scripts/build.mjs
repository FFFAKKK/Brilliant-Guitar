import { lstatSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const output = join(root, "dist");
// A build owns only this checkout's dist. Refuse links to other directories.
try {
  const entry = lstatSync(output);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`Refusing to clean non-directory or linked output: ${output}`);
  }
  if (realpathSync(output) !== output) {
    throw new Error(`Output resolves outside its expected location: ${output}`);
  }
  rmSync(output, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const result = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
