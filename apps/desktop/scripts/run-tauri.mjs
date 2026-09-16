import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cargoBin = join(homedir(), ".cargo", "bin");
const environment = {
  ...process.env,
  PATH: `${cargoBin}${delimiter}${process.env.PATH ?? ""}`,
};
const desktop = fileURLToPath(new URL("../", import.meta.url));
const cli = fileURLToPath(new URL("../node_modules/@tauri-apps/cli/tauri.js", import.meta.url));

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: desktop,
  env: environment,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`Unable to start Tauri: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
