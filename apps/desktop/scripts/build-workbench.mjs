import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workbench = fileURLToPath(new URL("../../workbench/", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; build the desktop host through npm");

const child = spawn(process.execPath, [npmCli, "run", "build"], {
  cwd: workbench,
  env: { ...process.env, BRILLIANT_DESKTOP_HOST: "1", VITE_BRILLIANT_DESKTOP: "1" },
  stdio: "inherit",
  windowsHide: true,
});
child.once("error", (error) => {
  console.error(`Unable to build workbench: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
