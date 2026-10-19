import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import "./build-animation-contract.mjs";
import { classicNotationAssetPlugin } from "./classic-notation-asset.mjs";

const base = new URL("../", import.meta.url);
// Source labels/resolution must not vary with npm, desktop hooks or caller cwd.
const workingDirectory = fileURLToPath(base);
const check = process.argv.includes("--check");
// The one formal platform/SDK implementation, compiled for the backup browser entry.
const platform = await build({
  absWorkingDir: workingDirectory,
  stdin: { contents: 'export { PluginPlatform } from "./src/plugins/plugin-platform.ts"; export { definePlugin, isPluginPackage } from "./src/plugins/plugin-sdk.ts"; export { createMountContributionHost } from "./src/plugins/plugin-mount-host.ts"; export { WorkbenchFeatureRegistry, captureUiPluginManifest } from "./src/ui/plugin-manifest.ts";',
    resolveDir: fileURLToPath(new URL("../../apps/workbench/", base)), sourcefile: "backup-plugin-platform-entry.ts" },
  bundle: true, format: "esm", target: "es2022", write: false, legalComments: "inline",
  banner: { js: "// Generated from the formal plugin platform and SDK. Run npm run startup:build; do not edit." },
});
const platformOutput = new URL("src/vendor/plugin-platform.js", base);
if (check) {
  if (await readFile(platformOutput, "utf8") !== platform.outputFiles[0].text) throw new Error("Formal platform bridge is stale; run npm run startup:build");
} else await writeFile(platformOutput, platform.outputFiles[0].text);
// Compile the existing desktop service, rather than reimplement IPC names/error decoding.
const desktop = await build({
  absWorkingDir: workingDirectory,
  define: { "import.meta.env.VITE_BRILLIANT_DESKTOP": JSON.stringify("1") },
  stdin: { contents: 'export { TauriPluginSettingsStorage } from "./src/services/workbench-host-bridge.ts"; export { isTauri } from "@tauri-apps/api/core"; export { createDesktopReadonlyScoreSession } from "./src/services/desktop-readonly-score-session.ts"; export { createReadonlyScoreDocumentSession } from "./src/services/readonly-score-document-session.ts"; export { createDesktopStartupWindow } from "./src/services/desktop-startup-window.ts";',
    resolveDir: fileURLToPath(new URL("../../apps/workbench/", base)), sourcefile: "backup-desktop-settings-entry.ts" },
  bundle: true, format: "esm", target: "es2022", write: false, legalComments: "inline",
  banner: { js: "// Generated from the existing workbench Tauri settings service. Run npm run startup:build." },
});
const desktopOutput = new URL("src/vendor/desktop-plugin-settings.js", base);
if (check) {
  if (await readFile(desktopOutput, "utf8") !== desktop.outputFiles[0].text) throw new Error("Desktop settings bridge is stale; run npm run startup:build");
} else await writeFile(desktopOutput, desktop.outputFiles[0].text);
const result = await build({
  absWorkingDir: workingDirectory,
  entryPoints: [fileURLToPath(new URL("src/plugin-startup-entry.js", base))],
  bundle: true, format: "iife", target: "es2022", write: false, legalComments: "inline",
  banner: { js: "// Generated backup startup preview. Run npm run startup:build; edit src, not this bundle." },
  plugins: [classicNotationAssetPlugin()],
});
const output = new URL("vendor/plugin-startup-preview.js", base);
if (check) {
  if (await readFile(output, "utf8") !== result.outputFiles[0].text) throw new Error("Startup preview bundle is stale; run npm run startup:build");
} else {
  await mkdir(new URL("vendor/", base), { recursive: true });
  await writeFile(output, result.outputFiles[0].text);
}
console.log(`Startup preview ${check ? "verified" : "built"}: ${result.outputFiles[0].contents.length} bytes; existing desktop bridge ${desktop.outputFiles[0].contents.length} bytes`);
