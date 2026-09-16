import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = "http://127.0.0.1:5173/";

async function workbenchIsRunning() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

if (await workbenchIsRunning()) {
  console.log(`Reusing workbench dev server at ${url}`);
  process.exit(0);
}

const workbench = fileURLToPath(new URL("../../workbench/", import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath is unavailable; start the desktop host through npm");
const child = spawn(process.execPath, [npmCli, "run", "dev"], {
  cwd: workbench,
  env: { ...process.env, BRILLIANT_DESKTOP_HOST: "1", VITE_BRILLIANT_DESKTOP: "1" },
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`Unable to start workbench dev server: ${error.message}`);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
