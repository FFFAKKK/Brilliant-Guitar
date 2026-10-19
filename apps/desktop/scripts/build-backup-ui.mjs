import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reuse the backup UI's builder; no legacy React UI build or development server.
const entry = fileURLToPath(new URL("../../../design/frame-visual/scripts/build-desktop.mjs", import.meta.url));
const notation = fileURLToPath(new URL("./build-notation-module.mjs", import.meta.url));
async function run(script) {
  await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,[script],{stdio:"inherit",windowsHide:true});
    child.once("error",reject);
    child.once("exit",(code,signal)=>code === 0 ? resolve() : reject(new Error(`${script} failed: ${signal ?? code}`)));
  });
}
await run(notation);
await run(entry);
